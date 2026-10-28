import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { BorrowerType } from '../api/types';
import { Button, ErrorAlert, PageHeader, SelectField, TextField } from '../components/ui';
import { useAuth } from '../lib/auth';
import { BORROWER_TYPES, label } from '../lib/labels';

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', borrowerType: 'student', affiliation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api.register({ ...form, borrowerType: form.borrowerType as BorrowerType });
      signIn(t);
      navigate('/profile/verify', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Register as a borrower"
        intro="Students from any college, researchers, independent creators and early-stage teams can borrow for free, within fair-use limits."
      />
      <form onSubmit={submit} className="card space-y-4">
        <TextField label="Full name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} />
        <TextField label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        <TextField
          label="Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          hint="At least 8 characters."
        />
        <SelectField label="I am a" required value={form.borrowerType} onChange={set('borrowerType')}>
          {BORROWER_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </SelectField>
        <TextField
          label="College, institute or team"
          value={form.affiliation}
          onChange={set('affiliation')}
          hint="Optional. Leave empty if you are independent."
        />
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
        <p className="text-sm text-slate-700">
          After registering you can ask for verification, which many resources need. Already registered?{' '}
          <Link to="/signin">Sign in</Link>.
        </p>
      </form>
    </div>
  );
}
