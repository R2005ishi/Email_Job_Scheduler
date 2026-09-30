import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardProvider } from '../../context/DashboardContext';
import { FullPageSpinner } from '../ui/Spinner';
import { Sidebar } from './Sidebar';

/** Auth-guarded dashboard shell. */
export function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <DashboardProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </DashboardProvider>
  );
}
