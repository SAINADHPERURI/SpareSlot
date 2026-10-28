import { useState, type ReactNode } from 'react';
import { Button, Dialog, ErrorAlert, TextArea } from './ui';

/**
 * A decision dialog whose reason cannot be submitted empty. The reason is shown to the other person and
 * written to the audit log, so the hint says so.
 */
export function ReasonDialog({
  title,
  intro,
  submitLabel,
  reasonLabel = 'Reason',
  reasonRequired = true,
  danger,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  intro?: ReactNode;
  submitLabel: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  danger?: boolean;
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blank = reason.trim() === '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reasonRequired && blank) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {intro && <div className="text-slate-700">{intro}</div>}
        {children}
        <TextArea
          label={reasonLabel}
          required={reasonRequired}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          hint={
            reasonRequired
              ? 'Required. The other person reads this, and it is kept in the audit log.'
              : 'Optional. It is kept in the audit log.'
          }
        />
        <ErrorAlert error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={busy} disabled={reasonRequired && blank}>
            {submitLabel}
          </Button>
        </div>
        {reasonRequired && blank && (
          <p className="text-right text-sm text-slate-600">Write a reason to enable “{submitLabel}”.</p>
        )}
      </form>
    </Dialog>
  );
}
