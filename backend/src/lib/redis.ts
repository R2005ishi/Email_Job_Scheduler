import IORedis from 'ioredis';
import { env } from '../config/env';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections used by workers
 * (blocking commands must never time out). We use the same options everywhere.
 */
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Shared connection for queue producers, rate limiter and misc keys. */
export const redis = createRedis();
