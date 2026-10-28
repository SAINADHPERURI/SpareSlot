# SpareSlot

A trusted resource-sharing platform for the hackathon problem "Unlock Underused Equipment and Spaces".

Verified owner organisations (a college lab, a makerspace, a small studio) list idle equipment and spaces.
Students from any college, researchers, independent creators and early-stage teams discover them, prove they are
eligible, request time, borrow them for free within fair-use limits, and return them. Every step of a booking has
a role, a reason and an audit record, and a person makes every approval, rejection, dispute, forfeit and
post-return refund.

All demo data is fictional. No real people, institutions or credentials appear anywhere.

## Run it (one command)

Needs Docker.

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Then open **http://localhost:3000**. The API and its OpenAPI docs are at http://localhost:8080/api/docs.
If those ports are taken, set `WEB_PORT` and `BACKEND_PORT`.

The stack is PostgreSQL 16, the Spring Boot API and the React app behind nginx. Flyway applies the schema and the
fictional demo seed on first start. To start again from fresh demo data:
`docker compose -f deploy/docker-compose.yml down -v`.

Configuration comes only from environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | JDBC URL or `postgres://user:pass@host:port/db` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | when the URL has no credentials |
| `JWT_SECRET` | at least 32 characters; required in production |
| `ALLOW_GENERATED_JWT_SECRET` | `true` only for a local demo: a missing secret is replaced by a random one per run |
| `CORS_ORIGINS` | the frontend origin(s), comma-separated |
| `DEMO_LOGIN_ENABLED` | `true` shows the "Sign in as" panel for the seeded demo accounts |
| `SEED_LOCATION` | set to an empty value to start without demo data |
| `JOBS_ENABLED` | the overdue and reminder job (default `true`) |

### Develop

```bash
cd backend && ./mvnw spring-boot:run      # needs DATABASE_URL, JWT_SECRET (and DATABASE_USERNAME/PASSWORD)
cd frontend && npm install && npm run dev # http://localhost:5173, proxies /api to :8080
cd backend && ./mvnw verify               # all tests (needs Docker for Testcontainers)
BASE_URL=http://localhost:3000 node e2e/golden_path.mjs   # golden path against a running app
```

## Demo accounts

On the sign-in page, the **Sign in as** panel lists every demo account. No password is needed while
`DEMO_LOGIN_ENABLED=true`. The shared demo password is set in the seed migration and is not printed here.

| Account | Role | Use it for |
|---|---|---|
| Nisha Pillai | borrower (student), no credentials yet | the full journey from scratch |
| Asha Verma | borrower (student) | an active booking, a waitlist position |
| Meera Das | borrower (creator) | a deposit to pay, a held deposit with an open damage incident |
| Kabir Shah | borrower (startup team) | an overdue return, a forfeited deposit, a shared team quota |
| Dev Iyer | manager, Brickyard Makerspace | deciding requests, verifications, pickup and return |
| Lata Joshi | owner, Brickyard Makerspace | editing listings and listing photos |
| Tara Bose | manager, Monsoon Sound Studio | the damage incident and deposit decision |
| Arun Nair | manager, Lotus Hill College Electronics Lab | a deposit to refund, an extension request |
| Alex Admin | platform admin | verifying an organisation, suspending users, the audit log |

## A judge's walkthrough (about ten minutes)

The app also has this tour built in: **Judge's tour** in the header.

1. **Discover.** Without signing in, open Discover. Search, filter by category or organisation, and open
   *Laser cutter (60 W)*. Conditions of use, required credentials, caps, deposit, photos and booked windows are all
   shown before you request anything.
2. **Get blocked, then verified.** Sign in as **Nisha**. The laser cutter says you are missing a *Safety induction*.
   Follow the link and file a verification request for Brickyard Makerspace.
3. **A person verifies.** Sign in as **Dev**, open *Verifications*, and verify Nisha's request with a reason.
   As Nisha, the laser cutter now says you are eligible, and Discover's *Eligible for me* filter includes it.
4. **Request.** As **Nisha**, request the *Cordless drill and driver set* (a ₹300 refundable deposit). Try a window
   longer than 4 hours first: it is refused with HTTP 422, the rule is named, and nothing is booked.
