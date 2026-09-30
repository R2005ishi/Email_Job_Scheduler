import { Router } from 'express';
import { z } from 'zod';
import type { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { searchEmailIds } from '../services/searchService';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const VIEW_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['SCHEDULED', 'SENDING'],
  sent: ['SENT', 'FAILED'],
};

const listQuery = z.object({
  view: z.enum(['scheduled', 'sent']).default('scheduled'),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const emailSelect = {
  id: true,
  toEmail: true,
  subject: true,
  body: true,
  status: true,
  scheduledAt: true,
  slotAt: true,
  sentAt: true,
  error: true,
  deferredCount: true,
  previewUrl: true,
  campaignId: true,
  sender: { select: { id: true, email: true, name: true } },
} satisfies Prisma.EmailSelect;

emailsRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const { view, q, page, pageSize } = listQuery.parse(req.query);
    const statuses = VIEW_STATUSES[view];
    const where: Prisma.EmailWhereInput = { userId: req.userId, status: { in: statuses } };

    if (q) {
      const ids = await searchEmailIds(req.userId, q, statuses);
      if (ids) {
        // Elasticsearch finds the ids, Postgres returns the actual rows
        const rows = await prisma.email.findMany({ where: { ...where, id: { in: ids } }, select: emailSelect });
        const rank = new Map(ids.map((id, i) => [id, i]));
        rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
        return res.json({ items: rows, total: rows.length, page: 1, pageSize: rows.length, source: 'elasticsearch' });
      }
      // Elasticsearch is down, fall back to a simple SQL search
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { toEmail: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.EmailOrderByWithRelationInput[] =
      view === 'scheduled' ? [{ scheduledAt: 'asc' }, { sequence: 'asc' }] : [{ sentAt: 'desc' }, { updatedAt: 'desc' }];

    const [items, total] = await prisma.$transaction([
      prisma.email.findMany({ where, select: emailSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.email.count({ where }),
    ]);
    res.json({ items, total, page, pageSize, source: q ? 'postgres' : undefined });
  }),
);

emailsRouter.get(
  '/counts',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const grouped = await prisma.email.groupBy({ by: ['status'], where: { userId: req.userId }, _count: true });
    const by = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<Record<EmailStatus, number>>;
    res.json({
      scheduled: (by.SCHEDULED ?? 0) + (by.SENDING ?? 0),
      sent: (by.SENT ?? 0) + (by.FAILED ?? 0),
      failed: by.FAILED ?? 0,
    });
  }),
);

emailsRouter.get(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { ...emailSelect, attempts: true, messageId: true, createdAt: true },
    });
    if (!email) throw new HttpError(404, 'Email not found');
    res.json({ email });
  }),
);
