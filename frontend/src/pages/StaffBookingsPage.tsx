import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BookingList } from '../components/BookingList';
import { Checkbox, ErrorAlert, Loading, PageHeader, SelectField } from '../components/ui';
import { label } from '../lib/labels';
import { STATUS_FILTERS } from './MyBookingsPage';

export function StaffBookingsPage() {
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const q = useQuery({
    queryKey: ['bookings', 'org', status, overdue],
    queryFn: () => api.bookings({ status: status || undefined, overdue: overdue || undefined }),
  });
  return (
    <div>
      <PageHeader title="All bookings" intro="Every booking on your organisation’s resources." />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-60">
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s ? label(s) : 'All statuses'}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="pb-3">
          <Checkbox label="Only overdue" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
        </div>
      </div>
      {q.isLoading && <Loading what="Loading bookings" />}
      <ErrorAlert error={q.error} />
      {q.data && <BookingList bookings={q.data} showRequester empty="No bookings match." />}
    </div>
  );
}
