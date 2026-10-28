const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function when(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : '';
}

export function day(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : '';
}

/** "Mon 3 Nov, 10:00 – 12:00" or across days "Mon 3 Nov, 10:00 – Tue 4 Nov, 09:00" */
export function windowText(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  return `${DATE_TIME.format(s)} – ${sameDay ? TIME.format(e) : DATE_TIME.format(e)}`;
}

export function rupees(minor: number): string {
  if (!minor) return '₹0';
  const r = minor / 100;
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export function hours(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
}

/** A Date to the value of an <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a datetime-local input (local time) to an ISO-8601 string with the browser's offset. */
export function localInputToIso(value: string): string {
  const d = new Date(value);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${value.length === 16 ? value + ':00' : value}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

export function nextHour(offsetHours = 1): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offsetHours);
  return d;
}
