import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ResourceCard } from '../api/types';
import { rupees } from '../lib/format';
import { label } from '../lib/labels';
import { StateChip } from './ui';

export function ResourceCardView({ r }: { r: ResourceCard }) {
  return (
    <article className="card flex h-full flex-col p-0 sm:p-0">
      {r.coverPhotoId ? (
        <img
          src={api.listingPhotoUrl(r.coverPhotoId)}
          alt={`Photo of ${r.name}`}
          className="h-40 w-full rounded-t-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-t-lg bg-slate-100 text-slate-600" aria-hidden="true">
          {label(r.category)}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {label(r.category)} · {r.orgName}
            {r.orgVerified && <span title="Verified organisation"> ✓ verified</span>}
          </p>
          <h3 className="text-lg font-bold">
            <Link to={`/resources/${r.id}`}>{r.name}</Link>
          </h3>
          {r.location && <p className="text-sm text-slate-700">{r.location}</p>}
        </div>
        <ul className="text-sm text-slate-800">
          <li>Up to {r.maxBookingHours} h per booking · {r.weeklyHourCap} h per week</li>
          <li>{r.depositMinor > 0 ? `Refundable deposit ${rupees(r.depositMinor)}` : 'No deposit'}</li>
          <li>
            {r.requirements.length === 0
              ? 'No credentials needed'
              : 'Needs: ' + r.requirements.map((k) => label(k)).join(', ')}
          </li>
          {!r.active && <li className="font-semibold">Inactive (hidden from borrowers)</li>}
        </ul>
        <div className="mt-auto pt-2">
          {r.eligible === true && <StateChip status="verified" text="You are eligible" />}
          {r.eligible === false && (
            <StateChip status="rejected" text={'Missing: ' + (r.missingCredentials ?? []).map((k) => label(k)).join(', ')} />
          )}
        </div>
      </div>
    </article>
  );
}
