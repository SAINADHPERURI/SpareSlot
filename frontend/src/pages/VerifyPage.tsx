import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Credential, CredentialKind } from '../api/types';
import { Alert, Button, ErrorAlert, PageHeader, SelectField, TextArea, TextField } from '../components/ui';
import { CREDENTIAL_KINDS, EVIDENCE_GUIDANCE, label } from '../lib/labels';

export function VerifyPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const initial = (CREDENTIAL_KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as CredentialKind) : 'student_id';
  const [kind, setKind] = useState<CredentialKind>(initial);
  const [evidence, setEvidence] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filed, setFiled] = useState<Credential | null>(null);
  const orgs = useQuery({ queryKey: ['organisations'], queryFn: api.organisations });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api.fileCredential({
        kind,
        evidence: evidence.trim(),
        expiresAt: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
        orgId: orgId || null,
      });
      setFiled(c);
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (filed) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader title="Verification requested" />
        <Alert tone="success" title={`${label(filed.kind)} sent for review`}>
          A manager or owner{filed.orgName ? ` at ${filed.orgName}` : ''} will check it and give you a reason either way. You will
          get a notification.
        </Alert>
        <p>
          <Link to="/profile">Back to your profile</Link> · <Link to="/">Discover resources</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Request verification"
        intro="Some resources need proof of who you are. A reviewer checks your evidence; only reviewers can see it."
      />
      <form onSubmit={submit} className="card space-y-4">
        <SelectField label="Credential" required value={kind} onChange={(e) => setKind(e.target.value as CredentialKind)}>
          {CREDENTIAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </SelectField>
        <Alert tone="info" title={`How ${label(kind)} is checked`}>
          {EVIDENCE_GUIDANCE[kind]}
        </Alert>
        <TextArea
          label="Evidence"
          required
          rows={5}
          maxLength={2000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          hint="Do not paste passwords or full ID numbers you would not show a lab manager. Use fictional details in the demo."
        />
        <TextField label="Expires on" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} hint="Optional, e.g. when your student card runs out." />
        <SelectField label="Who should review it" value={orgId} onChange={(e) => setOrgId(e.target.value)} hint="Optional. Leave it to any reviewer, or pick the organisation you want to borrow from.">
          <option value="">Any reviewer</option>
          {orgs.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!evidence.trim()} className="w-full">
          Send for review
        </Button>
      </form>
    </div>
  );
}
