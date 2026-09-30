# ReachInbox – Full-stack Email Job Scheduler

A production-style email scheduler: an **Express + TypeScript API**, a **BullMQ worker** (Redis-backed delayed jobs – no cron),
**PostgreSQL** as the source of truth, **Elasticsearch** for search, **Ethereal** fake SMTP for delivery, **Slack OAuth** alerts
when hourly limits are hit, and a **React + Tailwind dashboard** (Google login) that follows the provided Figma.

```
┌────────────┐  /api (Vite proxy)  ┌──────────────┐  addBulk (jobId = emailId, delay)   ┌───────────┐
│  React UI  │ ──────────────────▶ │  Express API │ ──────────────────────────────────▶ │   Redis   │
│ (Vite/TS)  │ ◀────────────────── │              │                                     │  BullMQ   │
└────────────┘                     └──────┬───────┘                                     └─────┬─────┘
        ▲ Google OAuth / Slack OAuth      │ Prisma                                           │ delayed → active
        │                                 ▼                                                  ▼
        │                          ┌──────────────┐    status updates / idempotency    ┌──────────────┐  SMTP  ┌──────────┐
        │                          │  PostgreSQL  │ ◀───────────────────────────────── │ BullMQ Worker│ ─────▶ │ Ethereal │
        │                          └──────────────┘                                    │ (N parallel) │        └──────────┘
        │                          ┌──────────────┐          index on every change     │  Lua slot    │  webhook ┌───────┐
        └───── search ───────────▶ │Elasticsearch │ ◀───────────────────────────────── │  reservation │ ───────▶ │ Slack │
                                   └──────────────┘                                    └──────────────┘          └───────┘
```

---

## 1. Running it locally

### Prerequisites
- Node.js 20+ (tested on 22)
- Docker Desktop (for Postgres, Redis, Elasticsearch)

### 1.1 Infrastructure
```bash
docker compose up -d          # postgres:5432, redis:6379 (AOF on), elasticsearch:9200
```

### 1.2 Backend (API + worker)
```bash
cd backend
cp .env.example .env          # then fill in the values described in section 2
npm install
npx prisma migrate deploy     # creates the tables
npm run dev                   # API on http://localhost:4000  (+ Bull Board at /admin/queues)
npm run dev:worker            # in a second terminal – the BullMQ worker
```
The API and the worker are **separate processes**, so you can run several workers (or restart either one) independently.
Production build: `npm run build && npm start` / `npm run start:worker`.

### 1.3 Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

---

## 2. Configuration (`backend/.env`)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs the session cookie and OAuth `state`. Any long random string. |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` | Defaults match `docker-compose.yml`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (required for login). |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_BASE_URL` | Slack OAuth (rate-limit alerts). |
| `ETHEREAL_ACCOUNTS` / `ETHEREAL_SENDER_COUNT` | Sender pool (see 2.3). |
| `WORKER_CONCURRENCY` | Jobs processed in parallel per worker process (default **5**). |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum gap between two sends **from the same sender** (default **2000 ms**). |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hourly cap per sender, shared by all users/campaigns (default **200**). |
| `EMAIL_SEND_ATTEMPTS` | SMTP retries (exponential backoff, 5s base) before an email is marked `FAILED`. |
| `BULL_BOARD_USER` / `BULL_BOARD_PASS` | Optional basic-auth for the queue dashboard. |

### 2.1 Google OAuth
1. Google Cloud Console → *APIs & Services* → *Credentials* → **Create OAuth client ID** → *Web application*.
2. Authorized JavaScript origin: `http://localhost:5173`
3. Authorized redirect URI: **`http://localhost:4000/api/auth/google/callback`**
4. If the consent screen is in *Testing* mode, add your Google account under *Test users*.

### 2.2 Slack OAuth
1. https://api.slack.com/apps → **Create New App** → *From scratch*.
2. *OAuth & Permissions* → Bot token scope **`incoming-webhook`**.
3. Slack only accepts **HTTPS** redirect URLs, so expose the backend with a tunnel, e.g. `ngrok http 4000`,
   set `SLACK_REDIRECT_BASE_URL=https://<id>.ngrok-free.app` and add the redirect URL
   **`https://<id>.ngrok-free.app/api/slack/callback`** in the Slack app.
   (The OAuth `state` is a signed JWT carrying the user id, so the callback works even though it lands on the tunnel host.)
