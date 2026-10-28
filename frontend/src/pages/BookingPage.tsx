import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { BookingDetail } from '../api/types';
import { DepositPanel } from '../components/booking/DepositPanel';
import { ExtensionsPanel } from '../components/booking/ExtensionsPanel';
import { IncidentsPanel } from '../components/booking/IncidentsPanel';
import { PhotosPanel, usePhotos } from '../components/booking/PhotosPanel';
import { StatusActions } from '../components/booking/StatusActions';
import { Timeline } from '../components/booking/Timeline';
import {
  Alert,
  DepositChip,
  Dl,
  Empty,
  ErrorAlert,
  Loading,
  OverdueChip,
  Section,
  StatusChip,
  Tabs,
  WaitlistInfo,
} from '../components/ui';
import { hours, rupees, when, windowText } from '../lib/format';
import { ACTION_BUTTONS, label } from '../lib/labels';

/** Next-step hints in plain words, keyed by status and the viewer's role on this booking. */
function nextStep(status: string, role: string | null): string | null {
  const staff = role === 'owner' || role === 'manager';
  const borrower = role === 'requester';
  switch (status) {
    case 'requested':
      return staff ? 'Decide this request: approve, waitlist or reject it, with a reason.' : borrower ? 'Waiting for staff to decide. You will get a notification.' : null;
    case 'waitlisted':
      return borrower ? 'If the slot frees up, the first request in the queue that fits is approved automatically.' : staff ? 'Approve it if the slot is free, or reject it with a reason.' : null;
    case 'approved':
      return staff ? 'At pickup, check the item in with its condition and photos.' : borrower ? 'Pay any deposit, then collect the item. Add your own photos at pickup (Photos tab).' : null;
    case 'checked_in':
      return staff ? 'When it comes back, record the return with its condition and photos.' : borrower ? 'Return it by the end time. You can ask for more time in the Incidents & extensions tab.' : null;
    case 'returned':
      return staff ? 'Settle any deposit (Deposit tab), then close the booking.' : borrower ? 'Staff will settle your deposit. If you disagree with a decision, raise a dispute.' : null;
    default:
      return null;
  }
}

const STATUS_ACTION_KEYS = ['approve', 'waitlist', 'reject', 'check_in', 'return', 'close', 'cancel'];

