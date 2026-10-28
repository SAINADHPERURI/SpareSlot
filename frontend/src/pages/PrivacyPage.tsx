import { PageHeader, Section } from '../components/ui';

const WHO_SEES: [string, string, string, string, string][] = [
  ['Listings, listing photos, organisation profiles', 'Everyone', 'Everyone', 'Everyone', 'Everyone'],
  ['Your profile and credentials list', 'You', 'No', 'No', 'Name and status only'],
  ['Verification evidence you write', 'You', 'Reviewers only (managers and owners)', 'Reviewers only', 'No'],
  ['A booking and its history', 'Your own', 'Their organisation’s bookings', 'Their organisation’s bookings', 'All, read-only'],
  ['Condition photos', 'Your own bookings', 'Their organisation’s bookings', 'Their organisation’s bookings', 'No'],
  ['Deposit and its ledger', 'Your own bookings', 'Their organisation’s bookings', 'Their organisation’s bookings', 'No'],
  ['Platform-wide audit log', 'No', 'No', 'No', 'Yes'],
];

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Privacy and security" intro="What SpareSlot collects, who can see it, and how it is protected." />
      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name, email and a password hash (BCrypt). We never store your password itself.</li>
          <li>For borrowers: borrower type, affiliation, team, and the evidence you write in verification requests.</li>
          <li>Bookings: times, purpose, every decision with its reason, condition records and photos.</li>
          <li>Deposits: amount, status and a ledger with a provider name and reference. No card, UPI or bank details, ever.</li>
          <li>In-app notifications. We send no email and use no tracking or advertising.</li>
        </ul>
      </Section>
      <Section title="Who can see what">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Visibility of data by role</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th scope="col" className="py-2 pr-3">Data</th>
                <th scope="col" className="py-2 pr-3">Borrower</th>
                <th scope="col" className="py-2 pr-3">Manager</th>
                <th scope="col" className="py-2 pr-3">Owner</th>
                <th scope="col" className="py-2">Admin</th>
              </tr>
            </thead>
            <tbody>
              {WHO_SEES.map(([what, ...cells]) => (
                <tr key={what} className="border-b border-slate-100 align-top">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {what}
                  </th>
                  {cells.map((c, i) => (
                    <td key={i} className="py-2 pr-3">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Staff of another organisation cannot tell whether your booking exists: they get “not found”, not “forbidden”.
        </p>
      </Section>
      <Section title="Photos">
        <ul className="list-disc space-y-1 pl-5">
          <li>We accept JPEG, PNG and WebP up to 5 MB, and check the real file type from its contents, not its name.</li>
          <li>Every photo is decoded and re-encoded at no more than 1600 pixels. This removes EXIF data, including the GPS location where it was taken.</li>
          <li>Condition photos are evidence: they can never be edited or deleted, and only the borrower and that organisation’s staff can see them.</li>
          <li>Owners can remove their own listing photos.</li>
        </ul>
      </Section>
      <Section title="Decisions and the audit log">
        <p>
          A person decides every approval, rejection, dispute, deposit forfeit and deposit refund after a return. The system only
          waitlists requests, promotes from the waitlist, raises overdue incidents and refunds a deposit when a booking is cancelled
          before pickup, and each of those writes a reason. Every step is recorded in an append-only audit log that the database itself
          refuses to change.
        </p>
      </Section>
      <Section title="Payments">
        <p>
          Deposits use a demo payment provider. <strong>Demo payment: no real money moves.</strong> We never ask for or store card, UPI
          or bank details.
        </p>
      </Section>
      <Section title="Demo data">
        <p>All people, organisations and bookings in this demo are fictional. Any resemblance to real people or institutions is accidental.</p>
      </Section>
    </div>
  );
}
