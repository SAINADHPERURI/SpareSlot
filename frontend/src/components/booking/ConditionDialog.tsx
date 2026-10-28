import { useState } from 'react';
import type { Rating } from '../../api/types';
import { Button, Dialog, ErrorAlert, TextArea } from '../ui';
import { PhotoUploader } from './PhotoUploader';

const RATINGS: { value: Rating; text: string; hint: string }[] = [
  { value: 'good', text: 'Good', hint: 'Works and looks as expected.' },
  { value: 'minor_wear', text: 'Minor wear', hint: 'Light marks or scuffs; works fine.' },
  { value: 'damaged', text: 'Damaged', hint: 'Broken, cracked or not working. Describe it.' },
];

/** Check-in or return: a condition record first, then photos right after. */
export function ConditionDialog({
  bookingId,
  phase,
  onSubmit,
  onClose,
  onPhotos,
}: {
  bookingId: string;
  phase: 'check_in' | 'return';
  onSubmit: (rating: Rating, notes: string) => Promise<unknown>;
  onClose: () => void;
  onPhotos: () => void;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [recorded, setRecorded] = useState(false);
  const notesNeeded = rating === 'damaged' && notes.trim() === '';
  const title = phase === 'check_in' ? 'Check in (pickup)' : 'Record the return';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating || notesNeeded) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(rating, notes.trim());
      setRecorded(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (recorded) {
    return (
      <Dialog title={phase === 'check_in' ? 'Checked in' : 'Return recorded'} onClose={onClose}>
        <p className="mb-3 text-slate-800" role="status">
          ✓ The condition is recorded. Now add photos of the item, so both sides have evidence.
        </p>
        <PhotoUploader bookingId={bookingId} phase={phase} onUploaded={onPhotos} />
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-slate-700">
          {phase === 'check_in'
            ? 'Record the condition as you hand the item over. The borrower can add their own photos too.'
            : 'Record the condition as the item comes back. It is compared with the check-in record before any deposit refund.'}
        </p>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">Condition (required)</legend>
          <div className="space-y-2">
            {RATINGS.map((r) => (
              <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50">
                <input
                  type="radio"
                  name="rating"
                  value={r.value}
                  checked={rating === r.value}
                  onChange={() => setRating(r.value)}
                  className="mt-1 h-5 w-5 accent-teal-700"
                />
                <span>
                  <span className="block font-semibold">{r.text}</span>
                  <span className="block text-sm text-slate-700">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          label="Notes"
          required={rating === 'damaged'}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          hint={rating === 'damaged' ? 'Required when the item is damaged: say what is wrong.' : 'Optional. Anything worth remembering.'}
        />
        <ErrorAlert error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button type="submit" busy={busy} disabled={!rating || notesNeeded}>
            {phase === 'check_in' ? 'Record and check in' : 'Record return'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
