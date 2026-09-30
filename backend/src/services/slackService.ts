import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';

const log = createLogger('slack');

export const SLACK_SCOPES = ['incoming-webhook'];

export const slackRedirectUri = () => `${env.SLACK_REDIRECT_BASE_URL}/api/slack/callback`;

export const isSlackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export function buildSlackAuthorizeUrl(state: string) {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_SCOPES.join(','));
  url.searchParams.set('redirect_uri', slackRedirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { channel: string; url: string };
}

/** Exchanges the OAuth code and stores the webhook for this user (upsert = reconnect). */
export async function completeSlackOAuth(userId: string, code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: slackRedirectUri(),
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.team) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'missing incoming_webhook'}`);
  }
  const payload = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token ?? null,
  };
  return prisma.slackIntegration.upsert({
    where: { userId },
    update: payload,
    create: { userId, ...payload },
  });
}

async function postToWebhook(webhookUrl: string, body: object) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
}

/**
 * Sends a message to the user's connected Slack. The integration is looked up
 * from the DB on every call, so connecting / disconnecting takes effect
 * immediately (no restart / redeploy). No integration => silently skipped.
 */
export async function notifyUser(userId: string, text: string, blocks?: object[]) {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return false;
  try {
    await postToWebhook(integration.webhookUrl, { text, ...(blocks ? { blocks } : {}) });
    return true;
  } catch (err) {
    // A revoked webhook must never break the email pipeline.
    log.warn(`Slack notify failed for user ${userId}`, (err as Error).message);
    return false;
  }
}

/**
 * Fires exactly one "hourly limit reached" message per (user, limit subject, hour window),
 * no matter how many workers hit the limit concurrently (Redis SET NX).
 */
export async function notifyRateLimitReached(params: {
  userId: string;
  kind: 'sender' | 'campaign';
  subjectId: string;
  label: string;
  limit: number;
  window: number;
  resumesAt: number;
}) {
  const dedupeKey = `slack:rl:${params.userId}:${params.kind}:${params.subjectId}:${params.window}`;
  const first = await redis.set(dedupeKey, '1', 'EX', 2 * 3600, 'NX');
  if (!first) return;

  const windowStart = new Date(params.window * 3_600_000);
  const what = params.kind === 'sender' ? `Sender *${params.label}*` : `Campaign *${params.label}*`;
  const text =
    `:rotating_light: ${what} reached its hourly limit of ${params.limit} emails ` +
    `for the hour starting ${windowStart.toUTCString()}. ` +
    `Remaining emails are queued and resume at ${new Date(params.resumesAt).toUTCString()}.`;

  const sent = await notifyUser(params.userId, text, [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'ReachInbox Email Scheduler • nothing was dropped, jobs were rescheduled' }],
    },
  ]);
  if (sent) log.info(`Rate-limit Slack alert sent to user ${params.userId} (${params.kind} ${params.label})`);
}
