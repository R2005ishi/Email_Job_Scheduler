import { DelayedError, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';
import type { EmailJobData } from '../queue/emailQueue';
import { HOUR_MS, hourWindowOf, reserveSendSlot, SlotReservation } from '../queue/rateLimiter';
import { getTransporter, senderHourlyLimit } from '../services/senderService';
import { indexEmail } from '../services/searchService';
import { notifyLimitReached } from '../services/slackService';

const log = createLogger('worker');

// Set as soon as SMTP accepts the message. If we crash before updating the DB,
// the retry sees this key and doesn't send the email a second time.
const sentKey = (emailId: string) => `email:sent:${emailId}`;

type EmailWithRelations = NonNullable<Awaited<ReturnType<typeof loadEmail>>>;

function loadEmail(id: string) {
  return prisma.email.findUnique({
    where: { id },
    include: { sender: true, campaign: { select: { hourlyLimit: true, subject: true } } },
  });
}

async function reindex(id: string) {
  const email = await prisma.email.findUnique({ where: { id }, include: { sender: { select: { email: true } } } });
  if (email) await indexEmail(email);
}

// Processes one email job. Job id == email id, so each email has exactly one job.
export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const email = await loadEmail(job.data.emailId);
  if (!email || email.status === 'SENT' || email.status === 'FAILED') return;

  if (await redis.exists(sentKey(email.id))) {
    await markSent(email.id, {});
    return;
  }

  const reservation = await reserveSendSlot({
    senderId: email.senderId,
    campaignId: email.campaignId,
    emailId: email.id,
    minGapMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    senderLimit: senderHourlyLimit(email.sender),
    campaignLimit: email.campaign.hourlyLimit,
  });
  await notifySlackIfLimitReached(email, reservation);

  // Our slot is in the future (min gap, or the hourly limit is full).
  // Put the job back in the delayed set instead of failing it.
  if (reservation.slotAt - reservation.now > 250) {
    await delayUntilSlot(job, token, email.id, reservation);
  }

  // Only one worker can move the email to SENDING
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: { in: ['SCHEDULED', 'SENDING'] } },
    data: { status: 'SENDING', attempts: { increment: 1 }, slotAt: new Date(reservation.slotAt) },
  });
  if (claimed.count === 0) return;

  try {
    await sendEmail(email);
  } catch (err) {
    await handleSendFailure(job, email.id, err as Error);
    throw err; // let BullMQ retry with backoff
  }
}

async function delayUntilSlot(job: Job, token: string | undefined, emailId: string, reservation: SlotReservation) {
  await prisma.email.update({
    where: { id: emailId },
    data: {
      slotAt: new Date(reservation.slotAt),
      deferredCount: reservation.deferred ? { increment: 1 } : undefined,
    },
  });

  if (reservation.deferred) {
    log.info(`Email ${emailId} deferred to ${new Date(reservation.slotAt).toISOString()} (hourly limit)`);
    void reindex(emailId);
  }

  await job.moveToDelayed(reservation.slotAt, token);
  throw new DelayedError();
}

async function sendEmail(email: EmailWithRelations) {
  const { sender } = email;
  const info = await getTransporter(sender).sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: email.toEmail,
    subject: email.subject,
    html: email.body,
    text: email.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    // same id on every retry, so a real provider could also dedupe it
    messageId: `<${email.id}@reachinbox-scheduler.local>`,
  });

  await redis.set(sentKey(email.id), '1', 'EX', 30 * 24 * 3600);
  await markSent(email.id, {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  });
  log.info(`Sent ${email.id} -> ${email.toEmail} via ${sender.email}`);
}

async function markSent(emailId: string, extra: { messageId?: string; previewUrl?: string | null }) {
  await prisma.email.update({
    where: { id: emailId },
    data: { status: 'SENT', sentAt: new Date(), error: null, ...extra },
  });
  await reindex(emailId);
}

async function handleSendFailure(job: Job, emailId: string, err: Error) {
  const attempt = job.attemptsMade + 1;
  const lastAttempt = attempt >= (job.opts.attempts ?? 1);

  await prisma.email.update({
    where: { id: emailId },
    data: { status: lastAttempt ? 'FAILED' : 'SCHEDULED', error: err.message },
  });
  await reindex(emailId);
  log.warn(`Send failed for ${emailId} (attempt ${attempt}${lastAttempt ? ', giving up' : ''}): ${err.message}`);
}

// Sends a Slack message when this email used up the last slot of the hour,
// or when it had to be pushed to the next hour because the limit was full.
async function notifySlackIfLimitReached(email: EmailWithRelations, reservation: SlotReservation) {
  if (reservation.reused) return;

  const senderLimit = senderHourlyLimit(email.sender);
  const campaignLimit = email.campaign.hourlyLimit;

  if (reservation.deferred) {
    const bySender = reservation.deferredBy === 'sender';
    await notifyLimitReached({
      userId: email.userId,
      type: bySender ? 'sender' : 'campaign',
      id: bySender ? email.senderId : email.campaignId,
      name: bySender ? email.sender.email : email.campaign.subject,
      limit: bySender ? senderLimit : campaignLimit,
      hour: hourWindowOf(reservation.slotAt) - 1,
      resumesAt: reservation.slotAt,
    });
    return;
  }

  const hour = hourWindowOf(reservation.slotAt);
  const nextHour = (hour + 1) * HOUR_MS;

  if (senderLimit > 0 && reservation.senderCount === senderLimit) {
    await notifyLimitReached({
      userId: email.userId, type: 'sender', id: email.senderId, name: email.sender.email,
      limit: senderLimit, hour, resumesAt: nextHour,
    });
  }
  if (campaignLimit > 0 && reservation.campaignCount === campaignLimit) {
    await notifyLimitReached({
      userId: email.userId, type: 'campaign', id: email.campaignId, name: email.campaign.subject,
      limit: campaignLimit, hour, resumesAt: nextHour,
    });
  }
}
