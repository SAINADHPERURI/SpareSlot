import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import type { BookingDetail, DepositCondition, DepositView } from '../../api/types';
import { rupees, when } from '../../lib/format';
import { ACTION_BUTTONS, label } from '../../lib/labels';
import { ReasonDialog } from '../ReasonDialog';
import { Alert, Button, DepositChip, Dialog, ErrorAlert, Loading, Section } from '../ui';
import { PhaseColumn, usePhotos } from './PhotosPanel';
import { useBookingRefresh } from './useBookingRefresh';

const DEMO = 'Demo payment: no real money moves';

function DemoBanner() {
  return (
    <p className="rounded-md border-2 border-dashed border-amber-500 bg-amber-50 px-3 py-2 text-center font-bold text-amber-950">
      <span aria-hidden="true">⚠ </span>
      {DEMO}
    </p>
  );
}

function ConditionLine({ title, c }: { title: string; c: DepositCondition | null }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {c ? (
        <>
          <p className="font-bold">{label(c.rating)}</p>
          {c.notes && <p className="text-sm">{c.notes}</p>}
          <p className="text-xs text-slate-600">
            {c.recordedByName}, {when(c.recordedAt)}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-700">Not recorded</p>
      )}
    </div>
  );
}

/** Shown beside a refund or forfeit decision: both condition records, advice, and both sides' photos. */
function DecisionEvidence({ d, bookingId }: { d: DepositView; bookingId: string }) {
  const photos = usePhotos(bookingId);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ConditionLine title="At check-in" c={d.checkIn} />
        <ConditionLine title="At return" c={d.returned} />
      </div>
      {d.originalCondition != null && (
        <p className="text-sm">
          <span className="font-semibold">Original condition:</span>{' '}
          {d.originalCondition ? 'Yes — it came back no worse than it left.' : 'No — it came back worse, or an incident is open.'}
        </p>
      )}
      {d.openIncidents > 0 && (
        <Alert tone="warning" title="An incident is still open">
          Nothing is refunded or forfeited while a damage or dispute incident is open.
        </Alert>
      )}
      {d.recommendedAction && (
        <p className="rounded-md bg-slate-100 p-2 text-sm">
          <span className="font-semibold">Suggested: {label(d.recommendedAction)}.</span> Advice only — a person decides.
        </p>
      )}
      {photos.data && (
        <div className="space-y-2">
          <PhaseColumn title="Check-in photos" phase="check_in" photos={photos.data} />
          <PhaseColumn title="Return photos" phase="return" photos={photos.data} />
        </div>
      )}
    </div>
  );
}

type DepositAction = 'pay_deposit' | 'waive_deposit' | 'refund_deposit' | 'forfeit_deposit';

