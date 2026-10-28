import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ResourceCard } from '../api/types';
import { rupees } from '../lib/format';
import { label } from '../lib/labels';

/** A small labelled fact, e.g. "Max · 3 h". */
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <li className="rounded-md border border-slate-200 bg-mist-soft px-2 py-1 text-xs">
      <span className="block font-semibold uppercase tracking-wide text-slate-600">{name}</span>
      <span className="block text-sm font-semibold text-ink">{value}</span>
    </li>
  );
}

export function ResourceCardView({ r }: { r: ResourceCard }) {
  return (
    <article className="card flex h-full flex-col overflow-hidden p-0 sm:p-0">
      {r.coverPhotoId ? (
        <img src={api.listingPhotoUrl(r.coverPhotoId)} alt={`Photo of ${r.name}`} className="aspect-[16/9] w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center bg-mist text-sm font-semibold text-brand-dark" aria-hidden="true">
          {label(r.category)}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="eyebrow">
            {label(r.category)} · {r.orgName}
            {r.orgVerified && (
              <span className="normal-case tracking-normal text-brand-dark">
                {' '}
                <span aria-hidden="true">✓</span> verified
              </span>
            )}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-snug">
            <Link to={`/resources/${r.id}`} className="text-ink">
              {r.name}
            </Link>
          </h3>
          {r.location && <p className="text-sm text-slate-700">{r.location}</p>}
        </div>
        <ul className="grid grid-cols-3 gap-2" aria-label="Key rules">
          <Fact name="Max" value={`${r.maxBookingHours} h`} />
          <Fact name="Weekly" value={`${r.weeklyHourCap} h`} />
          <Fact name="Deposit" value={r.depositMinor > 0 ? rupees(r.depositMinor) : 'None'} />
        </ul>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Needs:</span>{' '}
          {r.requirements.length === 0 ? 'no credentials' : r.requirements.map((k) => label(k)).join(', ')}
        </p>
        {!r.active && <p className="text-sm font-semibold">Inactive (hidden from borrowers)</p>}
        <div className="mt-auto">
          {r.eligible === true && (
            <p className="inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2.5 py-0.5 text-sm font-semibold text-green-950">
              <span aria-hidden="true">✓</span> You are eligible
            </p>
          )}
          {r.eligible === false && (
            <p className="inline-flex items-start gap-1 rounded-md border border-red-500 bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-950">
              <span aria-hidden="true">✕</span>
              <span>Missing: {(r.missingCredentials ?? []).map((k) => label(k)).join(', ')}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
