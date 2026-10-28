import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { ResourceCardView } from '../components/ResourceCardView';
import { Alert, Empty, ErrorAlert, LinkButton, Loading, PageHeader, Section, StateChip, Tabs } from '../components/ui';
import { useAuth } from '../lib/auth';
import { rupees, when } from '../lib/format';
import { label } from '../lib/labels';

interface Tile {
  text: string;
  n: number;
  view: string;
  urgent?: boolean;
}

/** A count that switches the dashboard to the tab holding its list. */
function CountTile({ t, active }: { t: Tile; active: boolean }) {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('view', t.view);
  return (
    <Link
      to={`?${next.toString()}`}
      preventScrollReset
      aria-label={`${t.n} ${t.text}: show the list`}
      className={`card block h-full no-underline transition hover:-translate-y-0.5 hover:border-brand hover:no-underline ${
        active ? 'border-brand ring-2 ring-accent' : ''
      }`}
    >
      <span className={`block text-3xl font-bold ${t.urgent && t.n > 0 ? 'text-red-800' : 'text-ink'}`}>{t.n}</span>
      <span className="mt-1 block text-sm text-slate-700">{t.text}</span>
      {t.urgent && t.n > 0 && (
        <span className="mt-1 block text-xs font-semibold text-red-800">
          <span aria-hidden="true">⚠ </span>Needs attention
        </span>
      )}
    </Link>
  );
}

