import nodemailer, { Transporter } from 'nodemailer';
import type { Sender } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';

const log = createLogger('senders');
const SENDER_NAMES = ['Oliver Brown', 'Sales Team', 'Support Desk', 'Growth Team', 'Founders Office'];

interface EtherealAccountInput {
  user: string;
  pass: string;
  name?: string;
}

// Creates the sender accounts on first start. Uses ETHEREAL_ACCOUNTS if set,
// otherwise creates new Ethereal accounts and saves them in the DB.
export async function ensureSenders() {
  const existing = await prisma.sender.count();

  if (env.ETHEREAL_ACCOUNTS.trim()) {
    const accounts = JSON.parse(env.ETHEREAL_ACCOUNTS) as EtherealAccountInput[];
    for (const [i, acc] of accounts.entries()) {
      await prisma.sender.upsert({
        where: { email: acc.user },
        update: { smtpPass: acc.pass },
        create: {
          email: acc.user,
          name: acc.name ?? SENDER_NAMES[i % SENDER_NAMES.length],
          smtpHost: 'smtp.ethereal.email',
          smtpPort: 587,
          smtpUser: acc.user,
          smtpPass: acc.pass,
        },
      });
    }
    return;
  }

  const missing = env.ETHEREAL_SENDER_COUNT - existing;
  for (let i = 0; i < missing; i++) {
    const account = await createEtherealAccount();
    await prisma.sender.create({
      data: {
        email: account.user,
        name: SENDER_NAMES[(existing + i) % SENDER_NAMES.length],
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });
    log.info(`Created Ethereal sender ${account.user} (inbox: https://ethereal.email/login)`);
  }
}

interface EtherealApiAccount {
  status: string;
  user: string;
  pass: string;
  smtp: { host: string; port: number };
  error?: string;
}

// nodemailer.createTestAccount() caches its account, so it always returns the
// same one. Calling the Ethereal API directly gives us a new account each time.
async function createEtherealAccount(): Promise<EtherealApiAccount> {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-email-scheduler', version: '1.0.0' }),
  });
  const data = (await res.json()) as EtherealApiAccount;
  if (data.status !== 'success') throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  return data;
}

const transporters = new Map<string, Transporter>();

// One pooled SMTP connection per sender, reused between jobs
export function getTransporter(sender: Sender): Transporter {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 3,
    });
    transporters.set(sender.id, t);
  }
  return t;
}

export const senderHourlyLimit = (sender: Pick<Sender, 'hourlyLimit'>) =>
  sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
