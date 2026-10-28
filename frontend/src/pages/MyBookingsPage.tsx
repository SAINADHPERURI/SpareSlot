import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { ErrorAlert, Loading, PageHeader, SelectField } from '../components/ui';
import { label } from '../lib/labels';

export const STATUS_FILTERS = ['', 'requested', 'waitlisted', 'approved', 'checked_in', 'returned', 'closed', 'rejected', 'cancelled'];

export function MyBookingsPage() {
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['bookings', 'mine', status], queryFn: () => api.bookings({ mine: true, status: status || undefined }) });
  return (
    <div>
      <PageHeader title="My bookings" intro="Every request and booking you have made, with its decision and reason." />
      <div className="mb-4 max-w-xs">
        <SelectField label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s ? label(s) : 'All statuses'}
            </option>
          ))}
        </SelectField>
      </div>
      {q.isLoading && <Loading what="Loading your bookings" />}
      <ErrorAlert error={q.error} />
      {q.data && <BookingList bookings={q.data} empty="No bookings match. Find something to borrow on the Discover page." />}
    </div>
  );
}