function Decide() {
  const dash = useQuery({ queryKey: ['dashboard', 'staff'], queryFn: api.staffDashboard });
  const verifications = useQuery({ queryKey: ['credentials', 'pending'], queryFn: () => api.credentialQueue('pending') });
  const extensions = useQuery({ queryKey: ['extensions'], queryFn: () => api.extensions() });
  const d = dash.data!;
  return (
    <div className="space-y-6">
      <Section title="Requests to decide" id="requests" actions={<LinkButton to="/staff/queue" variant="secondary">Open the queue</LinkButton>}>
        <BookingList bookings={d.requestsToDecide} showRequester empty="No requests waiting." />
      </Section>
      <Section
        title="Verifications to review"
        id="verifications"
        actions={<LinkButton to="/staff/verifications" variant="secondary">Review verifications</LinkButton>}
      >
        {verifications.isLoading && <Loading what="Loading verification requests" />}
        <ErrorAlert error={verifications.error} />
        {verifications.data && verifications.data.length === 0 && <Empty>No verification requests are waiting.</Empty>}
        {verifications.data && verifications.data.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {verifications.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <span>
                  <span className="font-semibold">{c.userName}</span> asks to verify a <span className="font-semibold">{label(c.kind)}</span>
                  <span className="block text-xs text-slate-600">Filed {when(c.createdAt)}</span>
                </span>
                <StateChip status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Extension requests" id="extensions" intro="Borrowers asking to keep an item longer.">
        {extensions.isLoading && <Loading what="Loading extension requests" />}
        <ErrorAlert error={extensions.error} />
        {extensions.data && extensions.data.length === 0 && <Empty>No one is asking for more time.</Empty>}
        {extensions.data && extensions.data.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {extensions.data.map((x) => (
              <li key={x.id} className="p-4">
                <Link to={`/bookings/${x.bookingId}?tab=incidents`} className="font-semibold">
                  {x.resourceName} — {x.requesterName}
                </Link>
                <p className="text-sm text-slate-700">
                  From {when(x.currentEndAt)} to {when(x.requestedEndAt)}: {x.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Today() {
  const dash = useQuery({ queryKey: ['dashboard', 'staff'], queryFn: api.staffDashboard });
  const d = dash.data!;
  return (
    <div className="space-y-6">
      <Section title="Overdue returns" id="overdue" intro="Checked out and past the end time. A delay incident is raised automatically.">
        <BookingList bookings={d.overdue} showRequester empty="Nothing is overdue." />
      </Section>
      <Section title="Check-ins due in the next 24 hours" id="checkins">
        <BookingList bookings={d.checkInsDue} showRequester empty="No pickups due." />
      </Section>
      <Section title="Checked out now" id="active">
        <BookingList bookings={d.active} showRequester empty="Nothing is checked out." />
      </Section>
    </div>
  );
}

function Settle() {
  const dash = useQuery({ queryKey: ['dashboard', 'staff'], queryFn: api.staffDashboard });
  const incidents = useQuery({ queryKey: ['incidents', 'open'], queryFn: () => api.incidents('open') });
  const d = dash.data!;
  return (
    <div className="space-y-6">
      <Section title="Deposits to resolve" id="deposits" intro="Suggestions are advice only. A person decides every refund and forfeit.">
        {d.depositsToResolve.length === 0 ? (
          <Empty>No deposits are waiting for a decision.</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {d.depositsToResolve.map((t) => (
              <li key={t.bookingId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/bookings/${t.bookingId}?tab=deposit`} className="font-semibold">
                    {t.resourceName} — {t.requesterName}
                  </Link>
                  <span className="rounded-full border border-slate-400 bg-mist-soft px-2.5 py-0.5 text-sm font-semibold">
                    Suggested: {label(t.recommendedAction)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {rupees(t.depositMinor)} held · booking {label(t.bookingStatus).toLowerCase()} · condition{' '}
                  {t.checkInRating ? label(t.checkInRating) : '—'} → {t.returnRating ? label(t.returnRating) : '—'}
                  {t.openIncidents > 0 && (
                    <>
                      {' '}
                      · <span className="font-semibold text-red-800">{t.openIncidents} open incident{t.openIncidents > 1 ? 's' : ''}</span>
                    </>
                  )}
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
              <li key={i.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/bookings/${i.bookingId}?tab=incidents`} className="font-semibold">
                    {label(i.kind)}: {i.resourceName}
                  </Link>
                  <StateChip status={i.status} />
                </div>
                <p className="mt-1 text-sm">{i.description}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {i.requesterName} · raised by {i.raisedByName}, {when(i.raisedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Resources() {
  const resources = useQuery({ queryKey: ['org-resources'], queryFn: api.orgResources });
  return (
    <Section title="Your resources" id="resources" actions={<LinkButton to="/staff/resources/new">New resource</LinkButton>}>
      {resources.isLoading && <Loading what="Loading resources" />}
      <ErrorAlert error={resources.error} />
      {resources.data && resources.data.length === 0 && <Empty>No listings yet. Add your first resource.</Empty>}
      {resources.data && resources.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.data.map((r) => (
            <li key={r.id} className="flex flex-col gap-2">
              <ResourceCardView r={r} />
              <LinkButton to={`/staff/resources/${r.id}/edit`} variant="secondary">
                Edit {r.name}
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function StaffDashboardPage() {
  const { isOwner } = useAuth();
  const [params] = useSearchParams();
  const dash = useQuery({ queryKey: ['dashboard', 'staff'], queryFn: api.staffDashboard, refetchInterval: 30_000 });

  if (dash.isLoading) return <Loading what="Loading the staff dashboard" />;
  if (dash.error) return <ErrorAlert error={dash.error} />;
  const d = dash.data!;
  const c = d.counts;
  const view = params.get('view') ?? 'decide';

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: 'Decide',
      tiles: [
        { text: 'Requests to decide', n: c.requestsToDecide, view: 'decide' },
        { text: 'Verifications to review', n: c.verificationsToReview, view: 'decide' },
        { text: 'Extension requests', n: c.extensionRequests, view: 'decide' },
      ],
    },
    {
      title: 'Today',
      tiles: [
        { text: 'Overdue returns', n: c.overdue, view: 'today', urgent: true },
        { text: 'Check-ins due (24 h)', n: c.checkInsDue, view: 'today' },
      ],
    },
    {
      title: 'Settle',
      tiles: [
        { text: 'Deposits to resolve', n: c.depositsToResolve, view: 'settle' },
        { text: 'Open incidents', n: c.openIncidents, view: 'settle' },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Staff dashboard"
        intro={
          <>
            <span className="font-semibold">{d.orgName}</span> · Everything waiting for a person to decide. The system only waitlists, promotes and
            raises overdue incidents.
          </>
        }
        actions={isOwner ? <LinkButton to="/staff/resources/new">New resource</LinkButton> : undefined}
      />
      {d.orgVerified === false && (
        <Alert tone="warning" title="Your organisation is not verified yet">
          A platform admin must verify it before borrowers can see your listings. You can prepare listings now.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr_2fr]">
        {groups.map((g) => (
          <div key={g.title}>
            <h2 className="eyebrow mb-2">{g.title}</h2>
            <ul className={`grid gap-3 ${g.tiles.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
              {g.tiles.map((t) => (
                <li key={t.text}>
                  <CountTile t={t} active={view === t.view} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Tabs
        label="Staff work"
        param="view"
        tabs={[
          { id: 'decide', label: `Decide (${c.requestsToDecide + c.verificationsToReview + c.extensionRequests})`, content: <Decide /> },
          { id: 'today', label: `Today (${c.overdue + c.checkInsDue + d.active.length})`, content: <Today /> },
          { id: 'settle', label: `Settle (${c.depositsToResolve + c.openIncidents})`, content: <Settle /> },
          ...(isOwner ? [{ id: 'resources', label: 'Your resources', content: <Resources /> }] : []),
        ]}
      />
    </div>
  );
}