4. Copy *Client ID* / *Client Secret* into `.env`.

In the dashboard: click your profile card → **Connect Slack** → pick a channel → you get a "connected" message in that channel.
From then on every time a sender (or campaign) reaches its hourly cap, a message is posted there **immediately**.

### 2.3 Ethereal Email
Nothing to do by default: on first boot the API calls Ethereal's API and creates `ETHEREAL_SENDER_COUNT` (3) sender
accounts, stored in the `Sender` table so they are stable across restarts. The API log prints each account; log in at
https://ethereal.email/login with the credentials from the `Sender` table to see delivered mail. Every sent email also stores its
Ethereal **preview URL**, linked from the email detail page.
To use your own accounts instead: `ETHEREAL_ACCOUNTS=[{"user":"x@ethereal.email","pass":"...","name":"Sales"}]`.

---

## 3. Architecture

### 3.1 Data model (Postgres – source of truth)
`User` · `SlackIntegration` (1 per user) · `Sender` (SMTP identity) · `Campaign` (one Compose action) · `Email` (one row per recipient:
`status ∈ SCHEDULED | SENDING | SENT | FAILED`, `scheduledAt`, `slotAt`, `attempts`, `deferredCount`, `sentAt`, `messageId`, `previewUrl`).

### 3.2 How scheduling works
1. `POST /api/campaigns` validates the input (zod), de-dupes recipients and, **in one DB transaction**, creates the campaign and
   one `Email` row per recipient with `scheduledAt = startAt + i × delayBetweenEmails`.
2. After commit, one **BullMQ delayed job per email** is added with `addBulk` (pipelined in chunks of 500) using
   **`jobId = email.id`** and `delay = scheduledAt − now`. No cron anywhere – Redis holds the timers.
3. When a job becomes due the worker (`src/workers/emailProcessor.ts`):
   1. **Idempotency guards** – skips if the row is already `SENT`/`FAILED` or the Redis *sent-marker* exists.
   2. **Slot reservation** – an atomic Redis Lua script (see 3.4) either reserves a send slot or defers to the next hour.
      If the slot is in the future the job is `moveToDelayed(slot)` – it is **not failed and not dropped**.
   3. **Claim** – conditional `UPDATE … WHERE status IN (SCHEDULED, SENDING)` → `SENDING`.
   4. **Send** via the sender's pooled Nodemailer transport with a deterministic `Message-ID: <emailId@…>`.
   5. **Mark sent** – Redis marker (`email:sent:{id}`) first, then the DB row (`SENT`, `sentAt`, preview URL), then Elasticsearch.
   6. SMTP errors → retried with exponential backoff; after the last attempt the email becomes `FAILED` with the error message.

### 3.3 Persistence & restart safety
- **Jobs survive restarts**: delayed jobs live in Redis, which runs with **AOF (`appendfsync everysec`)** and `noeviction`.
  Stopping the API/worker (or Redis) does not lose anything; when a worker comes back, overdue jobs run immediately and future ones
  fire at their timestamp. Nothing restarts "from scratch" because each email is its own job with its own state.
- **Reconciliation on API boot** (`reconcileService.ts`): every `SCHEDULED`/`SENDING` email in Postgres is checked for a matching job;
  missing ones (Redis wiped, or a crash between DB commit and `addBulk`) are re-enqueued at `slotAt ?? scheduledAt`.
  Because `jobId = emailId`, re-adding is a no-op for jobs that already exist – reconciliation can run any number of times.
- **No duplicates**:
  - one job per email (`jobId`), BullMQ job locks (one worker at a time), stalled-job recovery for crashed workers;
  - status guard + conditional claim in Postgres;
  - Redis sent-marker written the instant SMTP accepts the message – if the process dies before the DB update,
    the retry sees the marker and only finishes the bookkeeping instead of re-sending;
  - slot reservations are stored per email (`rl:res:{emailId}`), so a re-run reuses its slot instead of consuming another.
  - The only unavoidable at-least-once window is "process killed *during* the SMTP call"; the deterministic `Message-ID`
    lets a real provider de-duplicate that case.

### 3.4 Rate limiting, throttling & concurrency
All limits are enforced by **one atomic Lua script in Redis** (`src/queue/rateLimiter.ts`), so they hold across any number of
worker processes and concurrency slots – no in-memory counters.

