import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { BookingSummary } from '../api/types';
import { ReasonDialog } from '../components/ReasonDialog';
import { Button, Empty, ErrorAlert, Loading, PageHeader, StatusChip } from '../components/ui';
import { hours, windowText } from '../lib/format';
import { ACTION_BUTTONS } from '../lib/labels';

type Decision = 'approve' | 'reject' | 'waitlist';
const DECISIONS: Decision[] = ['approve', 'waitlist', 'reject'];

export function StaffQueuePage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['bookings', 'queue'],
    queryFn: () => api.bookings({ status: 'requested,waitlisted' }),
    refetchInterval: 30_000,
  });
  const [deciding, setDeciding] = useState<{ b: BookingSummary; action: Decision } | null>(null);
  const items = [...(q.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div>
      <PageHeader
        title="Requests to decide"
        intro="Approve, waitlist or reject, always with a reason the borrower will read. Only the actions the server allows are shown."
      />
      {q.isLoading && <Loading what="Loading requests" />}
      <ErrorAlert error={q.error} />
      {q.data && items.length === 0 && <Empty>No requests are waiting. Good work.</Empty>}
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/bookings/${b.id}`} className="text-lg font-bold">
                  {b.resourceName}
                </Link>
                <p className="text-sm text-slate-800">
                  {b.requesterName} · {windowText(b.startAt, b.endAt)} ({hours(b.hours)})
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Purpose:</span> {b.purpose}
                </p>
                {b.queue && (
                  <p className="mt-1 text-sm text-amber-900">
                    Waitlisted, number {b.queue.position} of {b.queue.size}. {b.decisionReason}
                  </p>
                )}
              </div>
              <StatusChip status={b.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {DECISIONS.filter((a) => b.allowedActions.includes(a)).map((a) => (
                <Button key={a} variant={a === 'reject' ? 'danger' : a === 'waitlist' ? 'secondary' : 'primary'} onClick={() => setDeciding({ b, action: a })}>
                  {ACTION_BUTTONS[a]}
                </Button>
              ))}
            </div>
            {Object.entries(b.blockedActions)
              .filter(([k]) => (DECISIONS as string[]).includes(k))
              .map(([k, why]) => (
                <p key={k} className="mt-2 rounded-md border border-slate-300 bg-slate-50 p-2 text-sm">
                  <span className="font-semibold">{ACTION_BUTTONS[k]} is not possible:</span> {why}
                </p>
              ))}
          </li>
        ))}
      </ul>
      {deciding && (
        <ReasonDialog
          title={`${ACTION_BUTTONS[deciding.action]}: ${deciding.b.resourceName}`}
          intro={`${deciding.b.requesterName}, ${windowText(deciding.b.startAt, deciding.b.endAt)}. They will read your reason.`}
          submitLabel={ACTION_BUTTONS[deciding.action]}
          danger={deciding.action === 'reject'}
          onClose={() => setDeciding(null)}
          onSubmit={async (reason) => {
            await api.decide(deciding.b.id, deciding.action, reason);
            qc.invalidateQueries({ queryKey: ['bookings'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['booking', deciding.b.id] });
          }}
        />
      )}
    </div>
  );
}
