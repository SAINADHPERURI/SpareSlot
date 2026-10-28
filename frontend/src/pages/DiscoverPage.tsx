import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ResourceCardView } from '../components/ResourceCardView';
import { Button, Checkbox, Empty, ErrorAlert, Loading, PageHeader, SelectField, TextField } from '../components/ui';
import { useAuth } from '../lib/auth';

const PAGE_SIZE = 12;

export function DiscoverPage() {
  const { session, isUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const orgId = params.get('orgId') ?? '';
  const eligible = params.get('eligible') === 'true';
  const page = Number(params.get('page') ?? '0');
  const [text, setText] = useState(q);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  const orgs = useQuery({ queryKey: ['organisations'], queryFn: api.organisations });
  const results = useQuery({
    queryKey: ['resources', q, category, orgId, eligible && isUser, page, session?.userId],
    queryFn: () =>
      api.resources({
        q: q || undefined,
        category: category || undefined,
        orgId: orgId || undefined,
        eligible: eligible && isUser ? true : undefined,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const total = results.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Discover equipment and spaces"
        intro={
          <>
            Verified labs, makerspaces and studios lend what sits idle, free within fair-use limits. Each listing shows its rules
            before you ask. {!session && <Link to="/tour">New? Take the judge’s tour.</Link>}
          </>
        }
      />
      <form
        role="search"
        aria-label="Find resources"
        className="card mb-8 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text.trim() });
        }}
      >
        <TextField label="Search" type="search" value={text} placeholder="3D printer, recording booth…" onChange={(e) => setText(e.target.value)} />
        <SelectField label="Category" value={category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All</option>
          <option value="equipment">Equipment</option>
          <option value="space">Space</option>
        </SelectField>
        <SelectField label="Organisation" value={orgId} onChange={(e) => update({ orgId: e.target.value })}>
          <option value="">All organisations</option>
          {orgs.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <Button type="submit" className="w-full sm:col-span-2 lg:col-span-1">
          Search
        </Button>
        {isUser && (
          <div className="rounded-md bg-mist-soft px-3 py-2 sm:col-span-2 lg:col-span-4">
            <Checkbox
              label="Eligible for me: only show what my verified credentials allow"
              checked={eligible}
              onChange={(e) => update({ eligible: e.target.checked ? 'true' : '' })}
            />
          </div>
        )}
      </form>

      {results.isLoading && <Loading what="Finding resources" />}
      <ErrorAlert error={results.error} />
      {results.data && (
        <>
          <p className="mb-3 text-slate-700" aria-live="polite">
            {total === 0 ? 'No resources match.' : `${total} ${total === 1 ? 'resource' : 'resources'} found.`}
          </p>
          {total === 0 ? (
            <Empty>
              Nothing matches these filters.{' '}
              {eligible ? 'Untick “Only show what I am eligible for” to see everything, then get verified for what you need.' : 'Try fewer words or another category.'}
            </Empty>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.data.items.map((r) => (
                <li key={r.id}>
                  <ResourceCardView r={r} />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>
                Previous
              </Button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => update({ page: String(page + 1) })}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
