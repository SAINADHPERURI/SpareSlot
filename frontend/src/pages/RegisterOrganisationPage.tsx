import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Alert, Button, ErrorAlert, PageHeader, SelectField, TextArea, TextField } from '../components/ui';
import { useAuth } from '../lib/auth';
import { label } from '../lib/labels';

export function RegisterOrganisationPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organisationName: '',
    kind: 'college_lab',
    location: '',
    description: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api.registerOrganisation(form));
      navigate('/staff', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Register your organisation" intro="List your idle equipment and spaces for people who cannot afford them." />
      <div className="mb-4">
        <Alert tone="info" title="An admin verifies every organisation">
          Your listings stay hidden from borrowers until a platform admin verifies your organisation. You can prepare them now.
        </Alert>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">Organisation</legend>
          <TextField label="Organisation name" required value={form.organisationName} onChange={set('organisationName')} />
          <SelectField label="Kind" required value={form.kind} onChange={set('kind')}>
            {['college_lab', 'makerspace', 'studio', 'other'].map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </SelectField>
          <TextField label="Location" value={form.location} onChange={set('location')} hint="Area or campus, so borrowers know where to go." />
          <TextArea label="About" value={form.description} onChange={set('description')} />
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">You, the owner</legend>
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
        </fieldset>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} className="w-full">
          Register organisation
        </Button>
      </form>
    </div>
  );
}
