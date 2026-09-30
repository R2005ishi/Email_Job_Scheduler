import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { createCampaign } from '../services/campaignService';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

const createSchema = z.object({
  senderId: z.string().uuid(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(200_000),
  recipients: z.array(z.string().trim().email()).min(1).max(50_000),
  startAt: z.coerce.date(),
  /** Seconds between consecutive emails of this campaign */
  delaySeconds: z.number().min(0).max(24 * 3600),
  /** Max emails/hour for this campaign; 0 = only the sender-level cap applies */
  hourlyLimit: z.number().int().min(0).max(100_000),
});

campaignsRouter.post(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = createSchema.parse(req.body);
    const result = await createCampaign({ ...input, userId: req.userId });
    res.status(201).json(result);
  }),
);

campaignsRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { email: true, name: true } } },
    });
    res.json({ campaigns });
  }),
);