Keys: `rl:last:{sender}` (last reserved slot), `rl:s:{sender}:{hourWindow}`, `rl:c:{campaign}:{hourWindow}` (counters),
`rl:dq:{sender}:{hourWindow}` (deferral tickets), `rl:res:{email}` (granted slot).

```
slot = max(now, lastSlot(sender) + MIN_DELAY_BETWEEN_EMAILS_MS)      ← min delay between sends
w    = floor(slot / 1h)
if senderCount[w] < MAX_EMAILS_PER_HOUR_PER_SENDER and campaignCount[w] < campaign.hourlyLimit:
    reserve: INCR both counters, lastSlot = slot  → job is delayed until `slot`, then sends
else:
    ticket = INCR deferrals[sender][w+1]
    retry at start_of(w+1) + ticket ms            → job re-delayed to next hour window, keeps its place in line
```

- **Worker concurrency**: `WORKER_CONCURRENCY` (default 5) per process; run more worker processes to scale horizontally.
  Parallel jobs are safe because every shared decision (slot, counters, claim, sent-marker) is atomic in Redis or Postgres.
- **Delay between emails**: two layers –
  (a) the campaign's *Delay between 2 emails* spreads `scheduledAt` (start + i × delay);
  (b) the global per-sender `MIN_DELAY_BETWEEN_EMAILS_MS` (default **min 2 s between sends from the same sender**)
  is enforced by the slot timeline even when many campaigns share a sender.
- **Emails per hour**: per-sender cap from env (`MAX_EMAILS_PER_HOUR_PER_SENDER`, overridable per sender in the DB) **and** a
  per-campaign cap from the Compose form (*Hourly Limit*; 0 = sender cap only). Windows are fixed clock hours.
- **When a limit is reached** jobs are **never dropped or failed** – they are re-delayed to the next hour window. The ticket counter
  preserves the order in which they were deferred (FIFO per sender), and deferred jobs sort ahead of emails originally scheduled later
  in that hour. The UI shows them as *"· rate-limited"* with their new time, and `deferredCount` is tracked per email.
- **Why only reserve inside the current window?** A campaign that hits *its own* cap must not block other campaigns on the
  same sender. Reserving far-future slots would push the sender's shared timeline forward; deferring un-reserved keeps
  the sender available for everyone else.
- **Slack alert**: the moment a reservation consumes the last slot of a window (or a job is deferred because the window is full),
  the worker posts to the owner's Slack webhook. A Redis `SET NX` key per (user, sender/campaign, hour) guarantees **one message
  per window** even with many concurrent workers. The integration is read from the DB on every alert, so connect / disconnect /
  reconnect take effect immediately; no integration → no message, no error.

**Trade-offs**: fixed hour windows (simple, predictable) instead of a sliding window; min-gap is per sender, not global; ordering is
FIFO per sender at millisecond ticket granularity, and near-FIFO across concurrent workers.

### 3.5 Behaviour under load (1000+ emails at the same time)
- Scheduling 1000 recipients = 1 transaction + 2 pipelined `addBulk` calls (~150–900 ms locally).
- When they become due, workers pull them `WORKER_CONCURRENCY` at a time. Each Lua call is O(1) and hands out a **unique** slot
  `minGap` apart, so jobs are immediately re-delayed to their own slot – no thundering herd of retries.
- With the defaults (200/hour/sender, 2 s gap) the first 200 get slots over ~7 minutes in the current hour, the other 800 get
  tickets for the next hour and repeat the process there (200 per hour). Nothing is lost; everything is visible in Bull Board.
- Try it: `npm run load-test -- --count 1000 --in 30 --hourly 0` (uses the first logged-in user), then watch
  http://localhost:4000/admin/queues.

  Verified locally with `MAX_EMAILS_PER_HOUR_PER_SENDER=20`, `MIN_DELAY=500ms`: campaign A (cap 3, 5 recipients) + campaign B
  (100 recipients) on the same sender → A sent 3 / deferred 2, B sent 17 (sender total 20) / deferred 83 to the next hour, in order.

