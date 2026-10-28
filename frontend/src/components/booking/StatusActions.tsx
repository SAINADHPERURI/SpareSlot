import { useState } from 'react';
import { api } from '../../api';
import type { BookingDetail } from '../../api/types';
import { ACTION_BUTTONS } from '../../lib/labels';
import { ReasonDialog } from '../ReasonDialog';
import { Button } from '../ui';
import { ConditionDialog } from './ConditionDialog';
import { useBookingRefresh } from './useBookingRefresh';

/** The status actions, rendered only from the server's allowedActions. */
const STATUS_ACTIONS = ['approve', 'waitlist', 'reject', 'check_in', 'return', 'close', 'cancel'] as const;
type StatusAction = (typeof STATUS_ACTIONS)[number];

export function StatusActions({ detail }: { detail: BookingDetail }) {
  const b = detail.booking;
  const refresh = useBookingRefresh(b.id);
  const [open, setOpen] = useState<StatusAction | null>(null);
  const actions = STATUS_ACTIONS.filter((a) => b.allowedActions.includes(a));
  const close = () => setOpen(null);
  const done = async <T,>(p: Promise<T>) => {
    const r = await p;
    refresh();
    return r;
  };

  return (
    <>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === 'reject' || a === 'cancel' ? 'danger' : a === 'waitlist' || a === 'close' ? 'secondary' : 'primary'}
              onClick={() => setOpen(a)}
            >
              {ACTION_BUTTONS[a]}
            </Button>
          ))}
        </div>
      )}

      {open === 'approve' && (
        <ReasonDialog
          title="Approve this request"
          intro={`${b.requesterName} will see your reason. If the listing has a deposit, it becomes due now: the borrower pays it before pickup.`}
          submitLabel="Approve"
          onClose={close}
          onSubmit={(reason) => done(api.decide(b.id, 'approve', reason))}
        />
      )}
      {open === 'reject' && (
        <ReasonDialog
          title="Reject this request"
          intro="A person always decides rejections. Say why, and what would change your answer if anything."
          submitLabel="Reject"
          danger
          onClose={close}
          onSubmit={(reason) => done(api.decide(b.id, 'reject', reason))}
        />
      )}
      {open === 'waitlist' && (
        <ReasonDialog
          title="Put this request on the waitlist"
          intro="The borrower keeps their place in the queue and is approved automatically if the slot frees up."
          submitLabel="Waitlist"
          onClose={close}
          onSubmit={(reason) => done(api.decide(b.id, 'waitlist', reason))}
        />
      )}
      {open === 'cancel' && (
        <ReasonDialog
          title="Cancel this booking"
          intro={
            b.depositStatus === 'paid'
              ? 'The paid deposit is refunded automatically, because the item was never taken. The slot is offered to the waitlist.'
              : 'The slot is offered to the next request on the waitlist, if any.'
          }
          submitLabel="Cancel booking"
          danger
          onClose={close}
          onSubmit={(reason) => done(api.cancel(b.id, reason))}
        />
      )}
      {open === 'close' && (
        <ReasonDialog
          title="Close this booking"
          intro="Closing marks the journey complete. The history stays readable."
          submitLabel="Close booking"
          reasonLabel="Note"
          reasonRequired={false}
          onClose={close}
          onSubmit={(note) => done(api.close(b.id, note))}
        />
      )}
      {(open === 'check_in' || open === 'return') && (
        <ConditionDialog
          bookingId={b.id}
          phase={open}
          onClose={() => {
            close();
            refresh();
          }}
          onPhotos={refresh}
          onSubmit={(rating, notes) =>
            open === 'check_in' ? api.checkIn(b.id, rating, notes) : api.returnItem(b.id, rating, notes)
          }
        />
      )}
    </>
  );
}
