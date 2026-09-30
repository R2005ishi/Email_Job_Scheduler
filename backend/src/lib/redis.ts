import IORedis from 'ioredis';
import { env } from '../config/env';

// BullMQ workers need maxRetriesPerRequest: null (their blocking calls must not time out)
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// shared connection for the queue, rate limiter and other keys
export const redis = createRedis();