5. **Approve.** As **Dev**, approve it from the request queue. The reason cannot be left empty.
6. **Pay the deposit.** As **Nisha**, pay on the booking page. Every payment screen says *Demo payment: no real
   money moves*. Until you pay, check-in is blocked and the page says why.
7. **Check in.** As **Dev**, check it in with a condition rating, and add photos. Nisha can add her own pickup photos
   too, so an existing scratch is not blamed on her.
8. **Return.** As **Dev**, record the return condition.
9. **Get the deposit back.** As **Dev**, refund it. The advice says *refund* because the item came back as it left,
   but a person decides. Then close the booking.
10. **Read the history.** As **Nisha**, open the booking: the timeline shows who did what, when and why, and every
    step sent a notification (the bell polls every 30 seconds).

Also worth a look in the seeded data:

- **Waitlist:** the *Portable LED light set* queue. As Asha or Zoya, the booking shows the reason saved when you
  asked, your position now, and how the queue is ordered (fewest hours in the last 30 days, then the earliest
  request). A request still waitlisted after 24 hours, or past its start time, is closed by the system with a
  reason, and the borrower can request again: the older *Workbench space* queue shows this.
- **Overdue:** Kabir's soldering station. The system raised a delay incident on its own and notified both sides.
- **Damage and deposit:** as **Tara**, Meera's camera kit booking. The check-in and return photos sit side by side.
  The refund and forfeit both wait while the damage incident is open. Kabir's earlier camera booking shows a
  forfeit after a resolved damage incident.
- **Admin:** as **Alex Admin**, verify *Kestrel Street Community Workshop*; its listing then becomes visible. You can
  also reinstate the suspended account and filter the platform-wide audit log.

## How the rules are enforced

The database enforces the core rules, and the application never works around them. See `docs/SPEC.md` and the
migrations in `backend/src/main/resources/db/migration/`:

- Bookings move only along the edges in `booking_transitions`, a decision needs a new reason, and live bookings
  never overlap.
- `audit_events` and the deposit ledger are append-only. Condition photos can never be edited or deleted.
- A refund is refused unless the item was never taken or came back in its original condition. A forfeit is refused
  unless a damage incident is resolved, and a booking cannot close while money is held.

In the application:

- `BookingService.transition` is the only code that changes a booking's status. It checks the role and the
  organisation, and writes one audit event and one notification in the same transaction.
- `DepositService` is the only writer of the deposit ledger, through a `PaymentProvider` (demo only).
- The actor always comes from the JWT. A wrong role gets 403; another organisation's data gets 404.
- `allowedActions` and `blockedActions` come from the server, so the UI never reimplements the state machine.
- Photos: the type is checked from the file's bytes, the limit is 5 MB, and every image is re-encoded to at most
  1600 px, which removes EXIF and GPS data. Condition photos are served privately.

## Tests

- `./mvnw verify` runs 119 tests against PostgreSQL 16 in Testcontainers:
  - the contract's schema rule checks
  - the full journey
  - the request rules in order, eligibility, quota, waitlist and promotion
  - the deposit and photo rules
  - auth and the overdue job
  - the demo seed
  - a 44-row security table: anonymous 401, wrong role 403, other organisation 404, and refused calls change nothing
- `e2e/golden_path.mjs` runs the journey against a running or deployed app.

## Deploying

The two images in `deploy/` run on any container host with a managed PostgreSQL 16. Set the environment
variables above:

- On the web container, set `BACKEND_ORIGIN` to the API's URL.
- On the API, set `CORS_ORIGINS` to the web app's URL.

The host has not been chosen yet. Once it is, its steps go here, including how to keep a free tier awake during
judging.

## Repository

| Folder | Contents |
|---|---|
| `backend/` | Spring Boot 3 API (Java 21), Flyway migrations, tests |
| `frontend/` | React, Vite, TypeScript, Tailwind, TanStack Query |
| `deploy/` | Dockerfiles, nginx config, docker-compose |
| `e2e/` | golden path script |
| `docs/` | the build contract (`SPEC.md`) and the AI-use log |
