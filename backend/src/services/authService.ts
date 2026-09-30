import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export const SESSION_COOKIE = 'rib_session';
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface SessionPayload {
  sub: string;
}

export const signSession = (userId: string) =>
  jwt.sign({ sub: userId } satisfies SessionPayload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });

export const verifySession = (token: string) => jwt.verify(token, env.JWT_SECRET) as SessionPayload;

/** Short-lived signed state for OAuth round-trips (CSRF protection + carries the user id). */
export const signState = (payload: Record<string, string>) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: 600 });

export const verifyState = <T extends Record<string, string>>(state: string) => jwt.verify(state, env.JWT_SECRET) as T;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.BACKEND_URL.startsWith('https'),
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: '/',
};

export const googleRedirectUri = () => `${env.BACKEND_URL}/api/auth/google/callback`;

export function buildGoogleAuthUrl(state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Real authorization-code exchange with Google, then upsert the user. */
export async function loginWithGoogleCode(code: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const token = (await tokenRes.json()) as GoogleTokenResponse;
  if (!token.access_token) throw new Error(`Google token exchange failed: ${token.error_description ?? token.error}`);

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as GoogleUserInfo;

  return prisma.user.upsert({
    where: { googleId: info.sub },
    update: { email: info.email, name: info.name ?? info.email, avatarUrl: info.picture ?? null },
    create: { googleId: info.sub, email: info.email, name: info.name ?? info.email, avatarUrl: info.picture ?? null },
  });
}
