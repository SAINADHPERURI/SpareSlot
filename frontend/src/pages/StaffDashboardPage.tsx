import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { ResourceCardView } from '../components/ResourceCardView';
import { Alert, Empty, ErrorAlert, LinkButton, Loading, PageHeader, Section, StateChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { rupees, when } from '../lib/format';
import { label } from '../lib/labels';

export function StaffDashboardPage() {
  const { isOwner } = useAuth();
  const dash = useQuery({ queryKey: ['dashboard', 'staff'], queryFn: api.staffDashboard, refetchInterval: 30_000 });
  const incidents = useQuery({ queryKey: ['incidents', 'open'], queryFn: () => api.incidents('open') });
  const extensions = useQuery({ queryKey: ['extensions'], queryFn: () => api.extensions() });
  const resources = useQuery({ queryKey: ['org-resources'], queryFn: api.orgResources, enabled: isOwner });

  if (dash.isLoading) return <Loading what="Loading the staff dashboard" />;
  if (dash.error) return <ErrorAlert error={dash.error} />;
  const d = dash.data!;
  const c = d.counts;

  const tiles: [string, number, string][] = [
    ['Requests to decide', c.requestsToDecide, '#requests'],
    ['Verifications to review', c.verificationsToReview, '/staff/verifications'],
    ['Check-ins due (24 h)', c.checkInsDue, '#checkins'],
    ['Overdue returns', c.overdue, '#overdue'],
    ['Deposits to resolve', c.depositsToResolve, '#deposits'],
    ['Open incidents', c.openIncidents, '#incidents'],
    ['Extension requests', c.extensionRequests, '#extensions'],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Staff dashboard — ${d.orgName}`}
        intro="Everything waiting for a person to decide. The system only waitlists, promotes and raises overdue incidents."
        actions={isOwner ? <LinkButton to="/staff/resources/new">New resource</LinkButton> : undefined}
      />
      {d.orgVerified === false && (
        <Alert tone="warning" title="Your organisation is not verified yet">
          A platform admin must verify it before borrowers can see your listings. You can prepare listings now.
        </Alert>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([text, n, href]) => (
          <li key={text}>
            {href.startsWith('#') ? (
              <a href={href} className="card block h-full no-underline hover:no-underline">
                <span className="block text-2xl font-bold text-ink">{n}</span>
                <span className="block text-sm text-slate-800">{text}</span>
              </a>
            ) : (
              <Link to={href} className="card block h-full no-underline hover:no-underline">
                <span className="block text-2xl font-bold text-ink">{n}</span>
                <span className="block text-sm text-slate-800">{text}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <Section title="Requests to decide" id="requests" actions={<Link to="/staff/queue">Open the queue</Link>}>
        <BookingList bookings={d.requestsToDecide} showRequester empty="No requests waiting." />
      </Section>
      <Section title="Overdue returns" id="overdue">
        <BookingList bookings={d.overdue} showRequester empty="Nothing is overdue." />
      </Section>
      <Section title="Check-ins due in the next 24 hours" id="checkins">
        <BookingList bookings={d.checkInsDue} showRequester empty="No pickups due." />
      </Section>
      <Section title="Checked out now">
        <BookingList bookings={d.active} showRequester empty="Nothing is checked out." />
      </Section>

      <Section title="Deposits to resolve" id="deposits">
        {d.depositsToResolve.length === 0 ? (
          <Empty>No deposits are waiting for a decision.</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {d.depositsToResolve.map((t) => (
              <li key={t.bookingId} className="p-3">
                <Link to={`/bookings/${t.bookingId}#deposit`} className="font-semibold">
                  {t.resourceName} — {t.requesterName}
                </Link>
                <p className="text-sm text-slate-800">
                  {rupees(t.depositMinor)} held · booking {label(t.bookingStatus).toLowerCase()} · condition{' '}
                  {t.checkInRating ? label(t.checkInRating) : '—'} → {t.returnRating ? label(t.returnRating) : '—'}
                  {t.openIncidents > 0 && <> · {t.openIncidents} open incident{t.openIncidents > 1 ? 's' : ''}</>}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Suggested: {label(t.recommendedAction)}</span> — advice only, a person decides.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Open incidents" id="incidents">
        {incidents.isLoading && <Loading what="Loading incidents" />}
        <ErrorAlert error={incidents.error} />
        {incidents.data && incidents.data.length === 0 && <Empty>No open incidents.</Empty>}
        {incidents.data && incidents.data.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {incidents.data.map((i) => (
              <li key={i.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/bookings/${i.bookingId}#incidents`} className="font-semibold">
                    {label(i.kind)}: {i.resourceName}
                  </Link>
                  <StateChip status={i.status} />
                </div>
                <p className="text-sm">{i.description}</p>
                <p className="text-xs text-slate-600">
                  {i.requesterName} · raised by {i.raisedByName}, {when(i.raisedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Extension requests" id="extensions">
        {extensions.isLoading && <Loading what="Loading extension requests" />}
        <ErrorAlert error={extensions.error} />
        {extensions.data && extensions.data.length === 0 && <Empty>No one is asking for more time.</Empty>}
        {extensions.data && extensions.data.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {extensions.data.map((x) => (
              <li key={x.id} className="p-3">
                <Link to={`/bookings/${x.bookingId}#extensions`} className="font-semibold">
                  {x.resourceName} — {x.requesterName}
                </Link>
                <p className="text-sm">
                  From {when(x.currentEndAt)} to {when(x.requestedEndAt)}: {x.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {isOwner && (
        <Section title="Your resources" actions={<LinkButton to="/staff/resources/new" variant="secondary">New resource</LinkButton>}>
          {resources.isLoading && <Loading what="Loading resources" />}
          {resources.data && resources.data.length === 0 && <Empty>No listings yet. Add your first resource.</Empty>}
          {resources.data && resources.data.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {resources.data.map((r) => (
                <li key={r.id} className="space-y-2">
                  <ResourceCardView r={r} />
                  <LinkButton to={`/staff/resources/${r.id}/edit`} variant="secondary">
                    Edit {r.name}
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
