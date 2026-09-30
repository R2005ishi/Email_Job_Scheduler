import { Client } from '@elastic/elasticsearch';
import type { Email, Sender } from '@prisma/client';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';

const log = createLogger('search');
export const es = new Client({ node: env.ELASTICSEARCH_URL });
const INDEX = env.ELASTICSEARCH_INDEX;

export async function ensureIndex() {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (exists) return;
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          status: { type: 'keyword' },
          toEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          senderEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          scheduledAt: { type: 'date' },
          slotAt: { type: 'date' },
          sentAt: { type: 'date' },
        },
      },
    });
    log.info(`Created Elasticsearch index "${INDEX}"`);
  } catch (err) {
    log.warn('Elasticsearch unavailable - search will fall back to Postgres', (err as Error).message);
  }
}

type IndexableEmail = Email & { sender?: Pick<Sender, 'email'> | null };

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const toDoc = (e: IndexableEmail) => ({
  userId: e.userId,
  campaignId: e.campaignId,
  status: e.status,
  toEmail: e.toEmail,
  senderEmail: e.sender?.email,
  subject: e.subject,
  body: stripHtml(e.body),
  scheduledAt: e.scheduledAt,
  slotAt: e.slotAt,
  sentAt: e.sentAt,
});

/** Indexing is best-effort: search must never block or break sending. */
export async function indexEmails(emails: IndexableEmail[]) {
  if (!emails.length) return;
  try {
    const operations = emails.flatMap((e) => [{ index: { _index: INDEX, _id: e.id } }, toDoc(e)]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) log.warn('Some documents failed to index');
  } catch (err) {
    log.warn('Bulk index failed', (err as Error).message);
  }
}

export async function indexEmail(email: IndexableEmail) {
  try {
    await es.index({ index: INDEX, id: email.id, document: toDoc(email) });
  } catch (err) {
    log.warn(`Index failed for ${email.id}`, (err as Error).message);
  }
}

/** Returns matching email ids ordered by relevance, or null if ES is down. */
export async function searchEmailIds(userId: string, q: string, statuses?: string[]): Promise<string[] | null> {
  try {
    const fields = ['subject^3', 'toEmail^2', 'senderEmail', 'body'];
    const res = await es.search({
      index: INDEX,
      size: 100,
      _source: false,
      query: {
        bool: {
          filter: [{ term: { userId } }, ...(statuses?.length ? [{ terms: { status: statuses } }] : [])],
          // typo-tolerant full-word match OR search-as-you-type prefix match;
          // operator=and so "john@acme.com" doesn't match every "@acme.com" row.
          should: [
            { multi_match: { query: q, fields, fuzziness: 'AUTO', operator: 'and' } },
            { multi_match: { query: q, fields, type: 'bool_prefix', operator: 'and' } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    return res.hits.hits.map((h) => h._id as string);
  } catch (err) {
    log.warn('Search failed, falling back to Postgres', (err as Error).message);
    return null;
  }
}
