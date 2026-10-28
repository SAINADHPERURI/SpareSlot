import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AdminOrganisation, AdminUser } from '../api/types';
import { EventItem } from '../components/booking/Timeline';
import { ReasonDialog } from '../components/ReasonDialog';
import { Button, Empty, ErrorAlert, Loading, PageHeader, Section, SelectField, StateChip, Tabs, TextField, VerifiedBadge } from '../components/ui';
import { day } from '../lib/format';
import { label } from '../lib/labels';

export function AdminPage() {
  const stats = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: api.adminDashboard });
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" intro="Verify organisations, suspend or reinstate accounts, and read the platform-wide audit log." />
      {stats.data && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['Organisations awaiting', stats.data.organisationsAwaiting],
              ['Accounts', stats.data.users],
              ['Suspended', stats.data.suspendedUsers],
              ['Bookings', stats.data.bookings],
              ['Audit events', stats.data.auditEvents],
            ] as [string, number][]
          ).map(([t, n]) => (
            <li key={t} className="card">
              <span className="block text-3xl font-bold">{n}</span>
              <span className="text-sm text-slate-700">{t}</span>
            </li>
          ))}
        </ul>
      )}
      <Tabs
        label="Admin sections"
        tabs={[
          {
            id: 'organisations',
            label: stats.data?.organisationsAwaiting ? `Organisations (${stats.data.organisationsAwaiting} waiting)` : 'Organisations',
            content: <Organisations />,
          },
          { id: 'users', label: 'Users', content: <Users /> },
          { id: 'audit', label: 'Audit log', content: <AuditLog /> },
        ]}
      />
    </div>
  );
}

