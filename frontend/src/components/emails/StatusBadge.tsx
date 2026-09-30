import type { EmailItem } from '../../api/types';
import { formatBadgeTime } from '../../lib/format';
import { ClockIcon } from '../ui/Icons';

const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

export function StatusBadge({ email }: { email: EmailItem }) {
  switch (email.status) {
    case 'SENT':
      return <span className={`${base} bg-neutral-100 text-neutral-600`}>Sent</span>;
    case 'FAILED':
      return (
        <span className={`${base} bg-red-50 text-red-600`} title={email.error ?? undefined}>
          Failed
        </span>
      );
    case 'SENDING':
      return <span className={`${base} bg-blue-50 text-blue-600`}>Sending...</span>;
    default: {
      const when = email.slotAt ?? email.scheduledAt;
      const deferred = email.deferredCount > 0;
      return (
        <span
          className={`${base} ${deferred ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-700'}`}
          title={deferred ? 'Rescheduled to a later hour because an hourly limit was reached' : 'Scheduled'}
        >
          <ClockIcon size={12} />
          {formatBadgeTime(when)}
          {deferred && ' (rate limited)'}
        </span>
      );
    }
  }
}
