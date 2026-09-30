import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { formatFullDate } from '../lib/format';
import { StatusBadge } from '../components/emails/StatusBadge';
import { Avatar } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertIcon, ArchiveIcon, ArrowLeftIcon, ChevronDownIcon, ExternalIcon, StarIcon, TrashIcon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useAsync(() => api.getEmail(id), [id]);
  const email = data?.email;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-brand-500">
        <Spinner size={24} />
      </div>
    );
  }
  if (error || !email) {
    return (
      <EmptyState
        icon={<AlertIcon size={24} />}
        title="Email not found"
        description={error ?? undefined}
        action={<Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>}
      />
    );
  }

  const when = email.sentAt ?? email.slotAt ?? email.scheduledAt;

  return (
    <div className="px-6 py-5">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeftIcon size={20} />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-xl font-medium text-neutral-900">{email.subject}</h1>
        <IconButton label="Star"><StarIcon /></IconButton>
        <IconButton label="Archive"><ArchiveIcon /></IconButton>
        <IconButton label="Delete"><TrashIcon /></IconButton>
        {user && <Avatar name={user.name} src={user.avatarUrl} size={30} />}
      </header>

      <article className="mt-6 flex gap-4">
        <Avatar name={email.sender.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm">
                <span className="font-semibold text-neutral-900">{email.sender.name}</span>{' '}
                <span className="text-neutral-500">&lt;{email.sender.email}&gt;</span>
              </p>
              <p className="flex items-center gap-1 text-xs text-neutral-500">
                to {email.toEmail} <ChevronDownIcon size={12} />
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-neutral-500">{formatFullDate(when)}</span>
              <StatusBadge email={email} />
            </div>
          </div>

          <div className="email-body mt-6 max-w-3xl text-sm leading-relaxed text-neutral-800" dangerouslySetInnerHTML={{ __html: email.body }} />

          <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-surface p-4 text-xs text-neutral-600 sm:grid-cols-4">
            <Meta label="Requested for" value={formatFullDate(email.scheduledAt)} />
            <Meta label="Send slot" value={email.slotAt ? formatFullDate(email.slotAt) : '—'} />
            <Meta label="Attempts" value={String(email.attempts)} />
            <Meta label="Rate-limit deferrals" value={String(email.deferredCount)} />
            {email.error && <Meta label="Last error" value={email.error} wide />}
          </dl>

          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              View delivered message on Ethereal <ExternalIcon size={14} />
            </a>
          )}
        </div>
      </article>
    </div>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="font-medium text-neutral-700">{value}</dd>
    </div>
  );
}
