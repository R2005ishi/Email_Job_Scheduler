import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { emailQueue, enqueueEmailsBulk } from '../queue/emailQueue';

const log = createLogger('reconcile');

/**
 * Postgres is the source of truth, Redis holds the timers.
 *
 * Normally nothing needs to happen on restart: BullMQ delayed jobs live in Redis
 * (persisted with AOF), so they simply fire at their timestamp once a worker is
 * back. This pass covers the edge cases - Redis data lost, or the process died
 * between the DB commit and `addBulk` - by re-adding a job for every pending
 * email that has none. jobId = emailId makes it impossible to create duplicates.
 */
export async function reconcilePendingEmails() {
  const BATCH = 1000;
  let cursor: string | undefined;
  let checked = 0;
  let restored = 0;

  for (;;) {
    const pending = await prisma.email.findMany({
      where: { status: { in: ['SCHEDULED', 'SENDING'] } },
      select: { id: true, scheduledAt: true, slotAt: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!pending.length) break;
    cursor = pending[pending.length - 1].id;
    checked += pending.length;

    const missing: { emailId: string; runAt: Date }[] = [];
    for (const e of pending) {
      const job = await emailQueue.getJob(e.id);
      if (!job) missing.push({ emailId: e.id, runAt: e.slotAt ?? e.scheduledAt });
    }
    if (missing.length) {
      await enqueueEmailsBulk(missing);
      restored += missing.length;
    }
  }

  log.info(`Checked ${checked} pending emails, restored ${restored} missing jobs`);
  return { checked, restored };
}
