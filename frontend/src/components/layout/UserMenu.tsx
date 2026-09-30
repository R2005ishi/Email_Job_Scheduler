import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, oauthUrls } from '../../api/client';
import type { SlackStatus } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { Popover } from '../ui/Popover';
import { useToast } from '../ui/Toast';
import { ChevronDownIcon, ExternalIcon, LogOutIcon, SlackIcon } from '../ui/Icons';
import { Spinner } from '../ui/Spinner';

const SLACK_RESULT_MESSAGES: Record<string, [kind: 'success' | 'error', message: string]> = {
  connected: ['success', 'Slack connected - rate-limit alerts will be posted there.'],
  error: ['error', 'Slack connection failed. Please try again.'],
  not_configured: ['error', 'Slack OAuth is not configured on the server (SLACK_CLIENT_ID / SECRET).'],
};

// Profile card in the sidebar, with a menu for Slack and logout
export function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSlack = useCallback(() => api.slackStatus().then(setSlack).catch(() => setSlack(null)), []);

  useEffect(() => {
    void loadSlack();
  }, [loadSlack]);

  // after Slack OAuth we come back with ?slack=connected or ?slack=error
  useEffect(() => {
    const result = params.get('slack');
    if (!result) return;
    const entry = SLACK_RESULT_MESSAGES[result];
    if (entry) toast[entry[0]](entry[1]);
    params.delete('slack');
    setParams(params, { replace: true });
    void loadSlack();
  }, [params, setParams, toast, loadSlack]);

  if (!user) return null;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await loadSlack();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-72 p-2"
      trigger={
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition hover:bg-neutral-100"
        >
          <Avatar name={user.name} src={user.avatarUrl} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-900">{user.name}</span>
            <span className="block truncate text-xs text-neutral-500">{user.email}</span>
          </span>
          <ChevronDownIcon className="text-neutral-400" />
        </button>
      }
    >
      <div className="px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Slack alerts</p>
        {!slack ? (
          <Spinner size={14} className="mt-2 text-neutral-400" />
        ) : slack.connected && slack.integration ? (
          <p className="mt-1 text-sm text-neutral-700">
            Connected to <b>{slack.integration.teamName}</b>, {slack.integration.channel}
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">Get notified when a sender hits its hourly limit.</p>
        )}
      </div>

      {slack?.connected ? (
        <>
          <MenuItem disabled={busy} onClick={() => run(api.slackTest, 'Test message sent to Slack')}>
            <SlackIcon /> Send test message
          </MenuItem>
          <MenuItem disabled={busy} onClick={() => window.location.assign(oauthUrls.slackConnect)}>
            <SlackIcon /> Reconnect Slack
          </MenuItem>
          <MenuItem disabled={busy} danger onClick={() => run(api.slackDisconnect, 'Slack disconnected')}>
            <SlackIcon /> Disconnect Slack
          </MenuItem>
        </>
      ) : (
        <MenuItem onClick={() => window.location.assign(oauthUrls.slackConnect)}>
          <SlackIcon /> Connect Slack
        </MenuItem>
      )}

      <div className="my-1 border-t border-neutral-100" />
      <MenuItem onClick={() => window.open(oauthUrls.bullBoard, '_blank', 'noopener')}>
        <ExternalIcon /> Queue dashboard (Bull Board)
      </MenuItem>
      <MenuItem
        danger
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
      >
        <LogOutIcon /> Log out
      </MenuItem>
    </Popover>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition disabled:opacity-50 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  );
}