export function DepositPanel({ detail }: { detail: BookingDetail }) {
  const b = detail.booking;
  const refresh = useBookingRefresh(b.id);
  const q = useQuery({ queryKey: ['deposit', b.id], queryFn: () => api.deposit(b.id) });
  const [open, setOpen] = useState<DepositAction | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<unknown>(null);
  const actions = (['pay_deposit', 'waive_deposit', 'refund_deposit', 'forfeit_deposit'] as const).filter((a) =>
    b.allowedActions.includes(a),
  );
  const blocked = (['refund_deposit', 'forfeit_deposit'] as const).filter((a) => b.blockedActions[a]);
  const close = () => setOpen(null);
  const run = async (p: Promise<unknown>) => {
    await p;
    refresh();
  };

  return (
    <Section title="Deposit" id="deposit">
      {q.isLoading && <Loading what="Loading the deposit" />}
      <ErrorAlert error={q.error} />
      {q.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold">{q.data.amountMinor > 0 ? rupees(q.data.amountMinor) : '₹0'}</span>
            <DepositChip status={q.data.status} />
          </div>
          {q.data.status === 'none' && <p className="text-slate-700">No deposit on this booking.</p>}
          {q.data.status === 'pending' && (
            <p className="text-slate-800">
              Refundable. The borrower pays it after approval and before pickup. It comes back if the item is never taken, or
              comes back in its original condition.
            </p>
          )}
          {q.data.status !== 'none' && <DemoBanner />}

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a} variant={a === 'forfeit_deposit' ? 'danger' : a === 'pay_deposit' || a === 'refund_deposit' ? 'primary' : 'secondary'} onClick={() => setOpen(a)}>
                  {ACTION_BUTTONS[a]}
                </Button>
              ))}
            </div>
          )}
          {blocked.length > 0 && (
            <ul className="space-y-1 text-sm">
              {blocked.map((a) => (
                <li key={a} className="rounded-md border border-slate-300 bg-slate-50 p-2">
                  <span className="font-semibold">{ACTION_BUTTONS[a]} is not possible yet:</span> {b.blockedActions[a]}
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="mb-2 font-semibold">Ledger</h3>
            {q.data.ledger.length === 0 ? (
              <p className="text-sm text-slate-700">No money has moved on this booking.</p>
            ) : (
              <ol className="relative space-y-3 border-l-2 border-slate-300 pl-4">
                {q.data.ledger.map((t) => (
                  <li key={t.id}>
                    <p className="font-semibold">
                      {label(t.kind)} {rupees(t.amountMinor)}
                    </p>
                    <p className="text-sm text-slate-700">
                      {t.actorName} · {when(t.createdAt)} · {t.provider === 'demo' ? 'demo provider' : t.provider}
                      {t.providerRef && <> · ref {t.providerRef}</>}
                    </p>
                    {t.reason && <p className="text-sm">Why: {t.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {open === 'pay_deposit' && q.data && (
        <Dialog title="Pay the deposit" onClose={close}>
          <div className="space-y-4">
            <DemoBanner />
            <p>
              You are paying a refundable deposit of <span className="font-bold">{rupees(q.data.amountMinor)}</span> for{' '}
              {b.resourceName}. In this prototype nothing is charged: no card, UPI or bank details are asked for or stored.
            </p>
            <ErrorAlert error={payError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Go back
              </Button>
              <Button
                data-autofocus
                busy={payBusy}
                onClick={async () => {
                  setPayBusy(true);
                  setPayError(null);
                  try {
                    await run(api.payDeposit(b.id));
                    close();
                  } catch (err) {
                    setPayError(err);
                  } finally {
                    setPayBusy(false);
                  }
                }}
              >
                Pay {rupees(q.data.amountMinor)} (demo)
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      {open === 'waive_deposit' && (
        <ReasonDialog
          title="Waive the deposit"
          intro="The borrower will not need to pay it for this booking. Say why."
          submitLabel="Waive deposit"
          onClose={close}
          onSubmit={(reason) => run(api.waiveDeposit(b.id, reason))}
        />
      )}
      {open === 'refund_deposit' && q.data && (
        <ReasonDialog
          title="Refund the deposit"
          intro={`${rupees(q.data.amountMinor)} goes back to ${b.requesterName}. ${DEMO}.`}
          submitLabel="Refund deposit"
          onClose={close}
          onSubmit={(reason) => run(api.refundDeposit(b.id, reason))}
        >
          <DecisionEvidence d={q.data} bookingId={b.id} />
        </ReasonDialog>
      )}
      {open === 'forfeit_deposit' && q.data && (
        <ReasonDialog
          title="Forfeit the deposit"
          intro={`The whole ${rupees(q.data.amountMinor)} is kept. There are no partial deductions. ${b.requesterName} can raise a dispute.`}
          submitLabel="Forfeit deposit"
          danger
          onClose={close}
          onSubmit={(reason) => run(api.forfeitDeposit(b.id, reason))}
        >
          <DecisionEvidence d={q.data} bookingId={b.id} />
        </ReasonDialog>
      )}
    </Section>
  );
}
