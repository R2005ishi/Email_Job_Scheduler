import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { createLogger } from './lib/logger';
import { emailQueue } from './queue/emailQueue';
import { errorHandler } from './middleware/errors';
import { authRouter } from './routes/auth';
import { slackRouter } from './routes/slack';
import { emailsRouter } from './routes/emails';
import { campaignsRouter } from './routes/campaigns';
import { sendersRouter } from './routes/senders';
import { ensureSenders } from './services/senderService';
import { ensureIndex } from './services/searchService';
import { reconcilePendingEmails } from './services/reconcileService';

const log = createLogger('server');

function bullBoardAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.BULL_BOARD_USER) return next();
  const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
  const [user, pass] = Buffer.from(encoded ?? '', 'base64').toString().split(':');
  if (scheme === 'Basic' && user === env.BULL_BOARD_USER && pass === env.BULL_BOARD_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).send('Authentication required');
}

async function main() {
  const app = express();
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/senders', sendersRouter);

  // Live queue dashboard: waiting / delayed / active / completed / failed jobs.
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use('/admin/queues', bullBoardAuth, boardAdapter.getRouter());

  app.use(errorHandler);

  await ensureSenders();
  await ensureIndex();
  await reconcilePendingEmails();

  const server = app.listen(env.PORT, () => {
    log.info(`API listening on ${env.BACKEND_URL}`);
    log.info(`Bull Board at ${env.BACKEND_URL}/admin/queues`);
  });

  const shutdown = async () => {
    server.close();
    await emailQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  log.error('Server failed to start', err);
  process.exit(1);
});
