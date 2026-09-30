import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import {
  buildGoogleAuthUrl,
  loginWithGoogleCode,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  signState,
  verifyState,
} from '../services/authService';

const log = createLogger('auth');
const STATE_COOKIE = 'rib_oauth_state';
export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${env.FRONTEND_URL}/login?error=google_not_configured`);
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });
  res.redirect(buildGoogleAuthUrl(signState({ nonce })));
});

authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    try {
      if (error) throw new Error(error);
      if (!code || !state) throw new Error('missing code/state');
      const { nonce } = verifyState<{ nonce: string }>(state);
      if (nonce !== req.cookies?.[STATE_COOKIE]) throw new Error('state mismatch');

      const user = await loginWithGoogleCode(code);
      res.clearCookie(STATE_COOKIE, { path: '/' });
      res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions);
      res.redirect(`${env.FRONTEND_URL}/`);
    } catch (err) {
      log.warn('Google login failed', (err as Error).message);
      res.redirect(`${env.FRONTEND_URL}/login?error=google_login_failed`);
    }
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    if (!user) throw new HttpError(401, 'User not found');
    res.json({ user });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});
