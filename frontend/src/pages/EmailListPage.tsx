import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { EmailView } from '../api/types';
import { useDashboard } from '../context/DashboardContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { EmailRow, EmailRowSkeleton } from '../components/emails/EmailRow';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertIcon, ClockIcon, FilterIcon, RefreshIcon, SearchIcon, SendIcon } from '../components/ui/Icons';

const PAGE_SIZE = 50;

const EMPTY_COPY: Record<EmailView, { title: string; description: string }> = {
  scheduled: {
    title: 'No scheduled emails',
    description: 'Compose a new email, upload your leads and pick a start time - they will show up here.',
  },
  sent: {
    title: 'No sent emails yet',
    description: 'Emails appear here as soon as the scheduler delivers (or fails to deliver) them.',
  },
};

export function EmailListPage({ view }: { view: EmailView }) {
  const navigate = useNavigate();
  const { refreshCounts } = useDashboard();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), 300);

  useEffect(() => setPage(1), [view, q]);

  const { data, loading, error, reload } = useAsync(
    () => api.listEmails({ view, q: q || undefined, page, pageSize: PAGE_SIZE }),
    [view, q, page],
  );

  // refresh every 10s so sent emails move over without reloading
  useEffect(() => {
    const t = setInterval(() => void reload(), 10_000);
    return () => clearInterval(t);
  }, [reload]);

  const refresh = () => {
    void reload();
    void refreshCounts();
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const empty = EMPTY_COPY[view];

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-6 pt-5 pb-3">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-4 text-neutral-500 focus-within:ring-2 focus-within:ring-brand-500/30">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${view} emails`}
            className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </label>
        <IconButton label="Filter">
          <FilterIcon />
        </IconButton>
        <IconButton label="Refresh" onClick={refresh}>
          <RefreshIcon className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </header>

      {data?.source && q && (
        <p className="px-6 pb-1 text-xs text-neutral-400">
          {data.total} result{data.total === 1 ? '' : 's'} (searched via {data.source === 'elasticsearch' ? 'Elasticsearch' : 'Postgres fallback'})
        </p>
      )}

      <div className="flex-1">
        {error ? (
          <EmptyState
            icon={<AlertIcon size={24} />}
            title="Couldn't load emails"
            description={error}
            action={<Button variant="outline" onClick={refresh}>Try again</Button>}
          />
        ) : loading && !data ? (
          <ul>{Array.from({ length: 8 }, (_, i) => <EmailRowSkeleton key={i} />)}</ul>
        ) : !data?.items.length ? (
          <EmptyState
            icon={view === 'scheduled' ? <ClockIcon size={24} /> : <SendIcon size={24} />}
            title={q ? 'No matches' : empty.title}
            description={q ? `Nothing matches "${q}".` : empty.description}
            action={!q && <Button onClick={() => navigate('/compose')}>Compose New Email</Button>}
          />
        ) : (
          <ul>{data.items.map((email) => <EmailRow key={email.id} email={email} />)}</ul>
        )}
      </div>

      {data && totalPages > 1 && !q && (
        <footer className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-3 text-sm text-neutral-500">
          <span>
            Page {page} of {totalPages} ({data.total} emails)
          </span>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </footer>
      )}
    </div>
  );
}
