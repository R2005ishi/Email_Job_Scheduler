import { prisma } from '../lib/prisma';
import { enqueueEmailsBulk } from '../queue/emailQueue';
import { indexEmails } from './searchService';
import { HttpError } from '../middleware/errors';

export interface CreateCampaignInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delaySeconds: number;
  hourlyLimit: number;
}

/**
 * Persists the campaign + one Email row per recipient in a single transaction,
 * THEN enqueues delayed jobs. Postgres is the source of truth: if enqueueing
 * is interrupted, startup reconciliation re-creates any missing jobs.
 *
 * Planned time for recipient i = startAt + i * delay. The worker may push an
 * email later (min-gap / hourly caps) but never earlier.
 */
export async function createCampaign(input: CreateCampaignInput) {
  const sender = await prisma.sender.findUnique({ where: { id: input.senderId } });
  if (!sender) throw new HttpError(400, 'Unknown sender');

  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const delayMs = Math.round(input.delaySeconds * 1000);
  const startMs = Math.max(input.startAt.getTime(), Date.now());

  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        userId: input.userId,
        senderId: sender.id,
        subject: input.subject,
        body: input.body,
        startAt: new Date(startMs),
        delayMs,
        hourlyLimit: input.hourlyLimit,
        totalCount: recipients.length,
      },
    });
    await tx.email.createMany({
      data: recipients.map((toEmail, i) => ({
        campaignId: c.id,
        userId: input.userId,
        senderId: sender.id,
        toEmail,
        subject: input.subject,
        body: input.body,
        sequence: i,
        scheduledAt: new Date(startMs + i * delayMs),
      })),
    });
    return c;
  });

  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    include: { sender: { select: { email: true } } },
    orderBy: { sequence: 'asc' },
  });

  await enqueueEmailsBulk(emails.map((e) => ({ emailId: e.id, runAt: e.scheduledAt })));
  void indexEmails(emails);

  return { campaign, scheduledCount: emails.length };
}
