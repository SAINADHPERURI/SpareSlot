import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { Empty, ErrorAlert, GroupHeading, LinkButton, Loading, PageHeader, Section, StateChip, StatusChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { hours, rupees, when, windowText } from '../lib/format';

export function BorrowerDashboardPage() {
  const { session } = useAuth();
  const dash = useQuery({ queryKey: ['dashboard', 'borrower'], queryFn: api.borrowerDashboard });
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (dash.isLoading) return <Loading what="Loading your dashboard" />;
  if (dash.error) return <ErrorAlert error={dash.error} />;
  const d = dash.data!;
  const attention = d.depositsToPay.length + d.missingCredentials.length;

  return (
    <div className="space-y-10">
      <PageHeader
        title={`Hello, ${session?.fullName.split(' ')[0] ?? ''}`}
        intro="Your verification, bookings, requests and deposits in one place."
        actions={<LinkButton to="/">Find something to borrow</LinkButton>}
      />

      {/* 1. what needs your attention */}
      <div className="space-y-4">
        <GroupHeading
          title="What needs your attention"
          intro={attention === 0 ? 'Nothing right now. You are all set.' : 'Do these first: they unlock pickups and requests.'}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Deposits to pay" intro="Pay after approval and before pickup. Demo payment: no real money moves.">
            {d.depositsToPay.length === 0 ? (
              <Empty>No deposits are waiting.</Empty>
            ) : (
              <ul className="space-y-2">
                {d.depositsToPay.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400 bg-amber-50 p-3">
                    <span>
                      <span className="font-semibold">{b.resourceName}</span>
                      <span className="block text-sm text-slate-700">Pickup {when(b.startAt)}</span>
                    </span>
                    <LinkButton to={`/bookings/${b.id}?tab=deposit`}>Pay {rupees(b.depositMinor)}</LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

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
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="font-semibold">What you are missing</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.missingCredentials.map((m) => (
                    <li key={m.kind}>
                      <Link to={`/profile/verify?kind=${m.kind}`} className="font-semibold">
                        {m.label}
                      </Link>{' '}
                      — needed by {m.resourcesNeedingIt} {m.resourcesNeedingIt === 1 ? 'resource' : 'resources'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* 2. upcoming and active */}
      <div className="space-y-4">
        <GroupHeading title="Upcoming & active" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Checked out to you now">
            <BookingList bookings={d.active} empty="Nothing is checked out to you right now." />
          </Section>
          <Section title="Coming up">
            <BookingList bookings={d.upcoming} empty="No approved bookings coming up." />
          </Section>
        </div>
      </div>

      {/* 3. requests and waitlist */}
      <div className="space-y-4">
        <GroupHeading
          title="Requests & waitlist"
          intro={`${d.openRequestCount} of ${d.openRequestLimit} open requests used. Waitlists are ordered by hours used in the last 30 days (fewest first), then by when you asked.`}
        />
        <Section title="Open requests">
          <BookingList bookings={d.openRequests} empty="No open requests." />
        </Section>
      </div>

      {/* 4. usage */}
      <div className="space-y-4">
        <GroupHeading title="Usage" />
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Stat label="Hours in the last 30 days" value={hours(d.hoursLast30Days)} hint="Fewer hours puts you earlier in waitlists." />
            <Stat label="Unread notifications" value={String(d.unreadNotifications)} hint="Use the bell at the top." />
          </div>
          <Section title="Weekly limits used">
            {me.data && me.data.weeklyUsage.length > 0 ? (
              <ul className="space-y-4">
                {me.data.weeklyUsage.map((w) => {
                  const pct = Math.min(100, Math.round((w.hours / w.weeklyHourCap) * 100));
                  return (
                    <li key={w.resourceId}>
                      <p className="flex justify-between gap-2 text-sm">
                        <Link to={`/resources/${w.resourceId}`}>{w.resourceName}</Link>
                        <span>
                          {hours(w.hours)} of {w.weeklyHourCap} h
                        </span>
                      </p>
                      <div className="mt-1 h-2.5 rounded-full bg-mist" role="presentation">
                        <div className="h-2.5 rounded-full bg-brand" style={{ width: pct + '%' }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Nothing booked this week{me.data?.team ? ` for your team ${me.data.team.name}` : ''}.</Empty>
            )}
            {me.data?.team && <p className="mt-3 text-sm text-slate-700">Your team “{me.data.team.name}” shares one weekly limit.</p>}
          </Section>
        </div>
        <Section title="Recent" actions={<Link to="/bookings">All my bookings</Link>}>
          {d.recent.length === 0 ? (
            <Empty>No finished bookings yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
              {d.recent.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    <Link to={`/bookings/${b.id}`} className="font-semibold">
                      {b.resourceName}
                    </Link>{' '}
                    <span className="text-slate-700">· {windowText(b.startAt, b.endAt)}</span>
                  </span>
                  <StatusChip status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}
