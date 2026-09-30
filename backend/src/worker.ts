import { Worker } from 'bullmq';
import { env } from './config/env';
import { createRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { createLogger } from './lib/logger';
import { EMAIL_QUEUE_NAME, EmailJobData } from './queue/emailQueue';
import { processEmailJob } from './workers/emailProcessor';
import { ensureIndex } from './services/searchService';

const log = createLogger('worker');

async function main() {
  await ensureIndex();

  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // If a worker dies mid-job, the lock expires and another worker picks the
    // job up (stalled-job recovery). Idempotency guards make that safe.
    lockDuration: 60_000,
    maxStalledCount: 2,
  });

  worker.on('ready', () =>
    log.info(
      `Worker ready (concurrency=${env.WORKER_CONCURRENCY}, minGap=${env.MIN_DELAY_BETWEEN_EMAILS_MS}ms, ` +
        `maxPerHourPerSender=${env.MAX_EMAILS_PER_HOUR_PER_SENDER})`,
    ),
  );
  worker.on('failed', (job, err) => log.warn(`Job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => log.error('Worker error', err));

  const shutdown = async (signal: string) => {
    log.info(`${signal} received - finishing in-flight jobs...`);
    await worker.close(); // waits for active jobs, un-started ones stay in Redis
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('Worker failed to start', err);
  process.exit(1);
});
