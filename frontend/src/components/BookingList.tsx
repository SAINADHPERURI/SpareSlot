import { Link } from 'react-router-dom';
import type { BookingSummary } from '../api/types';
import { rupees, windowText } from '../lib/format';
import { DepositChip, Empty, OverdueChip, StatusChip } from './ui';

/** A list of bookings, each linking to its page. showRequester is for staff views. */
export function BookingList({
  bookings,
  empty,
  showRequester,
}: {
  bookings: BookingSummary[];
  empty: string;
  showRequester?: boolean;
}) {
  if (bookings.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
      {bookings.map((b) => (
        <li key={b.id} className="p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/bookings/${b.id}`} className="text-base font-semibold">
                {b.resourceName}
              </Link>
              <p className="text-sm text-slate-700">
                {windowText(b.startAt, b.endAt)}
                {showRequester && <> · {b.requesterName}</>}
                {!showRequester && <> · {b.orgName}</>}
              </p>
              {b.queue && (
                <p className="mt-1 text-sm font-semibold text-amber-900">
                  Number {b.queue.position} of {b.queue.size} in the queue
                </p>
              )}
              {b.decisionReason && b.status !== 'requested' && (
                <p className="mt-1 text-sm text-slate-700">
                  <span className="font-semibold">Reason:</span> {b.decisionReason}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={b.status} />
              {b.overdue && <OverdueChip />}
              {b.depositStatus !== 'none' && <DepositChip status={b.depositStatus} />}
              {b.depositStatus === 'pending' && <span className="text-sm text-slate-700">{rupees(b.depositMinor)}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
