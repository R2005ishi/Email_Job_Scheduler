import { DelayedError, Job } from 'bullmq';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';
import type { EmailJobData } from '../queue/emailQueue';
import { HOUR_MS, hourWindowOf, reserveSendSlot, SlotReservation } from '../queue/rateLimiter';
import { getTransporter, senderHourlyLimit } from '../services/senderService';
import { indexEmail } from '../services/searchService';
import { notifyRateLimitReached } from '../services/slackService';
import nodemailer from 'nodemailer';

const log = createLogger('worker');

/** Written right after SMTP accepts the message - the last line of defence against double sends. */
const sentMarkerKey = (emailId: string) => `email:sent:${emailId}`;

/** Don't bother re-delaying a job for less than this; just send. */
const DELAY_TOLERANCE_MS = 250;

type LoadedEmail = NonNullable<Awaited<ReturnType<typeof loadEmail>>>;

const loadEmail = (id: string) =>
  prisma.email.findUnique({
    where: { id },
    include: { sender: true, campaign: { select: { hourlyLimit: true, subject: true } } },
  });

async function reindex(id: string) {
  const fresh = await prisma.email.findUnique({ where: { id }, include: { sender: { select: { email: true } } } });
  if (fresh) await indexEmail(fresh);
}

async function maybeNotifyRateLimit(email: LoadedEmail, r: SlotReservation) {
  if (r.reused) return;
  const senderLimit = senderHourlyLimit(email.sender);
  const campaignLimit = email.campaign.hourlyLimit;
  const slotWindow = hourWindowOf(r.slotAt);

  // (a) this reservation consumed the last slot of the window -> the limit is reached *now*
  if (!r.deferred && senderLimit > 0 && r.senderCount === senderLimit) {
    await notifyRateLimitReached({
      userId: email.userId, kind: 'sender', subjectId: email.senderId, label: email.sender.email,
      limit: senderLimit, window: slotWindow, resumesAt: (slotWindow + 1) * HOUR_MS,
    });
  }
  if (!r.deferred && campaignLimit > 0 && r.campaignCount === campaignLimit) {
    await notifyRateLimitReached({
      userId: email.userId, kind: 'campaign', subjectId: email.campaignId, label: email.campaign.subject,
      limit: campaignLimit, window: slotWindow, resumesAt: (slotWindow + 1) * HOUR_MS,
    });
  }
  // (b) the natural window was already full and we got pushed to the next hour
  if (r.deferred) {
    const fullWindow = slotWindow - 1;
    await notifyRateLimitReached({
      userId: email.userId,
      kind: r.reason === 1 ? 'sender' : 'campaign',
      subjectId: r.reason === 1 ? email.senderId : email.campaignId,
      label: r.reason === 1 ? email.sender.email : email.campaign.subject,
      limit: r.reason === 1 ? senderLimit : campaignLimit,
      window: fullWindow,
      resumesAt: r.slotAt,
    });
  }
}

/**
 * Lifecycle of one job (jobId === emailId):
 *
 *  1. Idempotency guards  - skip if the DB row is SENT/FAILED or the Redis sent-marker exists.
 *  2. Slot reservation    - atomic Lua script enforces min gap + hourly caps (sender & campaign).
 *                           If the slot is in the future the job is moved back to "delayed"
 *                           (NOT failed, NOT dropped) and will re-enter here at slot time,
 *                           where the stored reservation is reused.
 *  3. Claim               - conditional UPDATE ... WHERE status IN (SCHEDULED, SENDING).
 *  4. SMTP send           - deterministic Message-ID derived from the email id.
 *  5. Mark sent           - Redis marker first, then DB row, then search index.
 */
export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;
  const email = await loadEmail(emailId);

  if (!email) return { skipped: 'missing' };
  if (email.status === 'SENT' || email.status === 'FAILED') return { skipped: email.status };

  // Crash between "SMTP accepted" and "DB updated" -> finish the bookkeeping, don't resend.
  if (await redis.exists(sentMarkerKey(emailId))) {
    await prisma.email.update({ where: { id: emailId }, data: { status: 'SENT', sentAt: email.sentAt ?? new Date() } });
    await reindex(emailId);
    return { skipped: 'already-sent-marker' };
  }

  const reservation = await reserveSendSlot({
    senderId: email.senderId,
    campaignId: email.campaignId,
    emailId,
    minGapMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    senderLimit: senderHourlyLimit(email.sender),
    campaignLimit: email.campaign.hourlyLimit,
  });
  await maybeNotifyRateLimit(email, reservation);

  if (reservation.slotAt - reservation.now > DELAY_TOLERANCE_MS) {
    // Deferred = hourly cap hit, retry at the next window. Otherwise it is just a
    // reserved slot a few seconds out (min gap / delay between emails).
    const deferredByCap = reservation.deferred;
    await prisma.email.update({
      where: { id: emailId },
      data: {
        slotAt: new Date(reservation.slotAt),
        ...(deferredByCap ? { deferredCount: { increment: 1 } } : {}),
      },
    });
    if (deferredByCap) {
      log.info(`Email ${emailId} deferred to ${new Date(reservation.slotAt).toISOString()} (hourly cap)`);
      void reindex(emailId);
    }
    if (!token) throw new Error('Missing job token - cannot delay job');
    await job.moveToDelayed(reservation.slotAt, token);
    throw new DelayedError();
  }

  const claimed = await prisma.email.updateMany({
    where: { id: emailId, status: { in: ['SCHEDULED', 'SENDING'] } },
    data: { status: 'SENDING', attempts: { increment: 1 }, slotAt: new Date(reservation.slotAt) },
  });
  if (claimed.count === 0) return { skipped: 'not-claimable' };

  const { sender } = email;
  try {
    const info = await getTransporter(sender).sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      html: email.body,
      text: email.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      messageId: `<${emailId}@reachinbox-scheduler.local>`,
      headers: { 'X-Scheduler-Email-Id': emailId, 'X-Scheduler-Campaign-Id': email.campaignId },
    });

    await redis.set(sentMarkerKey(emailId), '1', 'EX', 30 * 24 * 3600);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId: info.messageId,
        previewUrl: (nodemailer.getTestMessageUrl(info) || null) as string | null,
        error: null,
      },
    });
    await reindex(emailId);
    log.info(`Sent ${emailId} -> ${email.toEmail} via ${sender.email}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    const message = (err as Error).message;
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: isFinalAttempt ? 'FAILED' : 'SCHEDULED', error: message },
    });
    await reindex(emailId);
    log.warn(`Send failed for ${emailId} (attempt ${job.attemptsMade + 1}${isFinalAttempt ? ', final' : ''}): ${message}`);
    throw err; // BullMQ retries with exponential backoff until attempts are exhausted
  }
}
