import { NavLink, useNavigate } from 'react-router-dom';
import { useDashboard } from '../../context/DashboardContext';
import { Button } from '../ui/Button';
import { ClockIcon, SendIcon } from '../ui/Icons';
import { UserMenu } from './UserMenu';

const NAV = [
  { to: '/scheduled', label: 'Scheduled', icon: ClockIcon, countKey: 'scheduled' as const },
  { to: '/sent', label: 'Sent', icon: SendIcon, countKey: 'sent' as const },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { counts } = useDashboard();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-neutral-100 px-4 py-5">
      <div className="px-1 font-logo text-3xl leading-none tracking-tight text-neutral-900">ONB</div>
      <UserMenu />
      <Button variant="outline" rounded="full" fullWidth onClick={() => navigate('/compose')}>
        Compose
      </Button>

      <nav className="mt-2">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Core</p>
        <ul className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, countKey }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? 'bg-brand-50 font-semibold text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                  }`
                }
              >
                <Icon />
                <span className="flex-1">{label}</span>
                <span className="text-xs text-neutral-400">{counts ? counts[countKey] : '-'}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
