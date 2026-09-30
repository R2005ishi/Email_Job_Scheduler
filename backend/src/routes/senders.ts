import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { senderHourlyLimit } from '../services/senderService';

export const sendersRouter = Router();

sendersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const senders = await prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
    // Never leak SMTP credentials to the browser.
    res.json({
      senders: senders.map((s) => ({ id: s.id, email: s.email, name: s.name, hourlyLimit: senderHourlyLimit(s) })),
    });
  }),
);
