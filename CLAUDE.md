# SpareSlot

A trusted resource-sharing platform for a 48-hour hackathon: owner organisations list equipment and spaces,
and students, researchers, creators and early-stage teams borrow them within fair-use limits.
Read `docs/SPEC.md` and the migrations `V1__core_schema.sql`, `V2__photos.sql` and `V3__security_deposit.sql` in
`backend/src/main/resources/db/migration/` before writing code.

## Stack

Java 21, Spring Boot 3 (Web, Validation, Data JPA, Security with JWT), Maven, PostgreSQL 16, Flyway.
Frontend in `frontend/`: React, Vite, TypeScript, Tailwind, TanStack Query.
Tests: JUnit 5 and Testcontainers (PostgreSQL). Deploy with Docker.

## Who owns which folder

One session works in one worktree and edits only its own folders. If you need a change elsewhere, say so in your
final message instead of making it.

| Session | Owns |
|---|---|
| backend | `backend/` including its own tests, migrations V10 to V19 |
| frontend | `frontend/` |
| infra and tests | `deploy/`, `e2e/` (golden-path tests against the deployed app), seed migrations V90 and above, `README.md` |
| contract (integrator only) | `docs/`, `CLAUDE.md`, migrations V1 to V9, `backend/src/test/resources/schema_rules_test.sql` |

Never edit an existing migration. Add a new one in your own number range.

## Rules that must hold

1. Only `BookingService.transition(...)` changes `bookings.status`. Controllers and repositories never set it.
2. Every transition checks the actor's role and organisation, requires a new reason where `booking_transitions`
   says so, writes one `audit_events` row and one notification, in the same transaction.
3. The actor id and role always come from the JWT, never from the request body.
4. Rule failures at request time return 422 with `{code, message, rule}` and create no booking.
5. A person decides every approval, rejection, dispute, deposit forfeit and deposit refund after a return. The
   system may only waitlist, promote from the waitlist, raise overdue incidents, and refund a deposit when a
   booking is cancelled before pickup, and each of those writes a reason.
6. The frontend reads `allowedActions` from the server and never reimplements the state machine.
7. `audit_events` is append-only. Do not write code that updates or deletes it.
8. Fictional data only. No real people, institutions or credentials anywhere, including tests and screenshots.
9. No secrets in the repo. Configuration comes from environment variables (`JWT_SECRET`, `DATABASE_URL`).
10. Keep the cut order in mind: AI features, listing photos, extensions, search polish go first. The audit log,
    decision reasons and return flow never do.
11. Photos (SPEC section 4a): check the real image type from the file's bytes, enforce 5 MB, re-encode to strip
    EXIF (GPS), and serve booking photos only after the same visibility check as the booking. Booking photos
    are never edited or deleted. Do not build photos in S1.
12. Security deposit (SPEC section 4b): money moves only through `DepositService`, which writes
    `deposit_transactions` and never `bookings.deposit_status` (the database refuses that). The borrower pays
    after approval and before pickup; a refund is allowed only if the item was never taken or came back in its
    original condition; a forfeit needs a resolved damage incident. Every payment screen is labelled as a demo.
    Store no card, UPI or bank details. Do not build the payment flow in S1.

## Working agreement

- Run the tests before you say a task is done: `cd backend && ./mvnw verify`.
- The schema rule tests are in `backend/src/test/resources/schema_rules_test.sql`; keep them passing.
- Commit small and often with honest messages. The hackathon checks commit history, so do not squash away the
  real history or backdate anything.
- Significant AI use must be disclosed in the submission. At the end of every task, list in your final message
  what you generated and which files; the integrator records it in `docs/AI_USE.md`.
- When unsure about a product decision, ask the integrator instead of guessing.

## Commands

```
cd backend && ./mvnw spring-boot:run        # API on :8080 (needs DATABASE_URL, JWT_SECRET)
cd backend && ./mvnw verify                 # unit and integration tests
cd frontend && npm install && npm run dev   # UI on :5173
docker compose -f deploy/docker-compose.yml up --build
```

(The backend session creates the Maven project and wrapper, the frontend session creates the Vite scaffold,
and the infra session writes the compose file once both exist.)
