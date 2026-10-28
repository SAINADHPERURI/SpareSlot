import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CredentialKind, ResourceRequest } from '../api/types';
import { Alert, Button, Checkbox, ErrorAlert, Loading, PageHeader, Section, SelectField, TextArea, TextField } from '../components/ui';
import { CREDENTIAL_KINDS, label } from '../lib/labels';

const EMPTY: ResourceRequest = {
  name: '',
  category: 'equipment',
  description: '',
  location: '',
  conditions: '',
  maxBookingHours: 4,
  weeklyHourCap: 8,
  depositMinor: 0,
  active: true,
  requirements: [],
};

export function ResourceFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['resource', id, 'edit'], queryFn: () => api.resource(id!), enabled: editing });
  const [form, setForm] = useState<ResourceRequest>(EMPTY);
  const [depositRupees, setDepositRupees] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const r = existing.data?.resource;
    if (!r) return;
    setForm({
      name: r.name,
      category: r.category,
      description: r.description,
      location: r.location,
      conditions: r.conditions,
      maxBookingHours: r.maxBookingHours,
      weeklyHourCap: r.weeklyHourCap,
      depositMinor: r.depositMinor,
      active: r.active,
      requirements: r.requirements,
    });
    setDepositRupees(String(r.depositMinor / 100));
  }, [existing.data]);

  const set = <K extends keyof ResourceRequest>(k: K, v: ResourceRequest[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rupees = Number(depositRupees || '0');
    if (!Number.isFinite(rupees) || rupees < 0) {
      setError(new Error('The deposit must be 0 or more rupees.'));
      return;
    }
    const body = { ...form, depositMinor: Math.round(rupees * 100) };
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateResource(id!, body);
        setSaved(true);
        qc.invalidateQueries({ queryKey: ['resource', id] });
      } else {
        const created = await api.createResource(body);
        navigate(`/staff/resources/${created.id}/edit`, { replace: true });
      }
      qc.invalidateQueries({ queryKey: ['org-resources'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (editing && existing.isLoading) return <Loading what="Loading the listing" />;
  if (editing && existing.error) return <ErrorAlert error={existing.error} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={editing ? `Edit ${form.name || 'listing'}` : 'New resource'}
        intro="Borrowers see all of this before they request. Every change is written to the audit log."
      />
      <form onSubmit={submit} className="card space-y-4">
        <TextField label="Name" required maxLength={160} value={form.name} onChange={(e) => set('name', e.target.value)} />
        <SelectField label="Category" required value={form.category} onChange={(e) => set('category', e.target.value as 'equipment' | 'space')}>
          <option value="equipment">Equipment</option>
          <option value="space">Space</option>
        </SelectField>
        <TextArea label="Description" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />
        <TextField label="Location" value={form.location} onChange={(e) => set('location', e.target.value)} hint="Room, building or address where it is picked up." />
        <TextArea
          label="Conditions of use"
          rows={5}
          value={form.conditions}
          onChange={(e) => set('conditions', e.target.value)}
          hint="Plain text: rules, whether supervision is needed, any institutional approval."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Maximum hours per booking"
            type="number"
            min={1}
            max={168}
            required
            value={form.maxBookingHours}
            onChange={(e) => set('maxBookingHours', Number(e.target.value))}
          />
          <TextField
            label="Weekly hour cap"
            type="number"
            min={1}
            max={168}
            required
            value={form.weeklyHourCap}
            onChange={(e) => set('weeklyHourCap', Number(e.target.value))}
            hint="Per user, or per team."
          />
          <TextField
            label="Refundable deposit (₹)"
            type="number"
            min={0}
            step="1"
            required
            value={depositRupees}
            onChange={(e) => {
              setSaved(false);
              setDepositRupees(e.target.value);
            }}
            hint="0 means no deposit. Applies to every borrower."
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">Required credentials</legend>
          <p className="mb-2 text-sm text-slate-600">Borrowers need a verified, unexpired credential of every kind you tick.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CREDENTIAL_KINDS.map((k) => (
              <Checkbox
                key={k}
                label={label(k)}
                checked={form.requirements.includes(k)}
                onChange={(e) =>
                  set(
                    'requirements',
                    e.target.checked ? [...form.requirements, k as CredentialKind] : form.requirements.filter((x) => x !== k),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Checkbox label="Active: borrowers can find and request it" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        <ErrorAlert error={error} />
        {saved && <Alert tone="success">Saved. The change is in the audit log.</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy}>
            {editing ? 'Save changes' : 'Create resource'}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={() => navigate(`/resources/${id}`)}>
              View listing
            </Button>
          )}
        </div>
      </form>
      {editing && id && <ListingPhotos resourceId={id} />}
    </div>
  );
}

function ListingPhotos({ resourceId }: { resourceId: string }) {
  const qc = useQueryClient();
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ['resource', resourceId, 'edit'], queryFn: () => api.resource(resourceId) });
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['resource', resourceId] });
    qc.invalidateQueries({ queryKey: ['org-resources'] });
  };

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError(new Error('This photo is larger than 5 MB.'));
    setBusy('upload');
    setError(null);
    try {
      await api.addListingPhoto(resourceId, file, caption.trim());
      setFile(null);
      setCaption('');
      if (inputRef.current) inputRef.current.value = '';
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function remove(photoId: string) {
    setBusy(photoId);
    setError(null);
    try {
      await api.removeListingPhoto(resourceId, photoId);
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const photos = q.data?.photos ?? [];
  return (
    <Section title="Listing photos">
      <p className="mb-3 text-sm text-slate-700">Anyone can see these. Up to 8. Location data is removed when you upload.</p>
      {photos.length === 0 && <p className="mb-3 text-slate-700">No photos yet.</p>}
      <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id}>
            <img src={api.listingPhotoUrl(p.id)} alt={p.caption || 'Listing photo'} className="h-28 w-full rounded object-cover" />
            {p.caption && <p className="text-sm">{p.caption}</p>}
            <Button variant="secondary" className="mt-1 w-full" busy={busy === p.id} onClick={() => remove(p.id)}>
              Remove photo
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={upload} className="space-y-3">
        <div>
          <label htmlFor={fileId} className="mb-1 block text-sm font-semibold text-slate-800">
            Photo
          </label>
          <input
            ref={inputRef}
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-slate-400 file:bg-white file:px-3 file:font-semibold"
          />
          <p className="mt-1 text-sm text-slate-600">JPEG, PNG or WebP, up to 5 MB.</p>
        </div>
        <TextField label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <ErrorAlert error={error} />
        <Button type="submit" variant="secondary" busy={busy === 'upload'} disabled={!file}>
          Upload photo
        </Button>
      </form>
    </Section>
  );
}
