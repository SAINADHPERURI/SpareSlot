import { useId, useRef, useState } from 'react';
import { api } from '../../api';
import type { PhotoPhase } from '../../api/types';
import { label } from '../../lib/labels';
import { Alert, Button, ErrorAlert, SelectField, TextField } from '../ui';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Uploads one condition photo. The server checks the real type, size and limits; this pre-check only saves a trip. */
export function PhotoUploader({
  bookingId,
  phase,
  phases,
  onUploaded,
}: {
  bookingId: string;
  phase?: PhotoPhase;
  phases?: PhotoPhase[];
  onUploaded: () => void;
}) {
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosenPhase, setChosenPhase] = useState<PhotoPhase>(phase ?? phases?.[0] ?? 'check_in');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  function choose(f: File | null) {
    setLocalError(null);
    setFile(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setLocalError('This photo is larger than 5 MB. Choose a smaller one.');
    if (f.type && !TYPES.includes(f.type)) return setLocalError('Only JPEG, PNG and WebP photos are accepted.');
    setFile(f);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.addBookingPhoto(bookingId, file, chosenPhase, caption.trim());
      setFile(null);
      setCaption('');
      if (inputRef.current) inputRef.current.value = '';
      setDone((n) => n + 1);
      onUploaded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {!phase && phases && phases.length > 1 && (
        <SelectField label="Step" value={chosenPhase} onChange={(e) => setChosenPhase(e.target.value as PhotoPhase)}>
          {phases.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </SelectField>
      )}
      <div>
        <label htmlFor={fileId} className="mb-1 block text-sm font-semibold text-slate-800">
          Photo ({phase ? label(phase) : label(chosenPhase)})
        </label>
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-slate-400 file:bg-white file:px-3 file:font-semibold"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-describedby={fileId + '-hint'}
        />
        <p id={fileId + '-hint'} className="mt-1 text-sm text-slate-600">
          JPEG, PNG or WebP, up to 5 MB, at most 6 per side per step. Location data (GPS) is removed. Photos cannot be deleted later.
        </p>
      </div>
      <TextField label="Caption" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} hint="Optional, e.g. “Scratch on the left edge”." />
      {localError && <Alert tone="error">{localError}</Alert>}
      <ErrorAlert error={error} />
      {done > 0 && <p className="text-sm font-semibold text-green-900" role="status">✓ {done} photo{done > 1 ? 's' : ''} added.</p>}
      <Button type="submit" variant="secondary" busy={busy} disabled={!file}>
        Upload photo
      </Button>
    </form>
  );
}
