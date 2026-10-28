import { useQueryClient } from '@tanstack/react-query';

/** After any change to a booking, refetch everything shown about it. */
export function useBookingRefresh(bookingId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of ['booking', 'deposit', 'events', 'photos']) qc.invalidateQueries({ queryKey: [key, bookingId] });
    qc.invalidateQueries({ queryKey: ['inbox'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
  };
}
