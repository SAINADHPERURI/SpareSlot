import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ResourceCardView } from '../components/ResourceCardView';
import { Dl, Empty, ErrorAlert, Loading, PageHeader, Section, VerifiedBadge } from '../components/ui';
import { useAuth } from '../lib/auth';
import { day } from '../lib/format';
import { label } from '../lib/labels';

export function OrganisationPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const q = useQuery({ queryKey: ['organisation', id, session?.userId], queryFn: () => api.organisation(id) });
  if (q.isLoading) return <Loading what="Loading the organisation" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const { organisation: o, resources } = q.data!;
  return (
    <div className="space-y-6">
      <PageHeader title={o.name} intro={<VerifiedBadge verified={o.verified} />} />
      <Section title="About">
        {o.description && <p className="mb-4 whitespace-pre-line">{o.description}</p>}
        <Dl
          items={[
            ['Kind', label(o.kind)],
            ['Location', o.location || '—'],
            ['Verified', o.verified ? `Yes, since ${day(o.verifiedAt)}` : 'Not yet'],
          ]}
        />
      </Section>
      <section aria-labelledby="org-resources">
        <h2 id="org-resources" className="mb-3 text-xl font-bold">
          Resources ({resources.length})
        </h2>
        {resources.length === 0 ? (
          <Empty>This organisation has no active listings yet.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => (
              <li key={r.id}>
                <ResourceCardView r={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
