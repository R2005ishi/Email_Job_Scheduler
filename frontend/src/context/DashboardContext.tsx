import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EmailCounts } from '../api/types';

interface DashboardState {
  counts: EmailCounts | null;
  refreshCounts: () => Promise<void>;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<EmailCounts | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await api.emailCounts());
    } catch {
      /* sidebar counters are non-critical */
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
    const t = setInterval(refreshCounts, 10_000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  return <DashboardContext.Provider value={{ counts, refreshCounts }}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}
