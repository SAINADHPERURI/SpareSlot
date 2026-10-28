import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Credential } from '../api/types';
import { ReasonDialog } from '../components/ReasonDialog';
import { Button, Empty, ErrorAlert, Loading, PageHeader, SelectField, StateChip, TextField } from '../components/ui';
import { day, when } from '../lib/format';
import { label } from '../lib/labels';

export function VerificationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const q = useQuery({ queryKey: ['credentials', status], queryFn: () => api.credentialQueue(status) });
  const [reviewing, setReviewing] = useState<{ c: Credential; decision: 'verified' | 'rejected' } | null>(null);
  const [expiry, setExpiry] = useState('');

  return (
    <div>
      <PageHeader
        title="Verification requests"
        intro="Check each borrower’s evidence and verify or reject it with a reason they will read. Evidence is shown only to reviewers."
      />
      <div className="mb-4 w-60">
        <SelectField label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Waiting for review</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </SelectField>
      </div>
      {q.isLoading && <Loading what="Loading requests" />}
      <ErrorAlert error={q.error} />
      {q.data && q.data.length === 0 && <Empty>Nothing here.</Empty>}
      <ul className="space-y-3">
        {q.data?.map((c) => (
          <li key={c.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">
                {label(c.kind)} — {c.userName}
              </h2>
              <StateChip status={c.expired && c.status === 'verified' ? 'expired' : c.status} />
            </div>
            <p className="text-sm text-slate-700">
              {c.borrowerType ? label(c.borrowerType) : 'Borrower'}
              {c.affiliation && ` · ${c.affiliation}`} · filed {when(c.createdAt)}
              {c.orgName ? ` · addressed to ${c.orgName}` : ' · any reviewer'}
              {c.expiresAt && ` · expires ${day(c.expiresAt)}`}
            </p>
            <blockquote className="mt-2 whitespace-pre-line rounded-md border-l-4 border-slate-300 bg-slate-50 p-3">{c.evidence}</blockquote>
            {c.reviewReason && (
              <p className="mt-2 text-sm">
                Decision by {c.reviewedByName}: {c.reviewReason}
              </p>
            )}
            {c.status === 'pending' && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => { setExpiry(''); setReviewing({ c, decision: 'verified' }); }}>Verify</Button>
                <Button variant="danger" onClick={() => setReviewing({ c, decision: 'rejected' })}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {reviewing && (
        <ReasonDialog
          title={`${reviewing.decision === 'verified' ? 'Verify' : 'Reject'} ${label(reviewing.c.kind)} for ${reviewing.c.userName}`}
          intro={reviewing.decision === 'rejected' ? 'Say what is missing, so they can file a better request.' : 'Say what you checked.'}
          submitLabel={reviewing.decision === 'verified' ? 'Verify' : 'Reject'}
          danger={reviewing.decision === 'rejected'}
          onClose={() => setReviewing(null)}
          onSubmit={async (reason) => {
            await api.reviewCredential(reviewing.c.id, {
              decision: reviewing.decision,
              reason,
              expiresAt: reviewing.decision === 'verified' && expiry ? new Date(expiry + 'T23:59:59').toISOString() : null,
            });
            qc.invalidateQueries({ queryKey: ['credentials'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        >
          {reviewing.decision === 'verified' && (
            <TextField
              label="Valid until"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              hint="Optional. Leave empty to keep the date the borrower gave, if any."
            />
          )}
        </ReasonDialog>
      )}
    </div>
  );
}
