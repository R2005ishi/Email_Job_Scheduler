/**
 * Schedules N emails for (roughly) the same instant to demonstrate behaviour under load.
 *
 *   npm run load-test -- --count 1000 --in 30 --hourly 50 [--user you@gmail.com]
 *
 * Watch it in Bull Board (/admin/queues): all jobs become due together, each one
 * reserves its own slot (min gap + hourly cap), and the overflow is moved to the
 * next hour window instead of being dropped.
 */
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { emailQueue } from '../queue/emailQueue';
import { createCampaign } from '../services/campaignService';

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const count = Number(arg('count', '1000'));
  const inSeconds = Number(arg('in', '30'));
  const hourly = Number(arg('hourly', '0'));
  const userEmail = arg('user');

  const user = userEmail
    ? await prisma.user.findUnique({ where: { email: userEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No user found - log in through the dashboard once first');

  const sender = await prisma.sender.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!sender) throw new Error('No senders - start the API once so it can create Ethereal senders');

  const recipients = Array.from({ length: count }, (_, i) => `lead${i + 1}@example.com`);
  const started = Date.now();
  const { scheduledCount } = await createCampaign({
    userId: user.id,
    senderId: sender.id,
    subject: `Load test ${new Date().toISOString()}`,
    body: '<p>Hi there,</p><p>This is a load-test email from the ReachInbox scheduler.</p>',
    recipients,
    startAt: new Date(Date.now() + inSeconds * 1000),
    delaySeconds: 0,
    hourlyLimit: hourly,
  });
  console.log(
    `Scheduled ${scheduledCount} emails for ${user.email} via ${sender.email} ` +
      `in ${Date.now() - started}ms. They become due in ${inSeconds}s (campaign hourly cap: ${hourly || 'none'}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await emailQueue.close();
    await redis.quit();
    await prisma.$disconnect();
  });
