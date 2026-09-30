import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';

const log = createLogger('slack');

export const isSlackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

const redirectUri = () => `${env.SLACK_REDIRECT_BASE_URL}/api/slack/callback`;

export function buildSlackAuthorizeUrl(state: string) {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', redirectUri());
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

// Exchange the OAuth code for a webhook URL and save it for the user.
// Upsert, so reconnecting just replaces the old webhook.
export async function completeSlackOAuth(userId: string, code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: redirectUri(),
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.team) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'no incoming_webhook in response'}`);
  }

  const fields = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token ?? null,
  };
  return prisma.slackIntegration.upsert({
    where: { userId },
    update: fields,
    create: { userId, ...fields },
  });
}

// Posts a message to the user's Slack. The webhook is read from the DB each
// time, so connecting/disconnecting works without a restart. Returns false if
// the user hasn't connected Slack or the webhook call fails - a Slack problem
// should never break sending emails.
export async function notifyUser(userId: string, text: string) {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return false;

  try {
    const res = await fetch(integration.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`webhook returned ${res.status}`);
    return true;
  } catch (err) {
    log.warn(`Slack message failed for user ${userId}: ${(err as Error).message}`);
    return false;
  }
}

// Sends one alert per user + sender/campaign + hour. Several workers can hit
// the limit at the same moment, so the Redis SET NX makes sure only one sends.
export async function notifyLimitReached(params: {
  userId: string;
  type: 'sender' | 'campaign';
  id: string;
  name: string;
  limit: number;
  hour: number;
  resumesAt: number;
}) {
  const key = `slack:limit:${params.userId}:${params.type}:${params.id}:${params.hour}`;
  const isFirst = await redis.set(key, '1', 'EX', 2 * 3600, 'NX');
  if (!isFirst) return;

  const label = params.type === 'sender' ? `Sender *${params.name}*` : `Campaign *${params.name}*`;
  const text =
    `:rotating_light: ${label} reached its hourly limit of ${params.limit} emails. ` +
    `The remaining emails are still queued and will continue at ${new Date(params.resumesAt).toUTCString()}.`;

  if (await notifyUser(params.userId, text)) {
    log.info(`Limit alert sent to Slack for user ${params.userId} (${params.type}: ${params.name})`);
  }
}
