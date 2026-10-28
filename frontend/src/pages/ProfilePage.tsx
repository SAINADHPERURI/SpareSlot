import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { BorrowerType, Profile } from '../api/types';
import { Alert, Button, Dl, Empty, ErrorAlert, LinkButton, Loading, PageHeader, Section, SelectField, StateChip, TextField } from '../components/ui';
import { day, hours, when } from '../lib/format';
import { BORROWER_TYPES, label } from '../lib/labels';

export function ProfilePage() {
  const q = useQuery({ queryKey: ['me'], queryFn: api.me });
  if (q.isLoading) return <Loading what="Loading your profile" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const p = q.data!;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" intro={`${label(p.role)} account · member since ${day(p.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsForm p={p} />
        {p.role === 'user' ? <TeamSection p={p} /> : (
          <Section title="Organisation">
            <Dl items={[['Organisation', p.orgName ?? '—'], ['Verified', p.orgVerified ? 'Yes' : 'Not yet']]} />
          </Section>
        )}
      </div>
      {p.role === 'user' && (
        <Section title="Credentials" actions={<LinkButton to="/profile/verify">Request verification</LinkButton>}>
          {p.credentials.length === 0 ? (
            <Empty>No credentials yet. Resources that need one will tell you which.</Empty>
          ) : (
            <ul className="divide-y divide-slate-200">
              {p.credentials.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{label(c.kind)}</span>
                    <StateChip status={c.expired && c.status === 'verified' ? 'expired' : c.status} />
                  </div>
                  <p className="text-sm text-slate-700">
                    Requested {when(c.createdAt)}
                    {c.expiresAt && <> · {c.expired ? 'expired' : 'expires'} {day(c.expiresAt)}</>}
                  </p>
                  {c.reviewReason && <p className="text-sm">Reviewer’s reason: {c.reviewReason}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-slate-700">
            Your evidence is shown only to reviewers (managers and owners). Other borrowers never see it. Hours in the last 30 days:{' '}
            {hours(p.hoursLast30Days)}.
          </p>
        </Section>
      )}
    </div>
  );
}

function DetailsForm({ p }: { p: Profile }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(p.fullName);
  const [borrowerType, setBorrowerType] = useState<string>(p.borrowerType ?? 'student');
  const [affiliation, setAffiliation] = useState(p.affiliation);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [fullName, borrowerType, affiliation]);
  const m = useMutation({
    mutationFn: () =>
      api.updateMe({ fullName, borrowerType: p.role === 'user' ? (borrowerType as BorrowerType) : null, affiliation }),
    onSuccess: (d) => {
      qc.setQueryData(['me'], d);
      setSaved(true);
    },
  });
  return (
    <Section title="Your details">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <TextField label="Email" value={p.email} readOnly disabled />
        <TextField label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        {p.role === 'user' && (
          <SelectField label="Borrower type" value={borrowerType} onChange={(e) => setBorrowerType(e.target.value)}>
            {BORROWER_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="College, institute or team" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
        <ErrorAlert error={m.error} />
        {saved && <p role="status" className="font-semibold text-green-900">✓ Saved</p>}
        <Button type="submit" busy={m.isPending}>
          Save details
        </Button>
      </form>
    </Section>
  );
}

function TeamSection({ p }: { p: Profile }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const onSuccess = (d: Profile) => qc.setQueryData(['me'], d);
  const create = useMutation({ mutationFn: () => api.createTeam(name.trim()), onSuccess });
  const join = useMutation({ mutationFn: () => api.joinTeam(code.trim()), onSuccess });
  const leave = useMutation({ mutationFn: api.leaveTeam, onSuccess });

  return (
    <Section title="Team">
      <p className="mb-3 text-sm text-slate-700">A startup team counts as one borrower for weekly limits: members share the hours.</p>
      {p.team ? (
        <div className="space-y-3">
          <Dl
            items={[
              ['Team', p.team.name],
              ['Members', p.team.members.join(', ')],
              ['Team code', <code className="break-all rounded bg-slate-100 px-1">{p.team.id}</code>],
            ]}
          />
          <p className="text-sm text-slate-700">Share the team code with teammates so they can join.</p>
          <ErrorAlert error={leave.error} />
          <Button variant="secondary" busy={leave.isPending} onClick={() => leave.mutate()}>
            Leave team
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <TextField label="New team name" value={name} onChange={(e) => setName(e.target.value)} />
            <ErrorAlert error={create.error} />
            <Button type="submit" variant="secondary" busy={create.isPending} disabled={!name.trim()}>
              Create team
            </Button>
          </form>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              join.mutate();
            }}
          >
            <TextField label="Team code" value={code} onChange={(e) => setCode(e.target.value)} hint="Ask a teammate for it." />
            <ErrorAlert error={join.error} />
            <Button type="submit" variant="secondary" busy={join.isPending} disabled={!code.trim()}>
              Join team
            </Button>
          </form>
        </div>
      )}
      {(create.isSuccess || join.isSuccess) && (
        <div className="mt-3">
          <Alert tone="success">You are now in a team.</Alert>
        </div>
      )}
    </Section>
  );
}