function Organisations() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => api.adminOrganisations() });
  const [verifying, setVerifying] = useState<AdminOrganisation | null>(null);
  const awaiting = q.data?.filter((o) => !o.verified) ?? [];
  const verified = q.data?.filter((o) => o.verified) ?? [];
  return (
    <Section title="Organisations">
      {q.isLoading && <Loading what="Loading organisations" />}
      <ErrorAlert error={q.error} />
      {q.data && (
        <>
          <h3 className="mb-2 font-semibold">Awaiting verification ({awaiting.length})</h3>
          {awaiting.length === 0 ? (
            <Empty>No organisation is waiting.</Empty>
          ) : (
            <ul className="mb-4 space-y-2">
              {awaiting.map((o) => (
                <li key={o.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{o.name}</p>
                      <p className="text-sm text-slate-700">
                        {label(o.kind)} · {o.location || 'no location'} · {o.staffCount} staff · {o.resourceCount} listings · registered{' '}
                        {day(o.createdAt)}
                      </p>
                      {o.description && <p className="text-sm">{o.description}</p>}
                    </div>
                    <Button onClick={() => setVerifying(o)}>Verify</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-4 font-semibold">Verified ({verified.length})</h3>
          <ul className="space-y-1 text-sm">
            {verified.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <Link to={`/organisations/${o.id}`}>{o.name}</Link>
                <VerifiedBadge verified />
                <span className="text-slate-700">
                  by {o.verifiedByName ?? '—'}, {day(o.verifiedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {verifying && (
        <ReasonDialog
          title={`Verify ${verifying.name}`}
          intro="Its active listings become visible to borrowers. Say what you checked."
          submitLabel="Verify organisation"
          onClose={() => setVerifying(null)}
          onSubmit={async (reason) => {
            await api.verifyOrganisation(verifying.id, reason);
            qc.invalidateQueries({ queryKey: ['admin'] });
            qc.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
          }}
        />
      )}
    </Section>
  );
}

function Users() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['admin', 'users', search], queryFn: () => api.adminUsers(search || undefined), placeholderData: keepPreviousData });
  const [acting, setActing] = useState<{ u: AdminUser; action: 'suspend' | 'reinstate' } | null>(null);
  return (
    <Section title="Accounts">
      <form
        role="search"
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(text.trim());
        }}
      >
        <div className="w-full sm:w-72">
          <TextField label="Search by name or email" type="search" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {q.isLoading && <Loading what="Loading accounts" />}
      <ErrorAlert error={q.error} />
      {q.data && q.data.length === 0 && <Empty>No accounts match.</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Accounts</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th scope="col" className="py-2 pr-3">Name</th>
                <th scope="col" className="py-2 pr-3">Role</th>
                <th scope="col" className="py-2 pr-3">Organisation or type</th>
                <th scope="col" className="py-2 pr-3">Status</th>
                <th scope="col" className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{u.fullName}</span>
                    <span className="block text-xs text-slate-600">{u.email}</span>
                  </td>
                  <td className="py-2 pr-3">{label(u.role)}</td>
                  <td className="py-2 pr-3">{u.orgName ?? (u.borrowerType ? label(u.borrowerType) : '—')}</td>
                  <td className="py-2 pr-3">
                    <StateChip status={u.status} />
                  </td>
                  <td className="py-2">
                    {u.role !== 'admin' &&
                      (u.status === 'active' ? (
                        <Button variant="danger" onClick={() => setActing({ u, action: 'suspend' })}>
                          Suspend
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={() => setActing({ u, action: 'reinstate' })}>
                          Reinstate
                        </Button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {acting && (
        <ReasonDialog
          title={`${acting.action === 'suspend' ? 'Suspend' : 'Reinstate'} ${acting.u.fullName}`}
          intro={acting.action === 'suspend' ? 'They are signed out at once and cannot sign in until reinstated.' : 'They can sign in again.'}
          submitLabel={acting.action === 'suspend' ? 'Suspend account' : 'Reinstate account'}
          danger={acting.action === 'suspend'}
          onClose={() => setActing(null)}
          onSubmit={async (reason) => {
            if (acting.action === 'suspend') await api.suspendUser(acting.u.id, reason);
            else await api.reinstateUser(acting.u.id, reason);
            qc.invalidateQueries({ queryKey: ['admin', 'users'] });
            qc.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
          }}
        />
      )}
    </Section>
  );
}

const ENTITY_TYPES = ['', 'booking', 'credential', 'resource', 'organisation', 'incident', 'extension', 'user', 'team'];
const ROLES = ['', 'user', 'manager', 'owner', 'admin', 'system'];

function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [action, setAction] = useState('');
  const [text, setText] = useState('');
  const [applied, setApplied] = useState({ action: '', q: '' });
  const [page, setPage] = useState(0);
  const size = 25;
  const q = useQuery({
    queryKey: ['admin', 'audit', entityType, actorRole, applied, page],
    queryFn: () =>
      api.adminAudit({
        entityType: entityType || undefined,
        actorRole: actorRole || undefined,
        action: applied.action || undefined,
        q: applied.q || undefined,
        page,
        size,
      }),
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / size));

  return (
    <Section title="Audit log">
      <p className="mb-3 text-sm text-slate-700">Every decision on the platform, append-only. Nothing here can be edited or deleted.</p>
      <form
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setApplied({ action: action.trim(), q: text.trim() });
        }}
      >
        <SelectField label="Entity" value={entityType} onChange={(e) => { setPage(0); setEntityType(e.target.value); }}>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? label(t) : 'All'}
            </option>
          ))}
        </SelectField>
        <SelectField label="Actor role" value={actorRole} onChange={(e) => { setPage(0); setActorRole(e.target.value); }}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r ? label(r) : 'All'}
            </option>
          ))}
        </SelectField>
        <TextField label="Action starts with" value={action} placeholder="booking.approved" onChange={(e) => setAction(e.target.value)} />
        <TextField label="Text" type="search" value={text} placeholder="reason or name" onChange={(e) => setText(e.target.value)} />
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">
            Filter
          </Button>
        </div>
      </form>
      {q.isLoading && <Loading what="Loading the audit log" />}
      <ErrorAlert error={q.error} />
      {q.data && q.data.items.length === 0 && <Empty>No events match.</Empty>}
      {q.data && q.data.items.length > 0 && (
        <>
          <p className="mb-2 text-sm text-slate-700">{q.data.total} events</p>
          <ol className="ml-2 space-y-4 border-l-2 border-slate-300 pl-5">
            {q.data.items.map((e) => (
              <EventItem key={e.id} e={e}>
                <p className="text-xs text-slate-600">
                  {label(e.entityType)}{' '}
                  {e.entityType === 'booking' ? <Link to={`/bookings/${e.entityId}`}>{e.entityId.slice(0, 8)}</Link> : e.entityId.slice(0, 8)}
                </p>
              </EventItem>
            ))}
          </ol>
          <nav aria-label="Audit pages" className="mt-4 flex items-center justify-center gap-3">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Newer
            </Button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Older
            </Button>
          </nav>
        </>
      )}
    </Section>
  );
}
