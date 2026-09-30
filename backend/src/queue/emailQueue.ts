import { Queue } from 'bullmq';
import { env } from '../config/env';
import { redis } from '../lib/redis';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: env.EMAIL_SEND_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5_000 },
    // Keep some history for Bull Board, but don't let Redis grow forever.
    removeOnComplete: { count: 5_000, age: 7 * 24 * 3600 },
    removeOnFail: { count: 5_000, age: 14 * 24 * 3600 },
  },
});

/**
 * Enqueue (or re-enqueue) the delayed job for one email.
 *
 * jobId === emailId, so this is idempotent: BullMQ ignores `add` for a jobId that
 * already exists in the queue. That property is what makes startup
 * reconciliation and API retries safe - an email can never get two live jobs.
 */
export async function enqueueEmail(emailId: string, runAt: Date) {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  return emailQueue.add('send', { emailId }, { jobId: emailId, delay });
}

export async function enqueueEmailsBulk(items: { emailId: string; runAt: Date }[]) {
  const now = Date.now();
  // addBulk is pipelined - scheduling 1000+ recipients is a single round-trip per chunk.
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    await emailQueue.addBulk(
      items.slice(i, i + CHUNK).map(({ emailId, runAt }) => ({
        name: 'send',
        data: { emailId },
        opts: { jobId: emailId, delay: Math.max(0, runAt.getTime() - now) },
      })),
    );
  }
}
