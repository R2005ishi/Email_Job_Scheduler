import { redis } from '../lib/redis';

export const HOUR_MS = 3_600_000;

/**
 * Atomic send-slot reservation (runs inside Redis, so it is safe across any
 * number of worker processes / concurrency slots).
 *
 * Keys:
 *   rl:last:{sender}          -> timestamp of the sender's last reserved slot (enforces min gap)
 *   rl:s:{sender}:{hour}      -> #slots reserved for that sender in that hour window
 *   rl:c:{campaign}:{hour}    -> #slots reserved for that campaign in that hour window
 *   rl:dq:{sender}:{hour}     -> ticket counter for jobs deferred INTO that hour (keeps order)
 *   rl:res:{email}            -> slot already granted to this email (idempotent re-runs / crashes)
 *
 * Algorithm:
 *   slot = max(now, lastSlot + minGap)          -- per-sender throttling
 *   w    = hour window containing slot
 *   if sender AND campaign still have capacity in w:
 *       reserve it (INCR both counters, lastSlot = slot) -> job waits until `slot`
 *   else:
 *       do NOT reserve; hand out a ticket for the next window and return
 *       nextWindowStart + ticket(ms). The job is re-delayed to that time and
 *       competes again for a slot there, in the order it was deferred.
 *
 * Only reserving inside the natural window means a campaign that hits ITS cap
 * never blocks other campaigns on the same sender, and a sender that hits its
 * cap simply resumes at the next hour. Each reserved email has its own unique
 * slot (spaced by minGap), so 1000 due-at-once jobs never retry in lock-step.
 *
 * Returns {slot, now, reason, senderCount, campaignCount}
 *   reason: 0 = slot reserved,
 *           1 = deferred to next hour (SENDER cap reached),
 *           2 = deferred to next hour (CAMPAIGN cap reached),
 *           3 = reused an earlier reservation
 */
const RESERVE_SLOT_LUA = `
local senderId   = ARGV[1]
local campaignId = ARGV[2]
local emailId    = ARGV[3]
local gap        = tonumber(ARGV[4])
local sLim       = tonumber(ARGV[5])
local cLim       = tonumber(ARGV[6])
local HOUR       = 3600000

local t   = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local resKey = 'rl:res:' .. emailId
local existing = redis.call('GET', resKey)
if existing then
  return {tonumber(existing), now, 3, -1, -1}
end

local lastKey = 'rl:last:' .. senderId
local last = tonumber(redis.call('GET', lastKey) or '0')
local slot = math.max(now, last + gap)
local w  = math.floor(slot / HOUR)
local sk = 'rl:s:' .. senderId .. ':' .. w
local ck = 'rl:c:' .. campaignId .. ':' .. w
local sc = tonumber(redis.call('GET', sk) or '0')
local cc = tonumber(redis.call('GET', ck) or '0')
local senderOk   = (sLim <= 0) or (sc < sLim)
local campaignOk = (cLim <= 0) or (cc < cLim)

if senderOk and campaignOk then
  local ttl = (w + 2) * HOUR - now
  redis.call('INCR', sk); redis.call('PEXPIRE', sk, ttl)
  redis.call('INCR', ck); redis.call('PEXPIRE', ck, ttl)
  redis.call('SET', lastKey, slot, 'PX', math.max(slot - now, 0) + gap + HOUR)
  redis.call('SET', resKey, slot, 'PX', math.max(slot - now, 0) + 7 * 24 * HOUR)
  return {slot, now, 0, sc + 1, cc + 1}
end

local reason = 2
if not senderOk then reason = 1 end
local nextStart = (w + 1) * HOUR
local dq = 'rl:dq:' .. senderId .. ':' .. (w + 1)
local ticket = redis.call('INCR', dq)
redis.call('PEXPIRE', dq, nextStart - now + HOUR)
return {nextStart + ticket, now, reason, sc, cc}
`;

let scriptSha: string | null = null;

async function evalReserve(args: string[]): Promise<number[]> {
  if (!scriptSha) scriptSha = (await redis.script('LOAD', RESERVE_SLOT_LUA)) as string;
  try {
    return (await redis.evalsha(scriptSha, 0, ...args)) as number[];
  } catch (err) {
    if (err instanceof Error && err.message.includes('NOSCRIPT')) {
      scriptSha = null; // Redis restarted / script cache flushed
      return (await redis.eval(RESERVE_SLOT_LUA, 0, ...args)) as number[];
    }
    throw err;
  }
}

export interface SlotReservation {
  /** Reserved send time, or (when deferred) the time to retry the reservation */
  slotAt: number;
  now: number;
  /** 0 = reserved, 1 = deferred by sender cap, 2 = deferred by campaign cap, 3 = reused */
  reason: 0 | 1 | 2 | 3;
  /** Slots used in the window (after this reservation when reason = 0) */
  senderCount: number;
  campaignCount: number;
  reused: boolean;
  deferred: boolean;
}

export async function reserveSendSlot(params: {
  senderId: string;
  campaignId: string;
  emailId: string;
  minGapMs: number;
  senderLimit: number;
  campaignLimit: number;
}): Promise<SlotReservation> {
  const [slotAt, now, reason, senderCount, campaignCount] = await evalReserve([
    params.senderId,
    params.campaignId,
    params.emailId,
    String(params.minGapMs),
    String(params.senderLimit),
    String(params.campaignLimit),
  ]);
  return {
    slotAt,
    now,
    reason: reason as SlotReservation['reason'],
    senderCount,
    campaignCount,
    reused: reason === 3,
    deferred: reason === 1 || reason === 2,
  };
}

export const hourWindowOf = (ts: number) => Math.floor(ts / HOUR_MS);
