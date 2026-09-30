import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { emailQueue, enqueueEmails } from '../queue/emailQueue';

const log = createLogger('reconcile');

// Runs when the API starts. Delayed jobs are stored in Redis, so after a
// normal restart they are all still there. This only matters if Redis lost
// data or the server crashed between saving emails and queueing them: any
// pending email without a job gets its job added back.
export async function reconcilePendingEmails() {
  const batchSize = 1000;
  let cursor: string | undefined;
  let checked = 0;
  let restored = 0;

  while (true) {
    const pending = await prisma.email.findMany({
      where: { status: { in: ['SCHEDULED', 'SENDING'] } },
      select: { id: true, scheduledAt: true, slotAt: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (pending.length === 0) break;

    cursor = pending[pending.length - 1].id;
    checked += pending.length;

    const missing = [];
    for (const email of pending) {
      const job = await emailQueue.getJob(email.id);
      if (!job) missing.push({ emailId: email.id, runAt: email.slotAt ?? email.scheduledAt });
    }

    if (missing.length > 0) {
      await enqueueEmails(missing);
      restored += missing.length;
    }
  }

  log.info(`Checked ${checked} pending emails, restored ${restored} missing jobs`);
  return { checked, restored };
}
