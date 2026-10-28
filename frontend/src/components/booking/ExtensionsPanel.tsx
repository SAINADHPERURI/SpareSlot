import { useState } from 'react';
import { api } from '../../api';
import type { BookingDetail, BookingExtension } from '../../api/types';
import { localInputToIso, toLocalInput, when } from '../../lib/format';
import { ReasonDialog } from '../ReasonDialog';
import { Button, ErrorAlert, Section, StateChip, TextArea, TextField } from '../ui';
import { useBookingRefresh } from './useBookingRefresh';

export function ExtensionsPanel({ detail }: { detail: BookingDetail }) {
  const b = detail.booking;
  const refresh = useBookingRefresh(b.id);
  const staff = detail.myRole === 'owner' || detail.myRole === 'manager';
  const canRequest = b.allowedActions.includes('request_extension');
  const [showForm, setShowForm] = useState(false);
  const [end, setEnd] = useState(() => toLocalInput(new Date(new Date(b.endAt).getTime() + 3600_000)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [deciding, setDeciding] = useState<{ ext: BookingExtension; action: 'approve' | 'reject' } | null>(null);

  if (detail.extensions.length === 0 && !canRequest && !b.blockedActions.request_extension) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.requestExtension(b.id, localInputToIso(end), reason.trim());
      setShowForm(false);
      setReason('');
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="More time"
      id="extensions"
      actions={canRequest && !showForm ? <Button variant="secondary" onClick={() => setShowForm(true)}>Ask for more time</Button> : undefined}
    >
      {b.blockedActions.request_extension && <p className="mb-2 text-sm text-slate-700">{b.blockedActions.request_extension}</p>}
      {detail.extensions.length === 0 && !showForm && <p className="text-slate-700">No extension requests.</p>}
      <ul className="space-y-3">
        {detail.extensions.map((x) => (
          <li key={x.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Until {when(x.requestedEndAt)}</span>
              <StateChip status={x.status} />
            </div>
            <p className="text-sm">Why: {x.reason}</p>
            {x.decisionReason && (
              <p className="text-sm">
                Decision: {x.decisionReason} ({x.decidedByName}, {when(x.decidedAt)})
              </p>
            )}
            {staff && x.status === 'requested' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => setDeciding({ ext: x, action: 'approve' })}>Approve more time</Button>
                <Button variant="danger" onClick={() => setDeciding({ ext: x, action: 'reject' })}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <TextField
            label="New end time"
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            hint={`Now ends ${when(b.endAt)}. It must stay free of other bookings and within your weekly limit.`}
          />
          <TextArea label="Why do you need more time?" required value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
          <ErrorAlert error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy} disabled={reason.trim() === ''}>
              Send request
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Go back
            </Button>
          </div>
        </form>
      )}
      {deciding && (
        <ReasonDialog
          title={deciding.action === 'approve' ? 'Approve more time' : 'Reject the extension'}
          intro={`Asked to keep it until ${when(deciding.ext.requestedEndAt)}: “${deciding.ext.reason}”`}
          submitLabel={deciding.action === 'approve' ? 'Approve' : 'Reject'}
          danger={deciding.action === 'reject'}
          onClose={() => setDeciding(null)}
          onSubmit={async (r) => {
            await api.decideExtension(deciding.ext.id, deciding.action, r);
            refresh();
          }}
        />
      )}
    </Section>
  );
}
