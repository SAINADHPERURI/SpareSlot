import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { TokenResponse } from '../api/types';
import { Alert, Button, ErrorAlert, PageHeader, TextField } from '../components/ui';
import { homeFor, useAuth } from '../lib/auth';
import { label } from '../lib/labels';

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { from?: string; expired?: boolean };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: api.demoAccounts, staleTime: 60_000 });

  function done(t: TokenResponse) {
    signIn(t);
    navigate(state.from && state.from !== '/signin' ? state.from : homeFor(t.role), { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy('form');
    setError(null);
    try {
      done(await api.login(email, password));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function demoLogin(accountEmail: string) {
    setBusy(accountEmail);
    setError(null);
    try {
      done(await api.demoLogin(accountEmail));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const accounts = demo.data ?? [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Sign in"
        intro={
          <>
            New here? Take the <Link to="/tour">judge’s tour</Link>: ten steps through the whole booking journey.
          </>
        }
      />
      {state.expired && (
        <div className="mb-4">
          <Alert tone="warning" title="Please sign in again">
            Your session ended. Sign in to continue.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={submit} className="card space-y-4" aria-labelledby="signin-title">
          <h2 id="signin-title" className="text-lg font-bold">
            With your email
          </h2>
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorAlert error={error} />
          <Button type="submit" busy={busy === 'form'} className="w-full">
            Sign in
          </Button>
          <p className="text-sm text-slate-700">
            No account? <Link to="/register">Register as a borrower</Link> or{' '}
            <Link to="/register-organisation">register your organisation</Link>.
          </p>
        </form>

        {accounts.length > 0 && (
          <section className="card" aria-labelledby="demo-title">
            <h2 id="demo-title" className="text-lg font-bold">
              Sign in as a demo account
            </h2>
            <p className="mb-3 text-sm text-slate-700">
              Fictional people for judging. Try each role to see what it can and cannot do.
            </p>
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.email}>
                  <Button
                    variant="secondary"
                    className="w-full justify-between text-left"
                    busy={busy === a.email}
                    onClick={() => demoLogin(a.email)}
                  >
                    <span>
                      <span className="block font-semibold">{a.fullName}</span>
                      <span className="block text-xs font-normal text-slate-700">
                        {label(a.role)}
                        {a.borrowerType ? ` · ${label(a.borrowerType)}` : ''}
                        {a.orgName ? ` · ${a.orgName}` : ''}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
