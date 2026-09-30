import { FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { GoogleIcon } from '../components/ui/Icons';
import { Input } from '../components/ui/Input';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

const ERRORS: Record<string, string> = {
  google_login_failed: 'Google sign-in failed. Please try again.',
  google_not_configured: 'Google OAuth is not configured on the server (GOOGLE_CLIENT_ID / SECRET).',
};

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;

  const onEmailLogin = (e: FormEvent) => {
    e.preventDefault();
    toast.info('Email/password login is not enabled - please continue with Google.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-100 p-8 shadow-[0_2px_30px_rgba(0,0,0,0.04)]">
        <h1 className="mb-8 text-center text-3xl font-semibold text-neutral-900">Login</h1>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {ERRORS[error] ?? 'Something went wrong. Please try again.'}
          </p>
        )}

        <Button variant="soft" size="lg" fullWidth icon={<GoogleIcon />} onClick={login}>
          Login with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" />
          or sign up through email
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <form onSubmit={onEmailLogin} className="space-y-3">
          <Input type="email" placeholder="Email ID" autoComplete="email" />
          <Input type="password" placeholder="Password" autoComplete="current-password" />
          <Button type="submit" size="lg" fullWidth className="!mt-6">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
