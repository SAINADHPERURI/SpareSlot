import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { BookingDetail, ResourceDetail } from '../api/types';
import {
  Alert,
  Button,
  Dl,
  ErrorAlert,
  LinkButton,
  Loading,
  PageHeader,
  Section,
  StateChip,
  TextArea,
  TextField,
  VerifiedBadge,
} from '../components/ui';
import { useAuth } from '../lib/auth';
import { hours, localInputToIso, nextHour, rupees, toLocalInput, windowText } from '../lib/format';
import { label } from '../lib/labels';

export function ResourcePage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const detail = useQuery({ queryKey: ['resource', id, session?.userId], queryFn: () => api.resource(id) });

  if (detail.isLoading) return <Loading what="Loading the resource" />;
  if (detail.error) return <ErrorAlert error={detail.error} />;
  const d = detail.data!;
  const r = d.resource;

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.name}
        intro={
          <span className="flex flex-wrap items-center gap-2">
            {label(r.category)} at <Link to={`/organisations/${r.orgId}`}>{r.orgName}</Link>
            <VerifiedBadge verified={r.orgVerified} />
          </span>
        }
        actions={d.canEdit ? <LinkButton to={`/staff/resources/${r.id}/edit`} variant="secondary">Edit listing</LinkButton> : undefined}
      />

      {d.photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Listing photos">
          {d.photos.map((p) => (
            <li key={p.id}>
              <img src={api.listingPhotoUrl(p.id)} alt={p.caption || `Photo of ${r.name}`} className="h-36 w-full rounded-md object-cover" />
              {p.caption && <p className="mt-1 text-sm text-slate-700">{p.caption}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Section title="Before you request">
            {r.description && <p className="mb-4 whitespace-pre-line text-slate-800">{r.description}</p>}
            <Dl
              items={[
                ['Location', r.location || 'Ask the organisation'],
                ['Longest booking', `${r.maxBookingHours} hours at a time`],
                ['Weekly limit', `${r.weeklyHourCap} hours per person or team per week`],
                ['Security deposit', r.depositMinor > 0 ? `${rupees(r.depositMinor)}, refundable. You pay it after approval and before pickup.` : 'None'],
                ...(d.myHoursThisWeek != null
                  ? ([['Your hours this week', `${hours(d.myHoursThisWeek)} of ${r.weeklyHourCap}`]] as [string, string][])
                  : []),
              ]}
            />
          </Section>
          <Section title="Conditions of use">
            <p className="whitespace-pre-line text-slate-800">{r.conditions || 'No extra conditions.'}</p>
          </Section>
          <Section title="Who can borrow it">
            {r.requirements.length === 0 ? (
              <p>Anyone with an account. No credentials needed.</p>
            ) : (
              <ul className="space-y-2">
                {r.requirements.map((k) => {
                  const missing = r.missingCredentials?.includes(k);
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{label(k)}</span>
                      {r.eligible == null ? (
                        <span className="text-sm text-slate-700">verified credential required</span>
                      ) : missing ? (
                        <>
                          <StateChip status="rejected" text="You are missing it" />
                          <Link to={`/profile/verify?kind=${k}`}>Request verification</Link>
                        </>
                      ) : (
                        <StateChip status="verified" text="You have it" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          <RequestPanel d={d} />
          <Section title="Already booked">
            {d.bookedWindows.length === 0 ? (
              <p>No upcoming bookings. Any future window is open until someone else books it.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.bookedWindows.map((w) => (
                  <li key={w.startAt + w.endAt}>
                    {windowText(w.startAt, w.endAt)} <span className="text-slate-700">({label(w.status)})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-slate-700">
              If you ask for a booked time, your request joins a waitlist instead of being refused.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function RequestPanel({ d }: { d: ResourceDetail }) {
  const { session, isUser } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const r = d.resource;
  const [start, setStart] = useState(toLocalInput(nextHour(24)));
  const [end, setEnd] = useState(toLocalInput(nextHour(26)));
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [waitlisted, setWaitlisted] = useState<BookingDetail | null>(null);

  if (!session) {
    return (
      <Section title="Request time">
        <p className="mb-3">Sign in to request this resource.</p>
        <LinkButton to="/signin">Sign in</LinkButton>
      </Section>
    );
  }
  if (!isUser) {
    return (
      <Section title="Request time">
        <p>Only borrower accounts request resources. You are signed in as {label(session.role)}.</p>
      </Section>
    );
  }
  if (waitlisted?.booking.queue) {
    const q = waitlisted.booking.queue;
    return (
      <Section title="You are on the waitlist">
        <Alert tone="warning" title={`Slot taken: you are number ${q.position} of ${q.size} in the queue`}>
          <p>{waitlisted.booking.decisionReason}</p>
          <p className="mt-2">{q.explanation}</p>
        </Alert>
        <div className="mt-4">
          <LinkButton to={`/bookings/${waitlisted.booking.id}`}>See the request</LinkButton>
        </div>
      </Section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createBooking({
        resourceId: r.id,
        startAt: localInputToIso(start),
        endAt: localInputToIso(end),
        purpose: purpose.trim(),
      });
      qc.invalidateQueries({ queryKey: ['resource', r.id] });
      if (created.booking.status === 'waitlisted') setWaitlisted(created);
      else navigate(`/bookings/${created.booking.id}`, { state: { created: true } });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Request time">
      {r.eligible === false && (
        <div className="mb-4">
          <Alert tone="warning" title="You are not eligible yet">
            This needs a verified {(r.missingCredentials ?? []).map((k) => label(k)).join(', ')}.{' '}
            {(r.missingCredentials ?? []).map((k) => (
              <Link key={k} to={`/profile/verify?kind=${k}`} className="mr-2 font-semibold">
                Request {label(k)} verification
              </Link>
            ))}
          </Alert>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Start" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField
          label="End"
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          hint={`At most ${r.maxBookingHours} hours. Times are in your local time.`}
        />
        <TextArea
          label="What will you use it for?"
          required
          maxLength={1000}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          hint="Staff read this when they decide."
        />
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={purpose.trim() === ''} className="w-full">
          Send request
        </Button>
        <p className="text-sm text-slate-700">
          We check, in order: the listing is open, the times, your credentials, your open requests (at most 5) and the weekly
          limit. If one fails we say which and what to do; nothing is booked.
        </p>
      </form>
    </Section>
  );
}
