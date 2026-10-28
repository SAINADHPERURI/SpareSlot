import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { DepositPanel } from '../components/booking/DepositPanel';
import { ExtensionsPanel } from '../components/booking/ExtensionsPanel';
import { IncidentsPanel } from '../components/booking/IncidentsPanel';
import { PhotosPanel } from '../components/booking/PhotosPanel';
import { StatusActions } from '../components/booking/StatusActions';
import { Timeline } from '../components/booking/Timeline';
import { Alert, Dl, ErrorAlert, Loading, OverdueChip, PageHeader, Section, StatusChip } from '../components/ui';
import { hours, when, windowText } from '../lib/format';
import { ACTION_BUTTONS, label } from '../lib/labels';

/** Next-step hints in plain words, keyed by status and the viewer's role on this booking. */
function nextStep(status: string, role: string | null): string | null {
  const staff = role === 'owner' || role === 'manager';
  const borrower = role === 'requester';
  switch (status) {
    case 'requested':
      return staff ? 'Decide this request: approve, waitlist or reject it, with a reason.' : borrower ? 'Waiting for staff to decide. You will get a notification.' : null;
    case 'waitlisted':
      return borrower ? 'If the slot frees up, the first request in the queue that fits is approved automatically.' : null;
    case 'approved':
      return staff ? 'At pickup, check the item in with its condition and photos.' : borrower ? 'Pay any deposit, then collect the item. Add your own photos at pickup.' : null;
    case 'checked_in':
      return staff ? 'When it comes back, record the return with its condition and photos.' : borrower ? 'Return it by the end time. You can ask for more time below.' : null;
    case 'returned':
      return staff ? 'Settle any deposit, then close the booking.' : borrower ? 'Staff will settle your deposit. If you disagree with a decision, raise a dispute.' : null;
    default:
      return null;
  }
}

export function BookingPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.booking(id) });

  if (q.isLoading) return <Loading what="Loading the booking" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const b = d.booking;
  const step = nextStep(b.status, d.myRole);
  const statusBlocked = Object.entries(b.blockedActions).filter(([k]) => ['approve', 'check_in', 'close', 'return'].includes(k));

  return (
    <div className="space-y-6">
      <PageHeader
        title={b.resourceName}
        intro={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={b.status} />
            {b.overdue && <OverdueChip />}
            <span>{windowText(b.startAt, b.endAt)}</span>
          </span>
        }
      />
      {(location.state as { created?: boolean } | null)?.created && (
        <Alert tone="success" title="Request sent">
          Staff of {b.orgName} will decide it. You will get a notification with their reason.
        </Alert>
      )}
      {b.overdue && (
        <Alert tone="error" title="Overdue">
          This was due back at {when(b.endAt)}. A delay incident is raised automatically and both sides are notified.
        </Alert>
      )}
      {b.queue && (
        <Alert tone="warning" title={`Waitlisted: number ${b.queue.position} of ${b.queue.size} in the queue`}>
          <p>{b.decisionReason}</p>
          <p className="mt-2">{b.queue.explanation}</p>
          <p className="mt-2">Your hours in the last 30 days: {hours(b.queue.yourHoursLast30Days)}.</p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Section title="Booking">
            <Dl
              items={[
                ['Resource', <Link to={`/resources/${b.resourceId}`}>{b.resourceName}</Link>],
                ['Organisation', <Link to={`/organisations/${b.orgId}`}>{b.orgName}</Link>],
                ['When', `${windowText(b.startAt, b.endAt)} (${hours(b.hours)})`],
                ['Where', d.resourceLocation || '—'],
                ['Borrower', `${b.requesterName}${d.requesterBorrowerType ? ' · ' + label(d.requesterBorrowerType) : ''}${d.requesterAffiliation ? ' · ' + d.requesterAffiliation : ''}`],
                ...(d.teamName ? ([['Team', d.teamName]] as [string, string][]) : []),
                ['Purpose', b.purpose],
                ['Status', <StatusChip status={b.status} />],
                ...(b.decisionReason
                  ? ([['Latest decision', `“${b.decisionReason}” — ${d.decidedByName ?? 'staff'}${b.decidedAt ? ', ' + when(b.decidedAt) : ''}`]] as [string, string][])
                  : []),
                ...(d.checkedInAt ? ([['Picked up', when(d.checkedInAt)]] as [string, string][]) : []),
                ...(d.returnedAt ? ([['Returned', when(d.returnedAt)]] as [string, string][]) : []),
                ...(d.closedAt ? ([['Closed', when(d.closedAt)]] as [string, string][]) : []),
              ]}
            />
            {d.conditions.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {d.conditions.map((c) => (
                  <div key={c.phase} className="rounded-md border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-700">Condition at {c.phase === 'check_in' ? 'check-in' : 'return'}</p>
                    <p className="font-bold">{label(c.rating)}</p>
                    {c.notes && <p className="text-sm">{c.notes}</p>}
                    <p className="text-xs text-slate-600">
                      {c.recordedByName}, {when(c.recordedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="What happens next">
            {step && <p className="mb-3">{step}</p>}
            <StatusActions detail={d} />
            {statusBlocked.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {statusBlocked.map(([k, why]) => (
                  <li key={k} className="rounded-md border border-slate-300 bg-slate-50 p-2">
                    <span className="font-semibold">{ACTION_BUTTONS[k] ?? label(k)} is not possible yet:</span> {why}
                  </li>
                ))}
              </ul>
            )}
            {b.allowedActions.length === 0 && statusBlocked.length === 0 && (
              <p className="text-slate-700">{d.myRole === 'admin' ? 'Admins can read bookings but not change them.' : 'There is nothing to do on this booking now.'}</p>
            )}
            {d.resourceConditions && (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold">Conditions of use</summary>
                <p className="mt-2 whitespace-pre-line text-sm">{d.resourceConditions}</p>
              </details>
            )}
          </Section>

          <PhotosPanel detail={d} />
          <IncidentsPanel detail={d} />
          <ExtensionsPanel detail={d} />
        </div>
        <div className="space-y-6">
          <DepositPanel detail={d} />
          <Timeline bookingId={b.id} />
        </div>
      </div>
    </div>
  );
}
