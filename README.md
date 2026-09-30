# Email Scheduler (ReachInbox assignment)

A service that schedules emails and sends them at the right time, plus a dashboard to create and track them.

**Stack**
- Backend: Express + TypeScript, BullMQ (Redis), PostgreSQL (Prisma), Elasticsearch, Ethereal SMTP
- Frontend: React + TypeScript + Tailwind (Vite)
- Login with Google, rate-limit alerts to Slack

## Project structure

```
backend/
  prisma/schema.prisma      database tables
  src/server.ts             Express API + Bull Board
  src/worker.ts             BullMQ worker (separate process)
  src/workers/emailProcessor.ts   what happens when an email job runs
  src/queue/rateLimiter.ts        min delay + hourly limits (Redis Lua script)
  src/services/             campaigns, Slack, search, senders, restart check
  src/routes/               API endpoints
frontend/
  src/pages/                Login, email list, compose, email detail
  src/components/           UI pieces (buttons, inputs, sidebar, editor...)
  src/api/                  API client and types
docker-compose.yml          Postgres, Redis, Elasticsearch
```

## How to run

You need Node.js 20+ and Docker.

**1. Start Postgres, Redis and Elasticsearch**
```bash
docker compose up -d
```

**2. Backend**
```bash
cd backend
cp .env.example .env        # fill in the values (see below)
npm install
npx prisma migrate deploy
npm run dev                 # API on http://localhost:4000
npm run dev:worker          # worker, in a second terminal
```

**3. Frontend**
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

The API and the worker are separate processes, so either can be restarted on its own, and you can run more than one worker.

## Environment variables (`backend/.env`)

| Variable | What it is |
|---|---|
| `JWT_SECRET` | any long random string |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` | defaults work with docker-compose |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth app |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_BASE_URL` | Slack app + public https URL of the backend |
| `WORKER_CONCURRENCY` | jobs one worker runs in parallel (default 5) |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | minimum gap between two emails from the same sender (default 2000) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | hourly limit per sender (default 200) |
| `EMAIL_SEND_ATTEMPTS` | retries before an email is marked FAILED (default 3) |

**Google:** create an OAuth client (type "Web application") in Google Cloud Console.
Add `http://localhost:5173` as a JavaScript origin and `http://localhost:4000/api/auth/google/callback` as a redirect URI.

**Slack:** create an app at api.slack.com/apps with the `incoming-webhook` scope. Slack only allows https redirect URLs,
so run a tunnel to the backend (I used `cloudflared tunnel --url http://localhost:4000`), put the tunnel URL in
`SLACK_REDIRECT_BASE_URL`, and add `<tunnel-url>/api/slack/callback` as a redirect URL in the Slack app.
Then click "Connect Slack" from the profile menu in the dashboard.

**Ethereal:** nothing to set up. On first start the backend creates 3 Ethereal accounts and saves them as senders in the
database. Each sent email has a link to view it on Ethereal (on the email detail page).

## How it works

### Scheduling
1. The frontend sends subject, body, recipients, start time, delay and hourly limit to `POST /api/campaigns`.
2. The backend saves the campaign and one `Email` row per recipient in a single transaction.
   Recipient number `i` is planned for `startTime + i * delay`.
3. For each email it adds a BullMQ **delayed job** with `jobId = emailId`. There is no cron anywhere; the delay is stored in Redis.
4. When a job is due, the worker (`emailProcessor.ts`):
   - skips it if the email is already SENT or FAILED
   - asks the rate limiter for a send slot (see below)
   - if the slot is later, moves the job back to delayed until then (it is not failed or dropped)
   - otherwise marks the email SENDING, sends it over SMTP, and marks it SENT
   - on SMTP errors, BullMQ retries with exponential backoff; after the last attempt the email is FAILED

### Restarts and duplicates
- Delayed jobs are stored in Redis, and Redis runs with AOF persistence (see docker-compose). If the API or worker stops,
  nothing is lost. When the worker comes back, overdue emails are sent right away and future ones at their time.
- On startup the API checks every pending email in Postgres and re-adds its job if it's missing (for example if Redis
  lost data). Because `jobId = emailId`, re-adding an existing job does nothing, so this can't create duplicates.
- To avoid sending an email twice:
  - there is only one job per email (the job id)
  - only one worker can move an email from SCHEDULED to SENDING (conditional update in Postgres)
  - right after SMTP accepts the email, a Redis key `email:sent:<id>` is set. If the worker crashes before updating the
    DB, the retry sees this key and just marks the email as sent.

### Rate limiting and concurrency
All limit checks happen in one Lua script in Redis (`rateLimiter.ts`), so they are atomic and work across any number of
workers. Nothing is counted in memory.

