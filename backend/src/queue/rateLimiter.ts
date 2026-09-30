import type { Result } from 'ioredis';
import { redis } from '../lib/redis';

export const HOUR_MS = 60 * 60 * 1000;

export const hourWindowOf = (timestamp: number) => Math.floor(timestamp / HOUR_MS);

// Decides when an email is allowed to go out. Runs as a Lua script so the
// check-and-increment is atomic, even with many workers running in parallel.
//
// 1. next slot = max(now, sender's last slot + min gap)
// 2. if the sender and the campaign both have room in that hour -> reserve it
// 3. otherwise don't reserve; return a time just after the next hour starts.
//    The ticket counter keeps deferred emails in the order they were deferred.
//
// Result codes: 0 = reserved, 1 = sender limit hit, 2 = campaign limit hit,
// 3 = this email already had a slot (job was retried).
const reserveSlotScript = `
local senderId, campaignId, emailId = ARGV[1], ARGV[2], ARGV[3]
local minGap        = tonumber(ARGV[4])
local senderLimit   = tonumber(ARGV[5])
local campaignLimit = tonumber(ARGV[6])
local HOUR = 3600000

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local reservationKey = 'rl:res:' .. emailId
local existing = redis.call('GET', reservationKey)
if existing then
  return {tonumber(existing), now, 3, -1, -1}
end

local lastSlotKey = 'rl:last:' .. senderId
local lastSlot = tonumber(redis.call('GET', lastSlotKey) or '0')
local slot = math.max(now, lastSlot + minGap)
local hour = math.floor(slot / HOUR)

local senderKey = 'rl:s:' .. senderId .. ':' .. hour
local campaignKey = 'rl:c:' .. campaignId .. ':' .. hour
local senderCount = tonumber(redis.call('GET', senderKey) or '0')
local campaignCount = tonumber(redis.call('GET', campaignKey) or '0')
local senderFull = senderLimit > 0 and senderCount >= senderLimit
local campaignFull = campaignLimit > 0 and campaignCount >= campaignLimit

if not senderFull and not campaignFull then
  local ttl = (hour + 2) * HOUR - now
  redis.call('INCR', senderKey)
  redis.call('PEXPIRE', senderKey, ttl)
  redis.call('INCR', campaignKey)
  redis.call('PEXPIRE', campaignKey, ttl)
  redis.call('SET', lastSlotKey, slot, 'PX', ttl)
  redis.call('SET', reservationKey, slot, 'PX', math.max(slot - now, 0) + 7 * 24 * HOUR)
  return {slot, now, 0, senderCount + 1, campaignCount + 1}
end

local nextHourStart = (hour + 1) * HOUR
local ticketKey = 'rl:dq:' .. senderId .. ':' .. (hour + 1)
local ticket = redis.call('INCR', ticketKey)
redis.call('PEXPIRE', ticketKey, nextHourStart - now + HOUR)

local reason = 2
if senderFull then reason = 1 end
return {nextHourStart + ticket, now, reason, senderCount, campaignCount}
`;

redis.defineCommand('reserveSendSlot', { numberOfKeys: 0, lua: reserveSlotScript });

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveSendSlot(...args: string[]): Result<number[], Context>;
  }
}

export interface SlotReservation {
  // when to send, or (if deferred) when to try again
  slotAt: number;
  now: number;
  senderCount: number;
  campaignCount: number;
  deferred: boolean;
  deferredBy: 'sender' | 'campaign' | null;
  reused: boolean;
}

export async function reserveSendSlot(params: {
  senderId: string;
  campaignId: string;
  emailId: string;
  minGapMs: number;
  senderLimit: number;
  campaignLimit: number;
}): Promise<SlotReservation> {
  const [slotAt, now, result, senderCount, campaignCount] = await redis.reserveSendSlot(
    params.senderId,
    params.campaignId,
    params.emailId,
    String(params.minGapMs),
    String(params.senderLimit),
    String(params.campaignLimit),
  );

  return {
    slotAt,
    now,
    senderCount,
    campaignCount,
    deferred: result === 1 || result === 2,
    deferredBy: result === 1 ? 'sender' : result === 2 ? 'campaign' : null,
    reused: result === 3,
  };
}
