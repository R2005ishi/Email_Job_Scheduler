export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
export type EmailView = 'scheduled' | 'sent';

export interface SenderSummary {
  id: string;
  email: string;
  name: string;
}

export interface Sender extends SenderSummary {
  hourlyLimit: number;
}

export interface EmailItem {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  slotAt: string | null;
  sentAt: string | null;
  error: string | null;
  deferredCount: number;
  previewUrl: string | null;
  campaignId: string;
  sender: SenderSummary;
}

export interface EmailDetail extends EmailItem {
  attempts: number;
  messageId: string | null;
  createdAt: string;
}

export interface EmailListResponse {
  items: EmailItem[];
  total: number;
  page: number;
  pageSize: number;
  source?: 'elasticsearch' | 'postgres';
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
  failed: number;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  integration: { teamName: string; channel: string; createdAt: string } | null;
}

export interface CreateCampaignPayload {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface CreateCampaignResponse {
  campaign: { id: string };
  scheduledCount: number;
}
