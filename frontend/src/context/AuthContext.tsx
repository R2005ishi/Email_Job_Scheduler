import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, oauthUrls } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // goes to the backend, which redirects to Google
  const login = useCallback(() => window.location.assign(oauthUrls.googleLogin), []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
