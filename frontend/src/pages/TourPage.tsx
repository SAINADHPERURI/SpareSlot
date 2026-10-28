import { Link } from 'react-router-dom';
import { Alert, PageHeader } from '../components/ui';

interface Step {
  title: string;
  what: string;
  who: string;
  link: { to: string; text: string };
}

const D = '@demo.spareslot.example';

const STEPS: Step[] = [
  {
    title: 'Discover',
    what: 'Browse verified listings without signing in. Each card shows the rules up front; signed-in borrowers can tick “eligible for me”.',
    who: 'Anyone, then asha.student' + D,
    link: { to: '/', text: 'Open Discover' },
  },
  {
    title: 'Request',
    what: 'Open a resource, read its conditions, deposit and booked windows, then ask for a time with a purpose. A booked slot puts you on a waitlist with your queue position.',
    who: 'asha.student' + D,
    link: { to: '/', text: 'Pick a resource' },
  },
  {
    title: 'Pass eligibility',
    what: 'A resource that needs a credential blocks the request and names what is missing. File a verification request; a manager verifies it with a reason.',
    who: 'nisha.newcomer' + D + ' (no credentials), then dev.manager' + D,
    link: { to: '/profile/verify', text: 'Verification form' },
  },
  {
    title: 'Get approved',
    what: 'Staff approve, waitlist or reject from the queue. A reason is mandatory and the borrower reads it.',
    who: 'dev.manager' + D,
    link: { to: '/staff/queue', text: 'Requests queue' },
  },
  {
    title: 'Pay the deposit',
    what: 'If the listing has a deposit, the borrower pays it after approval on the booking page. Demo payment: no real money moves.',
    who: 'asha.student' + D,
    link: { to: '/dashboard', text: 'Borrower dashboard' },
  },
  {
    title: 'Check in',
    what: 'At pickup, staff record the condition and add photos. The borrower can add their own photos too, so an existing scratch is not blamed on them. Pickup is blocked until the deposit is paid or waived.',
    who: 'dev.manager' + D + ' and asha.student' + D,
    link: { to: '/staff', text: 'Check-ins due' },
  },
  {
    title: 'Return',
    what: 'Staff record the return condition and photos. Overdue bookings get a delay incident automatically.',
    who: 'dev.manager' + D,
    link: { to: '/staff', text: 'Staff dashboard' },
  },
  {
    title: 'Get the deposit back',
    what: 'If the item came back as it left and no incident is open, staff refund it. Forfeit needs a resolved damage incident. The suggestion is advice only: a person decides.',
    who: 'dev.manager' + D,
    link: { to: '/staff?view=settle', text: 'Deposits to resolve' },
  },
  {
    title: 'Read the full history',
    what: 'Every booking page has a timeline: who did what, when, and why. Admins see the platform-wide audit log.',
    who: 'asha.student' + D + ', then admin' + D,
    link: { to: '/bookings', text: 'My bookings' },
  },
  {
    title: 'Dashboards',
    what: 'Each role has a dashboard: borrowers see what is missing and what to pay; staff see what waits for a decision; owners edit listings; admins verify organisations and suspend accounts.',
    who: 'meera.creator' + D + ', kabir.founder' + D + ' (team), lata.owner' + D + ', tara.studiomanager' + D + ', arun.labmanager' + D + ', admin' + D,
    link: { to: '/signin', text: 'Switch account' },
  },
];

export function TourPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Judge’s tour"
        intro="The whole booking journey in ten steps. Use the “Sign in as” panel on the sign-in page to switch between the demo accounts below."
      />
      <div className="mb-6">
        <Alert tone="info" title="All demo people and organisations are fictional">
          The seeded data includes a booking in every status, one with a damage incident, one overdue, and a deposit in each state.
        </Alert>
      </div>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card flex gap-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h2>
              <p className="text-slate-800">{s.what}</p>
              <p className="mt-1 break-words text-sm text-slate-700">
                <span className="font-semibold">Sign in as:</span> {s.who}
              </p>
              <p className="mt-2">
                <Link to={s.link.to} className="font-semibold">
                  {s.link.text} →
                </Link>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
