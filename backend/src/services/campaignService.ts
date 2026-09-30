import { prisma } from '../lib/prisma';
import { enqueueEmails } from '../queue/emailQueue';
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

// Saves the campaign and one email row per recipient, then queues a delayed
// job for each email. Email i is planned for startAt + i * delay; the worker
// can push it later because of rate limits, but never earlier.
export async function createCampaign(input: CreateCampaignInput) {
  const sender = await prisma.sender.findUnique({ where: { id: input.senderId } });
  if (!sender) throw new HttpError(400, 'Unknown sender');

  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const delayMs = Math.round(input.delaySeconds * 1000);
  const startMs = Math.max(input.startAt.getTime(), Date.now());

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
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
        campaignId: created.id,
        userId: input.userId,
        senderId: sender.id,
        toEmail,
        subject: input.subject,
        body: input.body,
        sequence: i,
        scheduledAt: new Date(startMs + i * delayMs),
      })),
    });

    return created;
  });

  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    include: { sender: { select: { email: true } } },
    orderBy: { sequence: 'asc' },
  });

  // Jobs are added after the DB commit. If the server dies in between,
  // reconcilePendingEmails() adds the missing jobs on the next start.
  await enqueueEmails(emails.map((e) => ({ emailId: e.id, runAt: e.scheduledAt })));
  void indexEmails(emails);

  return { campaign, scheduledCount: emails.length };
}