/** The compact header: what, when, who, where it stands, and the money. */
function Summary({ d }: { d: BookingDetail }) {
  const b = d.booking;
  const hasDeposit = b.depositMinor > 0 || b.depositStatus !== 'none';
  return (
    <section aria-labelledby="booking-title" className="card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">
            {label(b.resourceCategory)} · <Link to={`/organisations/${b.orgId}`}>{b.orgName}</Link>
          </p>
          <h1 id="booking-title" className="mt-1 text-2xl font-bold sm:text-3xl">
            <Link to={`/resources/${b.resourceId}`} className="text-ink">
              {b.resourceName}
            </Link>
          </h1>
          <p className="mt-1 text-slate-700">
            {windowText(b.startAt, b.endAt)} <span className="text-slate-600">({hours(b.hours)})</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusChip status={b.status} />
          {b.overdue && <OverdueChip />}
          {hasDeposit && <DepositChip status={b.depositStatus} />}
        </div>
      </div>
      <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Borrower</dt>
          <dd className="mt-1 font-semibold">{b.requesterName}</dd>
          <dd className="text-slate-700">
            {[d.requesterBorrowerType && label(d.requesterBorrowerType), d.teamName && `Team ${d.teamName}`].filter(Boolean).join(' · ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Where</dt>
          <dd className="mt-1">{d.resourceLocation || '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Deposit</dt>
          <dd className="mt-1">{hasDeposit ? `${rupees(b.depositMinor)} · ${label(b.depositStatus)}` : 'No deposit'}</dd>
        </div>
      </dl>
    </section>
  );
}

/** The "Next step" box: buttons only from allowedActions, and the plain-words reason for anything blocked. */
function NextStep({ d }: { d: BookingDetail }) {
  const b = d.booking;
  const step = nextStep(b.status, d.myRole);
  const blocked = Object.entries(b.blockedActions).filter(([k]) => STATUS_ACTION_KEYS.includes(k) || k === 'pay_deposit');
  const hasStatusActions = b.allowedActions.some((a) => STATUS_ACTION_KEYS.includes(a));
  const otherActions = b.allowedActions.filter((a) => !STATUS_ACTION_KEYS.includes(a));
  return (
    <section aria-labelledby="next-step-title" className="rounded-lg border-2 border-accent bg-white p-4 shadow-card sm:p-6">
      <h2 id="next-step-title" className="text-lg font-bold">
        Next step
      </h2>
      {step && <p className="mt-1 text-slate-700">{step}</p>}
      {hasStatusActions && (
        <div className="mt-4">
          <StatusActions detail={d} />
        </div>
      )}
      {otherActions.includes('pay_deposit') && (
        <p className="mt-3 text-sm">
          <Link to="?tab=deposit" className="font-semibold">
            Pay the {rupees(b.depositMinor)} deposit in the Deposit tab →
          </Link>
        </p>
      )}
      {blocked.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {blocked.map(([k, why]) => (
            <li key={k} className="flex gap-2 rounded-md border border-slate-300 bg-mist-soft p-3">
              <span aria-hidden="true" className="font-bold text-slate-700">
                ⓘ
              </span>
              <span>
                <span className="font-semibold">{ACTION_BUTTONS[k] ?? label(k)} is not possible yet:</span> {why}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!hasStatusActions && blocked.length === 0 && !otherActions.includes('pay_deposit') && (
        <p className="mt-2 text-slate-700">
          {d.myRole === 'admin' ? 'Admins can read bookings but not change them.' : 'There is nothing to decide on this booking now.'}
        </p>
      )}
    </section>
  );
}

function Overview({ d }: { d: BookingDetail }) {
  const b = d.booking;
  return (
    <div className="space-y-6">
      <Section title="Details">
        <Dl
          items={[
            ['Purpose', b.purpose],
            ['Requested', when(b.createdAt)],
            ...(b.decisionReason && b.status !== 'waitlisted'
              ? ([['Latest decision', `“${b.decisionReason}” — ${d.decidedByName ?? 'staff'}${b.decidedAt ? ', ' + when(b.decidedAt) : ''}`]] as [string, string][])
              : []),
            ...(d.requesterAffiliation ? ([['Affiliation', d.requesterAffiliation]] as [string, string][]) : []),
            ...(d.checkedInAt ? ([['Picked up', when(d.checkedInAt)]] as [string, string][]) : []),
            ...(d.returnedAt ? ([['Returned', when(d.returnedAt)]] as [string, string][]) : []),
            ...(d.closedAt ? ([['Closed', when(d.closedAt)]] as [string, string][]) : []),
          ]}
        />
      </Section>
      <Section title="Condition records" intro="Recorded by staff at pickup and at return.">
        {d.conditions.length === 0 ? (
          <Empty>No condition recorded yet. Staff record it at pickup.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.conditions.map((c) => (
              <div key={c.phase} className="rounded-md border border-slate-200 bg-mist-soft p-4">
                <p className="eyebrow">At {c.phase === 'check_in' ? 'check-in' : 'return'}</p>
                <p className="mt-1 text-lg font-bold">{label(c.rating)}</p>
                {c.notes && <p className="text-sm">{c.notes}</p>}
                <p className="mt-2 text-xs text-slate-600">
                  {c.recordedByName}, {when(c.recordedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
      {d.resourceConditions && (
        <Section title="Conditions of use">
          <p className="whitespace-pre-line text-slate-800">{d.resourceConditions}</p>
        </Section>
      )}
    </div>
  );
}

export function BookingPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.booking(id) });
  const photos = usePhotos(id);

  if (q.isLoading) return <Loading what="Loading the booking" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const b = d.booking;
  const hasDeposit = b.depositMinor > 0 || b.depositStatus !== 'none';
  const openIncidents = d.incidents.filter((i) => i.status !== 'resolved').length;
  const pendingExtensions = d.extensions.filter((x) => x.status === 'requested').length;
  const photoCount = photos.data?.length;

  const incidentsLabel = [
    openIncidents > 0 ? `${openIncidents} open` : d.incidents.length > 0 ? `${d.incidents.length}` : null,
    pendingExtensions > 0 ? `${pendingExtensions} waiting` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      <Summary d={d} />

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
        <Alert tone="warning" title="On the waitlist">
          <WaitlistInfo
            staff={d.myRole === 'owner' || d.myRole === 'manager'}
            reason={b.decisionReason}
            position={b.queue.position}
            size={b.queue.size}
            explanation={b.queue.explanation}
          />
          <p className="mt-2 text-sm">Hours used in the last 30 days: {hours(b.queue.yourHoursLast30Days)}.</p>
        </Alert>
      )}

      <NextStep d={d} />

      <Tabs
        label="Booking sections"
        tabs={[
          { id: 'overview', label: 'Overview', content: <Overview d={d} /> },
          { id: 'photos', label: photoCount ? `Photos (${photoCount})` : 'Photos', content: <PhotosPanel detail={d} /> },
          {
            id: 'deposit',
            label: hasDeposit ? `Deposit · ${label(b.depositStatus)}` : 'Deposit',
            content: hasDeposit ? (
              <DepositPanel detail={d} />
            ) : (
              <Section title="Deposit">
                <Empty>No deposit on this booking. The listing does not ask for one.</Empty>
              </Section>
            ),
          },
          {
            id: 'incidents',
            label: incidentsLabel ? `Incidents & extensions (${incidentsLabel})` : 'Incidents & extensions',
            content: (
              <div className="space-y-6">
                <IncidentsPanel detail={d} />
                <ExtensionsPanel detail={d} />
              </div>
            ),
          },
          { id: 'history', label: 'History', content: <Timeline bookingId={b.id} /> },
        ]}
      />
    </div>
  );
}
