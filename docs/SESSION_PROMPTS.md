# Session prompts

Three Claude Code sessions run in parallel, each in its own git worktree. You (the integrator) merge.

## One-time setup (about 10 minutes)

```bash
mkdir spareslot && cd spareslot          # unzip the contract files here
git init -b main
git add -A && git commit -m "Add build contract: schema, spec, session rules"
git worktree add ../spareslot-backend  -b backend
git worktree add ../spareslot-frontend -b frontend
git worktree add ../spareslot-infra    -b infra
```

Open Claude Code in each of the three new folders and paste the matching prompt below. Keep this folder
(`spareslot`, on `main`) for yourself: it is where you merge and run the whole app.

## Merging (every 2 to 3 hours, and at the end of each slice)

```bash
cd spareslot
git merge --no-ff backend && git merge --no-ff frontend && git merge --no-ff infra
# run the app, click the journey, fix or send feedback, then in each worktree:
git -C ../spareslot-backend  merge main
git -C ../spareslot-frontend merge main
git -C ../spareslot-infra    merge main
```

Never let a branch run a whole day without merging. If two sessions touched the same file, the ownership
table in `CLAUDE.md` was broken: tell the session that crossed the line.

---

## Backend session

```
You are the backend session for SpareSlot, working in this git worktree on branch "backend".
First read CLAUDE.md, docs/SPEC.md and the migrations V1__core_schema.sql, V2__photos.sql and
V3__security_deposit.sql in backend/src/main/resources/db/migration/ completely.
You own backend/ (including its tests) and migrations V10 to V19. Do not edit other folders.
Photos (SPEC section 4a) and the security deposit (section 4b) are not part of S1; they arrive in S2 and S4.
Only the deposit amount field on the resource form (resources.deposit_minor) is part of S1.

Build slice S1 in this order, committing after each step:
1. Maven project (Java 21, Spring Boot 3: Web, Validation, Data JPA, Security, OAuth2 resource server, Flyway,
   PostgreSQL driver, springdoc-openapi, Testcontainers). Add the Maven wrapper. Flyway runs V1 to V3 on start.
2. A Testcontainers integration test that applies the migrations and executes
   src/test/resources/schema_rules_test.sql. It must pass.
3. Auth as in SPEC section 5: register, login (BCrypt, JWT with sub, role, org), GET /api/me, method security.
4. Resources: list and search (public), detail, create and edit (owner of that organisation only).
5. Bookings: POST /api/bookings (create as 'requested' for now; the section 4 checks come in S2 and S3),
   GET lists, GET detail with allowedActions computed from booking_transitions.
6. BookingService.transition(...) exactly as SPEC section 3: role and organisation check, new reason,
   audit_events row, notification, one transaction. Expose the decision and cancel endpoints on it now. Check-in
   and return come in S4: they must insert the condition record first and respect the deposit rules (section 4b).
7. GET /api/bookings/{id}/events (the audit timeline).
8. Table-driven security tests: for every protected endpoint, the wrong role gets 403 and another
   organisation's staff get 404.

Done when: a manager approves a request through the API and the events endpoint shows who did it and why.
Run ./mvnw verify before saying anything is done. Add a line to docs/AI_USE.md only through the integrator:
list what you generated in your final message. Stop after S1 and report; do not start S2 until told.
```

## Frontend session

```
You are the frontend session for SpareSlot, working in this git worktree on branch "frontend".
First read CLAUDE.md and docs/SPEC.md (especially sections 2, 3 and 6). You own frontend/ only.
The backend is being built in parallel and is not ready: code against the API in SPEC section 6 and use a mock
layer (static JSON behind the same client functions, switched by VITE_USE_MOCKS=true) until the backend is merged.
Photo upload (SPEC section 4a) and the security deposit panel (section 4b) are not part of S1; they arrive in S2
and S4. In S1 the owner's resource form only gets a deposit amount field.

Build slice S1:
1. Vite, React, TypeScript, Tailwind, TanStack Query, React Router. A typed API client for SPEC section 6.
2. Sign-in and register pages; token kept in memory plus sessionStorage; role-aware navigation.
3. Resource list with category filter and search, and a detail page showing conditions of use and eligibility rules.
4. Request form (window, purpose). Rule failures (HTTP 422 with {code, message, rule}) show the rule and what to do.
5. My bookings with a timeline built from GET /api/bookings/{id}/events: who, what, when, and the reason.
6. Manager and owner queue: approve, reject and waitlist dialogs that cannot be submitted without a reason.
7. Buttons come only from the server's allowedActions. Do not reimplement the state machine in the browser.
8. Plain, accessible, readable UI: labels on every field, visible focus, sufficient contrast, status never shown
   by colour alone, works at phone width.

Done when: signed in as a manager (mock or real), you can approve a request with a reason and see it on the timeline.
Stop after S1 and report; do not start S2 until told.
```

## Infra and tests session

```
You are the infra and tests session for SpareSlot, working in this git worktree on branch "infra".
First read CLAUDE.md, docs/SPEC.md and the V1, V2 and V3 migrations. You own deploy/, e2e/, seed migrations V90 and above,
and README.md. Do not edit backend/src or frontend/ except for the seed migration file.

Build, in this order:
1. Seed migration V90__demo_seed.sql with fictional data: 3 verified organisations (a college lab, a makerspace,
   a small studio), about 12 resources (equipment and spaces) with conditions, weekly caps and eligibility
   requirements, and 6 demo users: a user from each borrower type (student, researcher, creator,
   startup_team), one manager, one owner, one admin. Generate real BCrypt hashes (strength 10) for one shared demo
   password. Add a few bookings covering every status, one with a damage incident, one overdue.
   Seed bookings must still respect the overlap rule. Also seed three small placeholder images (plain coloured
   rectangles with a label, generated in code, never copied from anywhere) as photo_blobs and resource_photos for
   three resources, and a borrower photo plus a staff photo on the booking that has the damage incident.
   Give two or three resources a deposit (for example 50000 paise, shown as 500 rupees) and seed bookings in each
   deposit state: pending, paid, refunded, forfeited (with its resolved damage incident) and waived, each with its
   deposit_transactions rows. Seed rows must satisfy the V3 rules, so insert in the real order: booking, approval
   with the pending snapshot, condition records, ledger rows, then status changes.
2. deploy/Dockerfile for the backend and for the frontend (static build behind a small web server) and
   deploy/docker-compose.yml with PostgreSQL 16. Configuration only through environment variables.
3. Ask the integrator which host to deploy to (Render, Railway or Fly) before choosing; then write the deploy steps
   in README.md. Keep the free tier from sleeping during judging (an uptime ping is acceptable).
4. e2e/golden_path script (Playwright or plain HTTP) that runs the journey against a base URL: sign in, request,
   manager approves, borrower pays the demo deposit, check-in, return with condition, deposit refunded, see the
   timeline. It must run against the deployed app.
5. README.md: what it is, how to run it, demo logins, and a one-page guided walkthrough for a judge.

Done when: docker compose up gives a working app with seeded data and the golden path script passes against it.
Stop after step 5 and report.
```