For each email the script:
1. picks the next free slot for the sender: `max(now, lastSlot + MIN_DELAY_BETWEEN_EMAILS_MS)`
2. checks two counters for that hour: emails from this **sender** (`MAX_EMAILS_PER_HOUR_PER_SENDER`) and emails from this
   **campaign** (the "Hourly Limit" field in Compose, 0 = no campaign limit)
3. if both have room, it reserves the slot and the job waits until that time
4. if either is full, the email is **moved to the next hour** (not dropped). A per-hour ticket counter keeps the moved
   emails in the same order.

Other details:
- **Concurrency:** `WORKER_CONCURRENCY` jobs per worker process. Running jobs in parallel is safe because the slot,
  counters and status updates are all atomic.
- **Delay between emails:** the campaign delay spaces out the planned times, and `MIN_DELAY_BETWEEN_EMAILS_MS`
  (2 seconds by default) is enforced per sender even when several campaigns use the same sender.
- **Why only reserve in the current hour:** if one campaign hits its own limit, it shouldn't block other campaigns
  that use the same sender.
- **Slack alert:** when a limit is reached, the user gets a Slack message straight away. A Redis `SET NX` key makes
  sure only one message is sent per limit per hour, even if many workers hit it at once. If the user hasn't connected
  Slack, nothing is sent and nothing breaks. Connecting later works without a restart because the webhook is read
  from the DB each time.

### 1000+ emails at the same time
- Scheduling 1000 recipients is one DB transaction and two `addBulk` calls (well under a second locally).
- When they're all due, each email gets its own slot 2 seconds apart, so they don't all retry at the same moment.
- With the defaults (200/hour per sender) the first 200 are sent in the current hour and the rest move to the next
  hours, 200 at a time. You can watch this in Bull Board.
- To try it: `npm run load-test -- --count 1000 --in 30` (in `backend/`), then open http://localhost:4000/admin/queues

I tested this with a low limit (20/hour, 500 ms gap): two campaigns on the same sender, one with its own limit of 3.
The limited campaign sent 3 and moved 2 to the next hour, and the other campaign sent the remaining 17 of the sender's
20 and moved the rest, in order.

### Search
Emails are indexed in Elasticsearch when created and whenever their status changes. The search box on the dashboard
uses it (handles typos and partial words). If Elasticsearch is down, search falls back to a simple Postgres query and
sending is not affected.

### Queue dashboard
Bull Board runs at http://localhost:4000/admin/queues and shows waiting, delayed, active, completed and failed jobs.
It can be protected with `BULL_BOARD_USER` / `BULL_BOARD_PASS`.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/auth/google` | start Google login |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/logout` | logout |
| GET | `/api/senders` | list of senders |
| POST | `/api/campaigns` | schedule emails |
| GET | `/api/emails?view=scheduled\|sent&q=` | list / search emails |
| GET | `/api/emails/counts` | counts for the sidebar |
| GET | `/api/emails/:id` | one email |
| GET | `/api/slack/connect` | start Slack OAuth |
| GET | `/api/slack/status` | is Slack connected |
| POST | `/api/slack/test` | send a test Slack message |
| DELETE | `/api/slack` | disconnect Slack |

## Features

**Backend**
- Scheduling with BullMQ delayed jobs, no cron
- Survives restarts (Redis AOF + startup check), no duplicate sends
- Multiple Ethereal senders
- Configurable worker concurrency
- Minimum delay between emails per sender
- Hourly limit per sender (env) and per campaign (from the UI), stored in Redis, safe with many workers
- Emails over the limit move to the next hour instead of failing
- Slack OAuth with a live alert when a limit is reached
- Elasticsearch search
- Bull Board dashboard
- Retries with backoff, FAILED status with the error message
- Load test script

**Frontend**
- Google login, logout, user name / email / photo in the sidebar
- Scheduled and Sent tabs with counts, search and pagination
- Compose page: sender, recipients, CSV/TXT upload with the number of emails found, subject, rich text body,
  delay between emails, hourly limit, "Send Later" date picker
- Email detail page
- Loading, empty and error states, toast messages

## Assumptions and trade-offs
- Hourly limits use fixed clock hours (10:00-11:00), not a sliding window. Simpler and easy to reason about.
- The minimum delay is per sender, not global.
- Senders are shared between users, so the sender hourly limit is shared too.
- The email/password form on the login page is only there to match the Figma; login is through Google.
- Star, archive, delete and filter icons are only visual.
- Start time is picked in the browser's timezone and stored in UTC.
- The CSV upload picks up every email address in the file, whatever the columns are, and removes duplicates.
- If the worker is killed exactly while the SMTP call is in progress, that one email could be sent again on retry.
  Everything else is covered by the checks above.
