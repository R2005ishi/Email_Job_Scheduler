import 'dotenv/config';
import { z } from 'zod';

const intFromEnv = (fallback: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? fallback : Number(v)), z.number().int().nonnegative());

const schema = z.object({
  PORT: intFromEnv(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_BASE_URL: z.string().default(''),

  ETHEREAL_ACCOUNTS: z.string().default(''),
  ETHEREAL_SENDER_COUNT: intFromEnv(3),

  WORKER_CONCURRENCY: intFromEnv(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: intFromEnv(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intFromEnv(200),
  EMAIL_SEND_ATTEMPTS: intFromEnv(3),

  BULL_BOARD_USER: z.string().default(''),
  BULL_BOARD_PASS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  SLACK_REDIRECT_BASE_URL: parsed.data.SLACK_REDIRECT_BASE_URL || parsed.data.BACKEND_URL,
};

export const isProd = process.env.NODE_ENV === 'production';
