import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { Alert, Empty, ErrorAlert, LinkButton, Loading, PageHeader, Section, StateChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { hours, rupees, when, windowText } from '../lib/format';

export function BorrowerDashboardPage() {
  const { session } = useAuth();
  const dash = useQuery({ queryKey: ['dashboard', 'borrower'], queryFn: api.borrowerDashboard });
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (dash.isLoading) return <Loading what="Loading your dashboard" />;
  if (dash.error) return <ErrorAlert error={dash.error} />;
  const d = dash.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${session?.fullName.split(' ')[0] ?? ''}`}
        intro="Your verification, bookings, requests and deposits in one place."
        actions={<LinkButton to="/">Find something to borrow</LinkButton>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open requests" value={`${d.openRequestCount} of ${d.openRequestLimit}`} hint="The most you can have at once." />
        <Stat label="Hours in the last 30 days" value={hours(d.hoursLast30Days)} hint="Fewer hours puts you earlier in waitlists." />
        <Stat label="Deposits to pay" value={String(d.depositsToPay.length)} />
        <Stat label="Unread notifications" value={String(d.unreadNotifications)} />
      </div>

      {d.depositsToPay.length > 0 && (
        <Alert tone="warning" title="Deposits waiting to be paid">
          <ul className="space-y-1">
            {d.depositsToPay.map((b) => (
              <li key={b.id}>
                <Link to={`/bookings/${b.id}#deposit`} className="font-semibold">
                  {b.resourceName}: pay {rupees(b.depositMinor)} before pickup ({when(b.startAt)})
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Verification" actions={<LinkButton to="/profile/verify" variant="secondary">Request verification</LinkButton>}>
          {d.credentials.length === 0 ? (
            <Empty>You have no credentials yet. Many resources need one.</Empty>
          ) : (
            <ul className="space-y-2">
              {d.credentials.map((c) => (
                <li key={c.kind} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.label}</span>
                  <StateChip status={c.status} />
                  {c.expiresAt && <span className="text-sm text-slate-700">expires {when(c.expiresAt)}</span>}
                  {c.status === 'rejected' && c.reviewReason && <span className="w-full text-sm text-slate-700">Reason: {c.reviewReason}</span>}
                </li>
              ))}
            </ul>
          )}
          {d.missingCredentials.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold">What you are missing</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {d.missingCredentials.map((m) => (
                  <li key={m.kind}>
                    <Link to={`/profile/verify?kind=${m.kind}`}>{m.label}</Link> — needed by {m.resourcesNeedingIt}{' '}
                    {m.resourcesNeedingIt === 1 ? 'resource' : 'resources'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Weekly limits used">
          {me.data && me.data.weeklyUsage.length > 0 ? (
            <ul className="space-y-3">
              {me.data.weeklyUsage.map((w) => {
                const pct = Math.min(100, Math.round((w.hours / w.weeklyHourCap) * 100));
                return (
                  <li key={w.resourceId}>
                    <p className="text-sm">
                      <Link to={`/resources/${w.resourceId}`}>{w.resourceName}</Link>: {hours(w.hours)} of {w.weeklyHourCap} this week
                    </p>
                    <div className="mt-1 h-2 rounded bg-slate-200" role="presentation">
                      <div className="h-2 rounded bg-brand" style={{ width: pct + '%' }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-slate-700">Nothing booked this week{me.data?.team ? ` for your team ${me.data.team.name}` : ''}.</p>
          )}
          {me.data?.team && <p className="mt-3 text-sm text-slate-700">Your team “{me.data.team.name}” shares one weekly limit.</p>}
        </Section>
      </div>

      <Section title="Active now">
        <BookingList bookings={d.active} empty="Nothing is checked out to you right now." />
      </Section>
      <Section title="Upcoming">
        <BookingList bookings={d.upcoming} empty="No approved bookings coming up." />
      </Section>
      <Section title="Requests and waitlist">
        {d.openRequests.some((b) => b.queue) && (
          <p className="mb-3 text-sm text-slate-700">
            Waitlists are ordered by hours used in the last 30 days (fewest first), then by when you asked.
          </p>
        )}
        <BookingList bookings={d.openRequests} empty="No open requests." />
      </Section>
      <Section title="Recent" actions={<Link to="/bookings">All my bookings</Link>}>
        {d.recent.length === 0 ? (
          <Empty>No finished bookings yet.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.recent.map((b) => (
              <li key={b.id}>
                <Link to={`/bookings/${b.id}`}>{b.resourceName}</Link> · {windowText(b.startAt, b.endAt)} · <StateChip status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}
