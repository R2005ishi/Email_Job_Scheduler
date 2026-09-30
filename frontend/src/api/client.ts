import type {
  CreateCampaignPayload,
  CreateCampaignResponse,
  EmailCounts,
  EmailDetail,
  EmailListResponse,
  EmailView,
  Sender,
  SlackStatus,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

// OAuth needs a full page redirect, so these are plain links, not fetch calls
export const oauthUrls = {
  googleLogin: '/api/auth/google',
  slackConnect: '/api/slack/connect',
  bullBoard: 'http://localhost:4000/admin/queues',
};

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listEmails: (params: { view: EmailView; q?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams({ view: params.view, page: String(params.page ?? 1), pageSize: String(params.pageSize ?? 50) });
    if (params.q) qs.set('q', params.q);
    return request<EmailListResponse>(`/emails?${qs}`);
  },
  emailCounts: () => request<EmailCounts>('/emails/counts'),
  getEmail: (id: string) => request<{ email: EmailDetail }>(`/emails/${id}`),

  senders: () => request<{ senders: Sender[] }>('/senders'),
  createCampaign: (payload: CreateCampaignPayload) =>
    request<CreateCampaignResponse>('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),

  slackStatus: () => request<SlackStatus>('/slack/status'),
  slackTest: () => request<{ ok: boolean }>('/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: true }>('/slack', { method: 'DELETE' }),
};
