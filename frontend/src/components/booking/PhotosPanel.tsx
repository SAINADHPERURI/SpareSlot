import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import type { BookingDetail, BookingPhoto, PhotoPhase } from '../../api/types';
import { when } from '../../lib/format';
import { PrivateImage } from '../PrivateImage';
import { ErrorAlert, Loading, Section } from '../ui';
import { PhotoUploader } from './PhotoUploader';
import { useBookingRefresh } from './useBookingRefresh';

export function usePhotos(bookingId: string) {
  return useQuery({ queryKey: ['photos', bookingId], queryFn: () => api.bookingPhotos(bookingId) });
}

function PhotoGrid({ photos, empty }: { photos: BookingPhoto[]; empty: string }) {
  if (photos.length === 0) return <p className="text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2">
      {photos.map((p) => (
        <li key={p.id}>
          <PrivateImage path={api.bookingPhotoPath(p.id)} alt={p.caption || `Photo by ${p.uploadedByName}`} className="h-28 w-full rounded" />
          <p className="mt-1 text-xs text-slate-800">
            {p.caption && <span className="block font-semibold">{p.caption}</span>}
            {p.uploadedByName}, {when(p.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** One phase, the borrower's photos beside the staff's photos. */
export function PhaseColumn({ title, phase, photos }: { title: string; phase: PhotoPhase; photos: BookingPhoto[] }) {
  const mine = photos.filter((p) => p.phase === phase);
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <h3 className="mb-2 font-bold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-semibold text-slate-700">Borrower’s photos</h4>
          <PhotoGrid photos={mine.filter((p) => p.side === 'borrower')} empty="None yet." />
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold text-slate-700">Staff photos</h4>
          <PhotoGrid photos={mine.filter((p) => p.side === 'staff')} empty="None yet." />
        </div>
      </div>
    </div>
  );
}

export function PhotosPanel({ detail }: { detail: BookingDetail }) {
  const b = detail.booking;
  const photos = usePhotos(b.id);
  const refresh = useBookingRefresh(b.id);
  const canAdd = b.allowedActions.includes('add_photo');
  const list = photos.data ?? [];
  const hasIncident = list.some((p) => p.phase === 'incident') || detail.incidents.length > 0;
  const phases: PhotoPhase[] =
    b.status === 'approved' ? ['check_in', 'incident'] : b.status === 'checked_in' ? ['check_in', 'return', 'incident'] : ['return', 'incident', 'check_in'];

  return (
    <Section title="Condition photos" id="photos">
      <p className="mb-3 text-sm text-slate-700">
        Evidence from both sides: the borrower photographs the item at pickup, staff photograph it on return. Only the borrower and
        this organisation’s staff can see these, and they can never be edited or deleted.
      </p>
      {photos.isLoading && <Loading what="Loading photos" />}
      <ErrorAlert error={photos.error} />
      {photos.data && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <PhaseColumn title="Check-in" phase="check_in" photos={list} />
            <PhaseColumn title="Return" phase="return" photos={list} />
          </div>
          {hasIncident && <PhaseColumn title="Incident" phase="incident" photos={list} />}
        </div>
      )}
      {canAdd && (
        <div className="mt-4">
          <h3 className="mb-2 font-semibold">Add a photo</h3>
          <PhotoUploader bookingId={b.id} phases={phases} onUploaded={refresh} />
        </div>
      )}
      {!canAdd && b.blockedActions.add_photo && <p className="mt-3 text-sm text-slate-700">{b.blockedActions.add_photo}</p>}
    </Section>
  );
}
