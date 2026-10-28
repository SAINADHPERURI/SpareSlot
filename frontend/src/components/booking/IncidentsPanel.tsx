import { useState } from 'react';
import { api } from '../../api';
import type { BookingDetail, BookingIncident, IncidentKind } from '../../api/types';
import { when } from '../../lib/format';
import { INCIDENT_KINDS, label } from '../../lib/labels';
import { ReasonDialog } from '../ReasonDialog';
import { Button, ErrorAlert, Section, SelectField, StateChip, TextArea } from '../ui';
import { useBookingRefresh } from './useBookingRefresh';

const KIND_HINTS: Record<string, string> = {
  damage: 'Something broke or was damaged during the booking.',
  pre_existing_damage: 'Damage that was already there at pickup, so it is not blamed on the borrower.',
  delay: 'The return is late, or the handover was delayed.',
  conflict: 'Someone else was using it, or the space was not available.',
  dispute: 'You disagree with a decision, for example about the deposit. The decision waits for it.',
};

export function IncidentsPanel({ detail }: { detail: BookingDetail }) {
  const b = detail.booking;
  const refresh = useBookingRefresh(b.id);
  const staff = detail.myRole === 'owner' || detail.myRole === 'manager';
  const canRaise = b.allowedActions.includes('raise_incident');
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<IncidentKind>(staff ? 'damage' : 'pre_existing_damage');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resolving, setResolving] = useState<BookingIncident | null>(null);
  const [reviewing, setReviewing] = useState<BookingIncident | null>(null);

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.raiseIncident({ bookingId: b.id, kind, description: description.trim() });
      setDescription('');
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Incidents"
      id="incidents"
      actions={canRaise && !showForm ? <Button variant="secondary" onClick={() => setShowForm(true)}>Raise an incident</Button> : undefined}
    >
      {detail.incidents.length === 0 && !showForm && <p className="text-slate-700">No incidents on this booking.</p>}
      <ul className="space-y-3">
        {detail.incidents.map((i) => (
          <li key={i.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{label(i.kind)}</span>
              <StateChip status={i.status} />
            </div>
            <p className="mt-1">{i.description}</p>
            <p className="text-sm text-slate-700">
              Raised by {i.raisedByName}, {when(i.raisedAt)}
            </p>
            {i.resolution && (
              <p className="mt-1 text-sm">
                <span className="font-semibold">Resolution:</span> {i.resolution} ({i.resolvedByName}, {when(i.resolvedAt)})
              </p>
            )}
            {staff && i.status !== 'resolved' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {i.status === 'open' && (
                  <Button variant="secondary" onClick={() => setReviewing(i)}>
                    Start review
                  </Button>
                )}
                <Button onClick={() => setResolving(i)}>Resolve</Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {showForm && (
        <form onSubmit={raise} className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)} hint={KIND_HINTS[kind]}>
            {INCIDENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </SelectField>
          <TextArea label="What happened?" required value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          <ErrorAlert error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy} disabled={description.trim() === ''}>
              Raise incident
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Go back
            </Button>
          </div>
          <p className="text-sm text-slate-700">You can add photos for an incident in the Condition photos section (step “Incident”).</p>
        </form>
      )}

      {reviewing && (
        <ReasonDialog
          title="Start reviewing this incident"
          submitLabel="Mark under review"
          reasonLabel="Note"
          reasonRequired={false}
          onClose={() => setReviewing(null)}
          onSubmit={async (note) => {
            await api.reviewIncident(reviewing.id, note);
            refresh();
          }}
        />
      )}
      {resolving && (
        <ReasonDialog
          title={`Resolve the ${label(resolving.kind).toLowerCase()} incident`}
          intro="Write what was found and decided. The borrower reads it. A resolved damage incident allows a deposit forfeit; a person still decides that."
          submitLabel="Resolve incident"
          reasonLabel="Resolution"
          onClose={() => setResolving(null)}
          onSubmit={async (resolution) => {
            await api.resolveIncident(resolving.id, resolution);
            refresh();
          }}
        />
      )}
    </Section>
  );
}
