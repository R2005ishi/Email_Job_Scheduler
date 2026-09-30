import IORedis from 'ioredis';
import { env } from '../config/env';

// BullMQ workers need maxRetriesPerRequest: null (their blocking calls must not time out).
// family: 0 lets it connect over IPv6 too, which Railway's private network uses.
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, family: 0 });
}

// shared connection for the queue, rate limiter and other keys
export const redis = createRedis();
