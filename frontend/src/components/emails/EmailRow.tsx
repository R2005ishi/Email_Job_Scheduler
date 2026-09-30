import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { EmailItem } from '../../api/types';
import { formatBadgeTime, formatFullDate, htmlToText } from '../../lib/format';
import { StarIcon } from '../ui/Icons';
import { StatusBadge } from './StatusBadge';

export const EmailRow = memo(function EmailRow({ email }: { email: EmailItem }) {
  const time = email.sentAt ?? email.slotAt ?? email.scheduledAt;
  return (
    <li>
      <Link
        to={`/emails/${email.id}`}
        className="group flex items-center gap-4 border-b border-neutral-100 px-6 py-3.5 text-sm transition hover:bg-neutral-50"
      >
        <span className="w-52 shrink-0 truncate text-neutral-800">
          <span className="text-neutral-500">To:</span> {email.toEmail}
        </span>
        <StatusBadge email={email} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-neutral-900">{email.subject}</span>
          <span className="text-neutral-400"> - {htmlToText(email.body)}</span>
        </span>
        <span className="hidden max-w-48 shrink-0 truncate text-xs text-neutral-400 2xl:block">from {email.sender.email}</span>
        {(email.status === 'SENT' || email.status === 'FAILED') && (
          <span className="shrink-0 text-xs text-neutral-500" title={formatFullDate(time)}>
            {formatBadgeTime(time)}
          </span>
        )}
        <StarIcon className="shrink-0 text-neutral-300 group-hover:text-neutral-400" />
      </Link>
    </li>
  );
});

export function EmailRowSkeleton() {
  return (
    <li className="flex animate-pulse items-center gap-4 border-b border-neutral-100 px-6 py-4">
      <span className="h-3 w-44 rounded bg-neutral-100" />
      <span className="h-5 w-28 rounded-full bg-neutral-100" />
      <span className="h-3 flex-1 rounded bg-neutral-100" />
    </li>
  );
}