### 3.6 Search (Elasticsearch)
Every email is indexed on creation and re-indexed on every status change (`status`, `toEmail`, `senderEmail`, `subject`, body text,
timestamps). The dashboard search box calls `GET /api/emails?view=…&q=…`, which runs a typo-tolerant + search-as-you-type query
scoped to the current user and tab, then loads the authoritative rows from Postgres. If Elasticsearch is down, indexing is skipped
(logged) and search falls back to a Postgres `ILIKE` query – sending is never affected.

### 3.7 Live queue dashboard
**Bull Board** at http://localhost:4000/admin/queues (also linked from the profile menu) – waiting / delayed / active / completed /
failed jobs in real time, with job data and retry controls. Protect it with `BULL_BOARD_USER`/`BULL_BOARD_PASS` outside localhost.

---

## 4. API

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/google` → `/api/auth/google/callback` | Google OAuth code flow, sets an httpOnly session cookie |
| GET | `/api/auth/me` · POST `/api/auth/logout` | Current user / logout |
| GET | `/api/senders` | Sender pool (no credentials) |
| POST | `/api/campaigns` | `{senderId, subject, body, recipients[], startAt, delaySeconds, hourlyLimit}` → schedules |
| GET | `/api/emails?view=scheduled\|sent&q=&page=&pageSize=` | Lists / searches emails |
| GET | `/api/emails/counts` · `/api/emails/:id` | Sidebar counters / detail |
| GET | `/api/slack/status` · `/api/slack/connect` · `/api/slack/callback` | Slack OAuth |
| POST | `/api/slack/test` · DELETE `/api/slack` | Test message / disconnect |
| GET | `/admin/queues` | Bull Board |

---

## 5. Features implemented

**Backend**
- ✅ Scheduler: BullMQ delayed jobs, one job per email, `jobId = emailId`, no cron
- ✅ Persistence: Postgres source of truth, Redis AOF, boot-time reconciliation, restart-safe
- ✅ Idempotency: status guards, conditional claim, Redis sent-marker, deterministic Message-ID, per-email slot reservation
- ✅ Multiple senders (Ethereal pool, auto-provisioned), pooled SMTP transports
- ✅ Worker concurrency (configurable), horizontal scaling (multiple worker processes)
- ✅ Min delay between sends per sender + per-campaign delay
- ✅ Hourly limits per sender (env) and per campaign (UI), Redis-backed, atomic, multi-worker safe; overflow rescheduled, never dropped
- ✅ Slack OAuth (connect / reconnect / disconnect / test), live alert when a limit is hit, deduplicated per hour
- ✅ Elasticsearch indexing + search with Postgres fallback
- ✅ Bull Board live queue dashboard
- ✅ Retries with exponential backoff, `FAILED` status with error message
- ✅ Load-test script for 1000+ emails

**Frontend** (React 18 + TypeScript + Tailwind v4 + React Router)
- ✅ Real Google OAuth login, redirect to dashboard, logout
- ✅ Sidebar profile card with name, email, avatar (Figma layout) + menu (Slack, Bull Board, logout)
- ✅ Scheduled / Sent tabs with live counts, search, refresh, pagination, auto-refresh every 10 s
- ✅ Email rows: recipient, status/time pill (scheduled · rate-limited · sent · failed), subject + snippet
- ✅ Email detail view with send slot, attempts, deferrals, errors and Ethereal preview link
- ✅ Compose: sender picker, recipient chips, **CSV/TXT upload with detected-address count**, subject, rich-text body,
  delay between emails, hourly limit, **Send Later** popover (date-time + presets)
- ✅ Loading skeletons, empty states, error states and toasts
- ✅ Reusable UI kit (`Button`, `IconButton`, `Input`, `FieldRow`, `Popover`, `Avatar`, `Spinner`, `EmptyState`, `Toast`, icons),
  typed API client and response types

---

## 6. Assumptions & shortcuts
- The Figma's email/password form is rendered for fidelity but disabled (Google OAuth is the required login method).
- The Figma's star / archive / delete / filter icons are visual only.
- Senders are a shared pool (any logged-in user can pick any sender); the per-sender hourly cap is therefore global across users,
  which is the realistic model for a shared mailbox/IP.
- Start time is interpreted in the browser's timezone and stored in UTC.
- CSV parsing extracts every valid email address from the file regardless of column layout, then de-duplicates.
- Email bodies are the user's own HTML and are rendered back only to that user.
