import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import type { AuditEvent } from '../../api/types';
import { when } from '../../lib/format';
import { actionLabel, label } from '../../lib/labels';
import { ErrorAlert, Loading, Section } from '../ui';

export function EventItem({ e }: { e: AuditEvent }) {
  return (
    <li className="relative">
      <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full border-2 border-teal-700 bg-white" />
      <p className="font-semibold">
        {actionLabel(e.action)}
        {e.fromStatus && e.toStatus && (
          <span className="font-normal text-slate-700">
            {' '}
            ({label(e.fromStatus)} → {label(e.toStatus)})
          </span>
        )}
        {!e.fromStatus && e.toStatus && <span className="font-normal text-slate-700"> ({label(e.toStatus)})</span>}
      </p>
      <p className="text-sm text-slate-700">
        {e.actorName} <span>({label(e.actorRole)})</span> · <time dateTime={e.at}>{when(e.at)}</time>
      </p>
      {e.reason && <p className="mt-0.5 text-sm text-slate-900">“{e.reason}”</p>}
    </li>
  );
}

/** The booking's audit trail, from GET /api/bookings/{id}/events. Append-only: nothing here can be edited. */
export function Timeline({ bookingId }: { bookingId: string }) {
  const q = useQuery({ queryKey: ['events', bookingId], queryFn: () => api.events(bookingId) });
  return (
    <Section title="History" id="history">
      <p className="mb-3 text-sm text-slate-700">Every step, who took it, when and why. This record cannot be edited.</p>
      {q.isLoading && <Loading what="Loading the history" />}
      <ErrorAlert error={q.error} />
      {q.data && q.data.length === 0 && <p>No events yet.</p>}
      {q.data && q.data.length > 0 && (
        <ol className="ml-2 space-y-4 border-l-2 border-slate-300 pl-5">
          {q.data.map((e) => (
            <EventItem key={e.id} e={e} />
          ))}
        </ol>
      )}
    </Section>
  );
}
