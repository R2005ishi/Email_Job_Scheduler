import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { signState, verifyState } from '../services/authService';
import { buildSlackAuthorizeUrl, completeSlackOAuth, isSlackConfigured, notifyUser } from '../services/slackService';

const log = createLogger('slack');
export const slackRouter = Router();

slackRouter.get(
  '/status',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId: req.userId },
      select: { teamName: true, channel: true, createdAt: true },
    });
    res.json({ configured: isSlackConfigured(), connected: Boolean(integration), integration });
  }),
);

// "Connect Slack" button in the dashboard opens this URL
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!isSlackConfigured()) return res.redirect(`${env.FRONTEND_URL}/?slack=not_configured`);
  // The callback arrives through the https tunnel, where our session cookie
  // isn't available, so the user id travels in the signed state instead.
  const state = signState({ userId: (req as AuthedRequest).userId });
  res.redirect(buildSlackAuthorizeUrl(state));
});

// Slack redirects back here with ?code and ?state
slackRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    try {
      if (error) throw new Error(error);
      if (!code || !state) throw new Error('missing code/state');
      const { userId } = verifyState<{ userId: string }>(state);
      const integration = await completeSlackOAuth(userId, code);
      await notifyUser(
        userId,
        `:white_check_mark: ReachInbox Email Scheduler is connected to ${integration.channel}. ` +
          `You'll get a message here whenever a sender hits its hourly limit.`,
      );
      res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
    } catch (err) {
      log.warn('Slack OAuth failed', (err as Error).message);
      res.redirect(`${env.FRONTEND_URL}/?slack=error`);
    }
  }),
);

slackRouter.post(
  '/test',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const ok = await notifyUser(req.userId, ':wave: Test notification from ReachInbox Email Scheduler.');
    if (!ok) throw new HttpError(400, 'Slack is not connected (or the webhook was revoked)');
    res.json({ ok });
  }),
);

slackRouter.delete(
  '/',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    await prisma.slackIntegration.deleteMany({ where: { userId: req.userId } });
    res.json({ ok: true });
  }),
);
