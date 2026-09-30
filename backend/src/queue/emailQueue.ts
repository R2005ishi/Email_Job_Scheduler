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
    backoff: { type: 'exponential', delay: 5000 },
    // keep some history for Bull Board without letting Redis grow forever
    removeOnComplete: { count: 5000, age: 7 * 24 * 3600 },
    removeOnFail: { count: 5000, age: 14 * 24 * 3600 },
  },
});

// Adds one delayed job per email. The job id is the email id, and BullMQ
// ignores a job whose id already exists, so calling this twice for the same
// email is safe (used by the restart check in reconcileService).
export async function enqueueEmails(items: { emailId: string; runAt: Date }[]) {
  const now = Date.now();
  const batchSize = 500;

  for (let i = 0; i < items.length; i += batchSize) {
    const jobs = items.slice(i, i + batchSize).map(({ emailId, runAt }) => ({
      name: 'send',
      data: { emailId },
      opts: { jobId: emailId, delay: Math.max(0, runAt.getTime() - now) },
    }));
    await emailQueue.addBulk(jobs);
  }
}
