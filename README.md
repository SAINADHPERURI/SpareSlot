# SpareSlot

**A trusted resource-sharing platform: unlock underused equipment and spaces.**

Verified owner organisations (a college lab, a makerspace, a small studio) list idle equipment and spaces.
Students from any college, researchers, independent creators and early-stage startup teams discover them, prove
they are eligible, request time, borrow for free within fair-use limits, and return them.

Every step of a booking has a **role**, a **reason** and an **audit record**. A **person** decides every approval,
rejection, dispute, deposit forfeit and post-return refund; the system only does a short list of bookkeeping jobs.

| | |
|---|---|
| **Live demo** | https://spareslot-sainadh.onrender.com (open **Judge's tour** in the header; use **Sign in as** on the sign-in page) |
| **API** | https://spareslot-sainadh-api.onrender.com (OpenAPI docs at `/api/docs`) |
| **Stack** | Java 21 · Spring Boot 3.5 · PostgreSQL 16 · Flyway · React 18 · TypeScript · Tailwind · TanStack Query · Docker |
| **Tests** | 120 backend integration tests (incl. 88 SQL rule checks) · 31 Playwright browser tests · API golden path |

> All demo data is fictional. No real people, institutions or credentials appear anywhere. Payments are a demo:
> no real money moves, and no card, UPI or bank details are collected or stored.

---

## Contents

1. [The problem and our approach](#1-the-problem-and-our-approach)
2. [Features at a glance](#2-features-at-a-glance)
3. [Roles and their dashboards](#3-roles-and-their-dashboards)
4. [Screenshots](#4-screenshots)
5. [Architecture (UML diagrams)](#5-architecture)
6. [Technical approach and why we chose it](#6-technical-approach-and-why-we-chose-it)
7. [The database: tables, rules, triggers, views](#7-the-database)
8. [The audit trail in detail](#8-the-audit-trail-in-detail)
9. [The booking lifecycle](#9-the-booking-lifecycle)
10. [Fair use, eligibility and the waitlist](#10-fair-use-eligibility-and-the-waitlist)
11. [Security deposit](#11-security-deposit)
12. [Photos and privacy](#12-photos-and-privacy)
13. [Security model](#13-security-model)
14. [API reference](#14-api-reference)
15. [Frontend design](#15-frontend-design)
16. [Testing](#16-testing)
17. [Running it locally](#17-running-it-locally)
18. [Deployment (Render)](#18-deployment-render)
19. [Demo accounts and a judge's walkthrough](#19-demo-accounts-and-a-judges-walkthrough)
20. [Repository layout](#20-repository-layout)
21. [Known limitations and next steps](#21-known-limitations-and-next-steps)
22. [AI use and third-party licences](#22-ai-use-and-third-party-licences)

---

## 1. The problem and our approach

**The problem.** Colleges, makerspaces and studios own equipment and rooms that sit idle most of the week, while
students, researchers, independent creators and young startups cannot afford to buy or rent them privately. Owners
hesitate to lend because they cannot see who is borrowing, whether they are qualified, what happens when something
breaks, or who decided what.

**Our answer: trust through accountability.** Instead of a marketplace, SpareSlot is a single, accountable booking
journey:

1. **Discover**: public listings show every rule *before* you ask (conditions, required credentials, caps, deposit,
   booked windows, photos).
2. **Prove eligibility**: borrowers file verification requests; staff verify or reject them with a written reason.
3. **Request**: fair-use rules are checked in a fixed order; a failure explains which rule blocked it and what to do.
4. **Decide**: a person approves, rejects or waitlists, always with a reason the borrower can read.
5. **Deposit**: a refundable deposit (demo provider), paid after approval and before pickup.
6. **Check in / return**: both sides record the item's condition and photos, so pre-existing damage is never blamed
   on the borrower.
7. **Settle**: a person refunds or (only after a resolved damage incident) forfeits the deposit.
8. **History**: every step is in an append-only audit log, visible to both parties and the admin.

**How we approached the build.**

- **Contract first.** Before any code, the rules were written into the database itself (migrations V1–V3) and
  proven by 88 SQL checks: the booking state machine, mandatory reasons, no double booking, an append-only audit log,
  photo rules and the deposit ledger. The application can therefore never quietly break a rule; the database refuses.
- **One path for every change.** Exactly one method, `BookingService.transition(...)`, changes a booking's status.
  It checks role and organisation, demands a new reason where needed, writes one audit event and one notification,
  all in one transaction.
- **The server decides what you can do.** The API returns `allowedActions` (and `blockedActions` with a plain-words
  explanation) for each booking; the UI only draws those buttons and never reimplements the rules.
- **Thin vertical slices.** We made the ten-step journey work end to end first, then filled in waitlists, deposits,
  photos, incidents, extensions and dashboards, testing each slice against a real PostgreSQL.
- **Cut order agreed up front.** Advisory AI, listing photos, extensions and search polish could be dropped; the audit
  log, decision reasons and the return flow could not. (Only the optional advisory AI was left out.)

---

## 2. Features at a glance

| Area | What it does |
|---|---|
| Accounts | Register / sign in (BCrypt, stateless JWT), suspended users refused, organisation sign-up (unverified until an admin verifies it) |
| Profiles | Borrower type, affiliation, credentials with status and expiry, team membership (a team shares one quota), weekly usage |
| Listings | Owner form: category, description, location, conditions of use, max hours per booking, weekly cap, deposit (₹), active flag, required credentials, listing photos; every edit is audited field by field |
| Discovery | Public search, category and organisation filters, **Eligible for me** filter, cards with the key rules and "You are eligible / Missing: X" |
| Verification | Credential requests with evidence and optional expiry; reviewed by managers/owners with a reason the user reads |
| Requesting | Checks in order: active & verified org → window → eligibility → ≤ 5 open requests → weekly quota; 422 `{code, message, rule}` and no booking on failure |
| Waitlist | Overlapping requests are waitlisted by the system with their position; ranked by fewest hours in the last 30 days, then earliest; promotion when a slot frees; expiry after 24 h |
| Decisions | Approve / reject / waitlist with a mandatory reason; buttons from `allowedActions` |
| Deposit | Owner-set amount, waiver with reason, demo payment, ledger timeline, refund/forfeit rules enforced in SQL, automatic refund only when cancelled before pickup |
| Pickup & return | Condition records (good / minor wear / damaged + notes) and photos from both sides, side by side |
| Photos | JPEG/PNG/WebP ≤ 5 MB, type from bytes, re-encoded ≤ 1600 px (EXIF/GPS removed), ≤ 6 per side per phase, never edited or deleted, private |
| Incidents | Damage, delay, conflict, pre-existing damage, dispute; open → under review → resolved with a written resolution |
| Extensions | Borrower asks for a later end with a reason; staff decide with a reason; checks conflicts, max length and quota |
| Jobs | Every minute: one delay incident per overdue booking (both sides notified), reminders 1 h before the end, waitlist expiry |
| Notifications | In-app bell, polled every 30 s, each item links to its booking |
| Audit | Every transition, verification, listing edit, photo, extension, incident and deposit event; per-booking timeline; platform-wide filterable log for admins |
| Dashboards | Borrower, staff (manager/owner) and admin dashboards |
| Judge experience | Seeded demo data in every state, a "Sign in as" panel, an in-app guided tour, a privacy & security page |

---

## 3. Roles and their dashboards

There are four roles. The role and the organisation come **only from the signed JWT**, never from a request body.
After sign-in, each role lands on its own home page (`homeFor(role)` in `frontend/src/lib/auth.tsx`), and every page
is wrapped in a `RequireRole` guard; the API enforces the same rules again on every call.

| Role | Who | Lands on | Can do |
|---|---|---|---|
| **User** (borrower) | student, researcher, creator, startup team | `/dashboard` | browse, verify credentials, request, cancel own, pay deposit, add own photos, ask for more time, raise incidents and disputes |
| **Manager** | staff of one organisation | `/staff` | review verifications and requests, check in/out, record condition, incidents, extensions, deposits (waive/refund/forfeit) |
| **Owner** | staff of one organisation | `/staff` | everything a manager can, plus create and edit listings and listing photos |
| **Admin** | platform | `/admin` | verify organisations, suspend/reinstate users, read the platform-wide audit log |

Staff belong to exactly one organisation (`users.org_id`, enforced by a `CHECK`). Staff of another organisation get
**404, not 403**, so the existence of other organisations' data is never leaked.

### How each dashboard is built

Each dashboard is **one API call** that returns everything the screen needs, already scoped to the caller:

| Dashboard | Endpoint | Sections |
|---|---|---|
| Borrower | `GET /api/dashboard/borrower` | *What needs your attention* (deposits to pay, missing credentials and how many listings need them) · *Upcoming & active* · *Requests & waitlist* (with live queue positions) · *Usage* (hours in the last 30 days, open requests vs. the limit of 5) |
| Staff | `GET /api/dashboard/staff` | Count tiles grouped as **Decide** (requests, verifications, extensions) · **Today** (overdue returns, check-ins due in 24 h, checked out now) · **Settle** (deposits to resolve with *advice only* recommendation, open incidents); owners also see *Your resources* |
| Admin | `GET /api/dashboard/admin` + `/api/admin/*` | Tabs: **Organisations** (verify with reason) · **Users** (suspend / reinstate with reason) · **Audit log** (filter by entity, role, action prefix, text; paged) |

```mermaid
flowchart LR
    SignIn["Sign in (password or demo panel)"] --> JWT["JWT: sub, role, org"]
    JWT --> Home{"homeFor(role)"}
    Home -- user --> BD["/dashboard<br/>Borrower dashboard"]
    Home -- manager / owner --> SD["/staff<br/>Staff dashboard"]
    Home -- admin --> AD["/admin<br/>Admin dashboard"]
    BD --> B1["My bookings · Profile · Verify"]
    SD --> S1["Requests queue · Verifications · All bookings"]
    SD -- owner only --> S2["New / edit listing · Listing photos"]
    AD --> A1["Organisations · Users · Audit log"]
```

---

## 4. Screenshots

| | |
|---|---|
| **Discover**: public, rules visible before asking<br>![Discover](docs/screenshots/01-discover.png) | **Eligibility**: a missing credential is named, with a link to verify<br>![Resource](docs/screenshots/02-resource-eligibility.png) |
| **Booking**: summary, *Next step* from `allowedActions`, tabs<br>![Booking](docs/screenshots/03-booking-next-step.png) | **Waitlist**: reason at request time vs. live position<br>![Waitlist](docs/screenshots/07-waitlist.png) |
| **Borrower dashboard**<br>![Borrower dashboard](docs/screenshots/08-borrower-dashboard.png) | **Staff dashboard**: Decide / Today / Settle<br>![Staff dashboard](docs/screenshots/09-staff-dashboard.png) |
| **Admin audit log**: system actions labelled as such<br>![Audit](docs/screenshots/11-admin-audit.png) | **Sign in as** a demo account<br>![Sign in](docs/screenshots/12-signin-demo.png) |

**Condition photos from both sides** (check-in and return; borrower beside staff):

![Photos](docs/screenshots/04-booking-photos.png)

**Deposit panel** (demo payment banner, ledger) and **full history** of a forfeited booking:

| | |
|---|---|
| ![Deposit](docs/screenshots/05-booking-deposit.png) | ![History](docs/screenshots/06-booking-history.png) |

**Verification review** and **phone width**:

| | |
|---|---|
| ![Verifications](docs/screenshots/10-verifications.png) | <img src="docs/screenshots/13-phone-booking.png" alt="Phone" width="300"> |

---

## 5. Architecture

### 5.1 System context and containers

```mermaid
flowchart LR
    subgraph People
        U["Borrower"]
        M["Manager / Owner"]
        A["Admin"]
    end
    subgraph Browser
        SPA["React SPA<br/>(TypeScript, TanStack Query)"]
    end
    subgraph API["Spring Boot API (Java 21)"]
        SEC["Security filter chain<br/>JWT resource server"]
        CTRL["REST controllers"]
        SVC["Services<br/>BookingService · DepositService<br/>PhotoService · ..."]
        JOBS["Scheduled jobs<br/>overdue · reminders · waitlist expiry"]
    end
    DB[("PostgreSQL 16<br/>tables + triggers + views")]
    U & M & A --> SPA
    SPA -- "HTTPS JSON /api/*<br/>Bearer JWT" --> SEC --> CTRL --> SVC
    JOBS --> SVC
    SVC -- "SQL (JdbcClient)" --> DB
    FLY["Flyway migrations<br/>V1–V3 contract · V10–V11 backend · V90–V91 seed"] -. "on start" .-> DB
```

### 5.2 Use cases

```mermaid
flowchart TB
    Borrower(("Borrower"))
    Staff(("Manager / Owner"))
    Admin(("Admin"))
    System(("System jobs"))
    subgraph SpareSlot
        UC1([Discover and filter resources])
        UC2([File a verification request])
        UC3([Request a booking])
        UC4([Pay the demo deposit])
        UC5([Add condition photos])
        UC6([Ask for more time / raise incident or dispute])
        UC7([Review verifications])
        UC8([Approve / reject / waitlist with reason])
        UC9([Check in and record return])
        UC10([Waive / refund / forfeit deposit])
        UC11([Resolve incidents, decide extensions])
        UC12([Create and edit listings])
        UC13([Verify organisations, suspend users])
        UC14([Read audit log])
        UC15([Waitlist, promote, expire waitlist])
        UC16([Raise overdue incidents, remind])
    end
    Borrower --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC14
    Staff --> UC7 & UC8 & UC9 & UC10 & UC11 & UC5 & UC14
    Staff -- owner --> UC12
    Admin --> UC13 & UC14
    System --> UC15 & UC16
```

### 5.3 Backend components (class diagram)

```mermaid
classDiagram
    direction LR
    class BookingController
    class BookingService {
        +request(actor, form) UUID
        +transition(id, target, reason, actor) BookingRow
        +decide(actor, id, action, reason)
        +cancel(actor, id, reason)
        +checkIn(actor, id, condition)
        +returnItem(actor, id, condition)
        +close(actor, id, note)
    }
    class TransitionRules {
        +find(from, to) Rule
        +from(status) List~Rule~
    }
    class BookingRepository {
        +lock(id) BookingRow
        +visible(actor, id) BookingRow
        +liveOverlap(resource, start, end) boolean
        +weeklyHours(resource, subject, at) double
    }
    class BookingViews {
        +detail(actor, id) Detail
        +allowedActions(actor, booking) List
        +events(actor, id) List~Event~
    }
    class WaitlistQueries {
        +position(booking) Position
        +candidates(resource, start, end) List
    }
    class DepositService {
        +pay(actor, id)
        +waive(actor, id, reason)
        +refund(actor, id, reason)
        +forfeit(actor, id, reason)
        +refundOnCancellation(id, reason)
    }
    class PaymentProvider {
        <<interface>>
        +charge(booking, amount, currency) Result
        +refund(booking, amount, currency, ref) Result
    }
    class DemoPaymentProvider
    class EligibilityService
    class AuditService {
        +record(actor, action, entity, id, from, to, reason, details)
    }
    class NotificationService
    class PhotoService
    class ImageSanitizer {
        +sanitize(bytes) Clean
    }
    class OverdueJob
    class WaitlistExpiryJob
    class Actor {
        +userId UUID
        +role String
        +orgId UUID
    }
    BookingController --> BookingService
    BookingController --> BookingViews
    BookingController --> DepositService
    BookingService --> TransitionRules
    BookingService --> BookingRepository
    BookingService --> WaitlistQueries
    BookingService --> EligibilityService
    BookingService --> DepositService
    BookingService --> AuditService
    BookingService --> NotificationService
    DepositService --> PaymentProvider
    DemoPaymentProvider ..|> PaymentProvider
    DepositService --> AuditService
    PhotoService --> ImageSanitizer
    PhotoService --> AuditService
    BookingViews --> TransitionRules
    WaitlistExpiryJob --> BookingService
    OverdueJob --> AuditService
    BookingService ..> Actor : acts as
```

### 5.4 Deployment

```mermaid
flowchart LR
    Judge["Judge's browser"] -- HTTPS --> Static["Render static site<br/>spareslot-sainadh<br/>(Vite build, never sleeps)"]
    Judge -- "HTTPS /api/* (CORS: only the site)" --> Api["Render web service (Docker)<br/>spareslot-sainadh-api<br/>Temurin 21 JRE, 512 MB"]
    Api -- "postgres:// (internal)" --> Pg[("Render PostgreSQL 16<br/>spareslot-db")]
    GH["GitHub Actions<br/>keep-awake (every 10 min)"] -- "/actuator/health" --> Api
    subgraph Local["Local: docker compose"]
        N["nginx (web, :3000)<br/>proxies /api"] --> B["API (:8080)"] --> P[("postgres:16")]
    end
```

---

## 6. Technical approach and why we chose it

| Decision | Choice | Why |
|---|---|---|
| Language / framework | **Java 21 + Spring Boot 3.5** | Mature security (OAuth2 resource server for JWT, method security), validation, scheduling and transactions out of the box; records keep DTOs short |
| Database | **PostgreSQL 16** | Exclusion constraints (`btree_gist`) make double booking impossible; triggers, `jsonb`, views and `tstzrange` let the database enforce the contract |
| Rules in the database | **Triggers, CHECKs, exclusion constraint, append-only triggers** | Defence in depth: even a buggy service or a manual SQL session cannot skip a reason, an illegal transition, the deposit rules or the audit log |
| Data access | **Spring `JdbcClient` with plain SQL** (not JPA entities) | Triggers write columns themselves (`deposit_status`, `decided_at`, `updated_at`); a JPA persistence context would hold stale copies. Plain SQL is explicit, row-locks with `FOR UPDATE`, and maps straight into Java records |
| Migrations | **Flyway**, numbered ranges per owner | V1–V9 contract, V10–V19 backend, V90+ seed; `out-of-order` lets a later backend migration apply after the seed |
| Auth | **Stateless JWT (HS256, 8 h), BCrypt** | No server sessions to share or scale; the token carries `sub`, `role`, `org`; secret only from the environment |
| Authorisation | **`@PreAuthorize` for roles + org scoping in services** | A role alone does not say *which* organisation; services compare the resource's org with the token's org and answer 404 |
| State machine | **Data (`booking_transitions`) not code** | One table drives the DB guard, the service's role check and the UI's `allowedActions`, so they can never disagree |
| Money | **Ledger table + trigger, `PaymentProvider` interface** | The ledger is append-only and the trigger is the only writer of `deposit_status`; a real provider can replace the demo one without touching the rules |
| Photos | **Bytes in PostgreSQL (`bytea`), re-encoded with ImageIO** | Survives redeploys on hosts with ephemeral disks; re-encoding guarantees EXIF/GPS removal; lists never touch the bytes |
| Frontend | **React 18 + TypeScript (strict) + Vite + Tailwind + TanStack Query + React Router** | Fast builds, typed API client mirroring the Java records, caching and 30 s polling with no extra code, consistent accessible styling |
| Notifications | **Rows polled every 30 s** | No websockets or email infrastructure needed for a prototype; reliable and auditable |
| Testing | **Testcontainers + MockMvc, Playwright** | Tests run against the real PostgreSQL with the real triggers; browser tests click the real UI |
| Deployment | **Docker; Render blueprint** | One command locally (`docker compose`); one blueprint in the cloud; the static site never sleeps and the free plan's hours cover the API |

---

## 7. The database

### 7.1 How the tables were created

All tables are created by **Flyway migrations** that run automatically when the API starts
(`backend/src/main/resources/db/migration/` and `db/seed/`). Flyway records each applied file in
`flyway_schema_history`, so every migration runs exactly once, in order, on every environment. Existing migrations
are never edited; changes always come as new files.

| Migration | Owner | What it creates |
|---|---|---|
| `V1__core_schema.sql` | contract | organisations, teams, users, credentials, resources, resource_requirements, bookings, booking_transitions (+ seed rows), booking_extensions, condition_records, incidents, notifications, audit_events; the guard and append-only triggers; the fair-use views |
| `V2__photos.sql` | contract | photo_blobs, resource_photos, booking_photos and their immutability / insert-window triggers |
| `V3__security_deposit.sql` | contract | deposit_transactions (ledger) and its trigger, the extended booking guard (deposit and condition rules), `condition_rank`, `returned_in_original_condition`, `v_deposits_to_resolve` |
| `V10__system_account.sql` | backend | a suspended, password-less "system" user to fill NOT NULL user columns for automatic actions |
| `V11__waitlist_expiry.sql` | backend | lets the `system` role take `waitlisted → cancelled` (24-hour expiry) |
| `V90__demo_seed.sql`, `V91__demo_fresh_waitlist.sql` | seed | fictional demo data written in the real order so every trigger checks it |

The contract was proven before any application code by `backend/src/test/resources/schema_rules_test.sql`:
**88 checks** (e.g. "overlapping approved booking is refused", "audit event cannot be deleted", "no refund while a
dispute is open"), run on every build by `SchemaRulesIT`.

### 7.2 Entity–relationship diagram

```mermaid
erDiagram
    ORGANISATIONS ||--o{ USERS : "employs staff"
    ORGANISATIONS ||--o{ RESOURCES : lists
    TEAMS ||--o{ USERS : "has members"
    USERS ||--o{ CREDENTIALS : files
    ORGANISATIONS ||--o{ CREDENTIALS : "asked to review"
    RESOURCES ||--o{ RESOURCE_REQUIREMENTS : requires
    RESOURCES ||--o{ RESOURCE_PHOTOS : shows
    RESOURCES ||--o{ BOOKINGS : "is booked in"
    USERS ||--o{ BOOKINGS : requests
    TEAMS ||--o{ BOOKINGS : "shares quota"
    BOOKINGS ||--o{ BOOKING_EXTENSIONS : "asks more time"
    BOOKINGS ||--o{ CONDITION_RECORDS : "check_in / return"
    BOOKINGS ||--o{ INCIDENTS : has
    BOOKINGS ||--o{ BOOKING_PHOTOS : evidences
    BOOKINGS ||--o{ DEPOSIT_TRANSACTIONS : "ledger"
    PHOTO_BLOBS ||--o{ RESOURCE_PHOTOS : stores
    PHOTO_BLOBS ||--o{ BOOKING_PHOTOS : stores
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_EVENTS : "acts in"

    ORGANISATIONS {
        uuid id PK
        text name UK
        text kind "college_lab|makerspace|studio|other"
        text location
        boolean verified
        uuid verified_by FK
        timestamptz verified_at
    }
    USERS {
        uuid id PK
        text email UK "lower case"
        text password_hash "BCrypt"
        text role "user|owner|manager|admin"
        text borrower_type "student|researcher|creator|startup_team"
        uuid team_id FK
        uuid org_id FK "staff only"
        text status "active|suspended"
    }
    CREDENTIALS {
        uuid id PK
        uuid user_id FK
        uuid org_id FK
        text kind
        text evidence
        text status "pending|verified|rejected"
        uuid reviewed_by FK
        text review_reason
        timestamptz expires_at
    }
    RESOURCES {
        uuid id PK
        uuid org_id FK
        text category "equipment|space"
        text conditions
        int max_booking_hours
        int weekly_hour_cap
        int deposit_minor "paise"
        boolean active
    }
    BOOKINGS {
        uuid id PK
        uuid resource_id FK
        uuid requester_id FK
        uuid team_id FK
        timestamptz start_at
        timestamptz end_at
        text status
        text decision_reason
        uuid decided_by FK "NULL = system"
        int deposit_minor
        text deposit_status
        timestamptz checked_in_at
        timestamptz returned_at
        timestamptz closed_at
    }
    BOOKING_TRANSITIONS {
        text from_status PK
        text to_status PK
        text_array allowed_roles
        boolean requires_reason
    }
    CONDITION_RECORDS {
        uuid id PK
        uuid booking_id FK
        text phase "check_in|return"
        text rating "good|minor_wear|damaged"
        text notes
        uuid recorded_by FK
    }
    INCIDENTS {
        uuid id PK
        uuid booking_id FK
        text kind "damage|delay|conflict|pre_existing_damage|dispute"
        text status "open|under_review|resolved"
        text resolution
    }
    DEPOSIT_TRANSACTIONS {
        uuid id PK
        uuid booking_id FK
        text kind "charge|refund|forfeit|waive"
        int amount_minor
        text provider "demo|manual|razorpay_test"
        text provider_ref
        uuid actor_id FK
        text reason
    }
    PHOTO_BLOBS {
        uuid id PK
        text content_type "jpeg|png|webp"
        int size_bytes "max 5 MB"
        bytea content
    }
    BOOKING_PHOTOS {
        uuid id PK
        uuid booking_id FK
        text phase "check_in|return|incident"
        text side "borrower|staff"
        uuid blob_id FK
        uuid uploaded_by FK
    }
    AUDIT_EVENTS {
        bigint id PK
        timestamptz at
        uuid actor_id "NULL = system"
        text actor_role
        text action
        text entity_type
        uuid entity_id
        text from_status
        text to_status
        text reason
        jsonb details
    }
```

(`resource_requirements`, `resource_photos`, `booking_extensions`, `teams` and `notifications` are omitted from the
attribute lists for space; see `V1`/`V2`.)

### 7.3 Rules the database enforces itself

| Rule | Mechanism |
|---|---|
| No two live bookings overlap on a resource | `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at,end_at) WITH &&) WHERE status IN ('approved','checked_in')` |
| Bookings move only along allowed edges | `bookings_guard` trigger looks up `booking_transitions`; anything else → `illegal booking transition` |
| Decisions carry a **new** reason | guard refuses a blank reason or the previous decision's reason; `CHECK` on approved/rejected/waitlisted/cancelled rows |
| Check-in needs a check-in condition record and a paid/waived/no deposit | guard (V3) |
| Return needs a return condition record; closing needs a settled deposit | guard (V3) |
| `deposit_status` is changed only by the ledger | guard refuses direct edits; `deposit_transactions_apply` trigger validates and sets it |
| Refund only if never taken or returned in original condition; forfeit only after a resolved damage incident; nothing while a damage/dispute incident is open | `deposit_transactions_apply` + `returned_in_original_condition()` |
| Audit log, deposit ledger, condition photos and blobs are immutable | `BEFORE UPDATE OR DELETE` (and `TRUNCATE`) triggers raise `insufficient_privilege` |
| Staff belong to exactly one organisation; users and admins to none | `CHECK ((role IN ('owner','manager')) = (org_id IS NOT NULL))` |
| Photos only while a booking is approved, checked in or returned; ≤ 5 MB; JPEG/PNG/WebP | insert-guard trigger, `CHECK`s on `photo_blobs` |
| Reviewed credentials / resolved incidents / decided extensions need a reviewer and reason | `CHECK`s |

### 7.4 Views and functions

| Object | Purpose |
|---|---|
| `v_weekly_usage` | committed hours per resource, per quota subject (team or user), per ISO week; drives the weekly cap |
| `v_recent_usage_30d` | hours in the last 30 days per subject; drives the waitlist order |
| `v_deposits_to_resolve` | deposits still held on cancelled/returned bookings with a `recommended_action` (advice only) |
| `condition_rank(rating)` | good < minor_wear < damaged |
| `returned_in_original_condition(booking)` | return no worse than check-in **and** no open damage/dispute incident |

---

## 8. The audit trail in detail

**What is recorded.** One row in `audit_events` per decision or state change, written **in the same transaction**
as the change (so a change without its audit row is impossible):

| Column | Meaning |
|---|---|
| `at` | when (server time) |
| `actor_id`, `actor_role` | who: always taken from the JWT; `NULL` + `system` for automatic actions |
| `action` | what, e.g. `booking.approved`, `credential.verified`, `deposit.refunded`, `photo.added`, `resource.updated`, `incident.resolved`, `extension.approved`, `organisation.verified`, `user.suspended` |
| `entity_type`, `entity_id` | which booking, credential, resource, incident, extension, organisation or user |
| `from_status`, `to_status` | the transition (e.g. `requested → approved`, `paid → refunded`) |
| `reason` | why, exactly as the person wrote it |
| `details` (`jsonb`) | context, e.g. the field-by-field diff of a listing edit, the deposit amount and provider reference, a photo's phase and side |

**Who writes it.** Only `AuditService.record(...)`, annotated `@Transactional(propagation = MANDATORY)` so it can
only run inside the caller's transaction.

**Why it cannot be tampered with.** Triggers refuse `UPDATE`, `DELETE` and `TRUNCATE` on `audit_events` with
`audit_events is append-only` (SQLSTATE 42501). This is tested in `schema_rules_test.sql`. For the same reason the
app has **no "reset demo data" button**: resetting is done by replacing the whole demo database (see §18).

**Who can read it.**

| Reader | Sees |
|---|---|
| The borrower | the timeline of their own bookings (`GET /api/bookings/{id}/events`) |
| Staff | timelines of their organisation's bookings |
| Admin | everything, filterable by entity, actor role, action prefix and text, paged (`GET /api/admin/audit`) |

**Example timeline** (a forfeited deposit, from the demo data):

```
Requested          Kabir Shah (borrower)          Fri 16 Oct 17:26
Approved           Tara Bose (manager)            "Kit is free; portfolio verified by the studio"
Deposit paid       Kabir Shah (borrower)          pending → paid  · DEMO-PAY-5EED0012
Photo added        Tara Bose (manager)            "Handover: all parts present"
Checked in         Tara Bose (manager)            "Condition at pickup: good. Lens and hood intact"
Returned           Tara Bose (manager)            "Condition at return: damaged. Lens hood cracked on one side"
Incident raised    Tara Bose (manager)            damage · open
Incident resolved  Sam Mathew (owner)             "Kabir confirmed the hood was dropped during the shoot ..."
Deposit forfeited  Sam Mathew (owner)             paid → forfeited · "see the resolved damage incident"
Closed             Sam Mathew (owner)             returned → closed
```

Useful SQL for exploring it (see §17 for connecting):

```sql
-- one booking's full history
SELECT at, actor_role, action, from_status, to_status, reason
FROM audit_events WHERE entity_id = '<booking id>' ORDER BY at, id;

-- everything the system did on its own
SELECT at, action, reason FROM audit_events WHERE actor_role = 'system' ORDER BY at DESC;
```

---

## 9. The booking lifecycle

### 9.1 State machine (from `booking_transitions`)

```mermaid
stateDiagram-v2
    [*] --> requested
    requested --> approved: owner/manager, reason
    requested --> rejected: owner/manager, reason
    requested --> waitlisted: owner/manager/system, reason
    requested --> cancelled: requester, reason
    waitlisted --> approved: owner/manager/system (promotion), reason
    waitlisted --> rejected: owner/manager, reason
    waitlisted --> cancelled: requester or system (24 h expiry), reason
    approved --> checked_in: owner/manager + check-in condition + deposit paid/waived/none
    approved --> cancelled: requester/owner/manager, reason
    checked_in --> returned: owner/manager + return condition
    returned --> closed: owner/manager (deposit settled)
    rejected --> [*]
    cancelled --> [*]
    closed --> [*]
```

*Overdue* is not a state: it is derived (`checked_in` and `end_at < now()`).

### 9.2 What `transition(...)` does (sequence)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Manager
    participant UI as React UI
    participant API as BookingController
    participant S as BookingService.transition
    participant DB as PostgreSQL
    Staff->>UI: Approve (reason)
    UI->>API: POST /api/bookings/{id}/decision {action, reason} + JWT
    API->>API: @PreAuthorize(OWNER, MANAGER), Actor from JWT
    API->>S: decide → transition(id, "approved", reason, actor)
    S->>DB: SELECT … FOR UPDATE (lock booking)
    S->>S: role on this booking? same org? (404 / 403)
    S->>S: edge allowed in booking_transitions? new reason?
    S->>DB: UPDATE bookings (status, reason, decided_by, deposit snapshot → pending)
    DB-->>DB: bookings_guard trigger re-checks edge, reason, deposit rules
    S->>DB: INSERT audit_events (actor, role, from, to, reason)
    S->>DB: INSERT notifications (the borrower)
    S-->>API: updated booking
    API->>DB: other open requests for the window → waitlisted by system
    API-->>UI: detail with allowedActions / blockedActions
```

### 9.3 From payment to pickup (sequence)

```mermaid
sequenceDiagram
    autonumber
    actor B as Borrower
    actor M as Manager
    participant D as DepositService
    participant P as DemoPaymentProvider
    participant BS as BookingService
    participant DB as PostgreSQL
    B->>D: POST /deposit/pay
    D->>DB: lock booking, check requester, approved and pending
    D->>P: charge(amount, INR)
    P-->>D: provider "demo", ref DEMO-PAY-xxxx
    D->>DB: INSERT deposit_transactions (charge)
    DB-->>DB: trigger: amount matches, sets deposit_status = paid
    D->>DB: INSERT audit_events (deposit.charged), notification to staff
    M->>BS: POST /check-in {rating, notes}
    BS->>DB: INSERT condition_records (check_in)
    BS->>DB: transition approved → checked_in
    DB-->>DB: guard: condition record exists, deposit paid/waived/none
```

---

## 10. Fair use, eligibility and the waitlist

### 10.1 Request checks (in order, stop at the first failure)

```mermaid
flowchart TD
    Start([POST /api/bookings]) --> C1{Resource active and<br/>organisation verified?}
    C1 -- no --> E1[422 resource_unavailable]
    C1 -- yes --> C2{Window in the future and<br/>≤ max_booking_hours?}
    C2 -- no --> E2[422 window_in_past / window_too_long]
    C2 -- yes --> C3{Verified, unexpired credential<br/>of every required kind?}
    C3 -- no --> E3["422 missing_credential<br/>names it, links to the form"]
    C3 -- yes --> C4{≤ 5 open requests<br/>requested + waitlisted?}
    C4 -- no --> E4[422 too_many_open_requests]
    C4 -- yes --> C5{"Weekly hours (team or user)<br/>+ this request ≤ weekly cap?"}
    C5 -- no --> E5[422 weekly_quota]
    C5 -- yes --> Ins[Insert booking as requested<br/>audit + notify staff]
    Ins --> C6{Overlaps an approved /<br/>checked-in booking?}
    C6 -- yes --> W["System → waitlisted<br/>'Slot taken; you joined the waitlist at number N'"]
    C6 -- no --> R[Stays requested for a person]
```

Every failure returns HTTP 422 with `{code, message, rule}` (plus `details` such as the missing credential kinds),
creates **no** booking, and the UI explains the rule and what to do next.

### 10.2 Waitlist

- **Order:** fewest hours used in the last 30 days first (per quota subject: the team, or the user), then the earliest
  request.
- **Reason vs. position:** the stored reason is a snapshot taken when the request joined; the booking page shows it as
  *"At the time of your request"* and separately *"Your position now: number X of Y"*.
- **Promotion:** when an approved booking is cancelled, the first waitlisted request that fits the freed window is
  approved **by the system** with its ranking as the reason; staff are notified and may cancel it with a reason.
- **Expiry (V11):** a request still waitlisted 24 hours after joining, or whose start time has passed, is closed by
  the system with a reason; the borrower can request again.
- **Only people reject.** The system never rejects.

---

## 11. Security deposit

```mermaid
stateDiagram-v2
    [*] --> none: resource has no deposit
    [*] --> pending: approval copies the resource amount
    pending --> paid: borrower pays (demo provider)
    pending --> waived: staff, with reason
    paid --> refunded: cancelled before pickup (automatic) or returned in original condition (a person)
    paid --> forfeited: after a resolved damage incident (a person), all or nothing
    none --> [*]
    waived --> [*]
    refunded --> [*]
    forfeited --> [*]
```

- `DepositService` is the **only** writer of `deposit_transactions`; it checks the actor, inserts the ledger row,
  writes `deposit.*` audit events and a notification in one transaction. The database trigger sets `deposit_status`.
- Pickup is blocked until the deposit is paid, waived or none; a booking cannot close while money is held.
- While a damage or dispute incident is open, nothing is refunded or forfeited. A borrower who disagrees raises a
  dispute and the decision waits.
- Staff see a **Deposits to resolve** list and, beside each refund/forfeit decision, both condition records, the
  photos from both sides and the recommended action labelled **advice only**.
- Every payment screen says **"Demo payment: no real money moves"**. Only `provider` and `provider_ref` are stored.

---

## 12. Photos and privacy

| Step | What happens |
|---|---|
| Type check | decided from the first bytes (`FF D8 FF` JPEG, `89 PNG`, `RIFF…WEBP`), never from the filename or `Content-Type` |
| Size | ≤ 5 MB, and ≤ 50 megapixels (decompression-bomb guard) |
| Re-encode | decoded and redrawn on a fresh canvas, longest edge ≤ 1600 px, saved again with **no metadata**: EXIF and GPS are gone |
| Limits | ≤ 6 photos per side (borrower / staff) per phase (check-in / return / incident) |
| Immutability | condition photos can never be edited or deleted (DB triggers) |
| Visibility | condition photos only to the borrower and that organisation's staff, served with `Cache-Control: no-store, private` and `X-Content-Type-Options: nosniff`; listing photos are public |
| Audit | every upload writes `photo.added` with the caption as the reason |

The public **Privacy & security** page in the app explains what is collected and who can see what.

---

## 13. Security model

```mermaid
flowchart LR
    Req["HTTP request"] --> F1{"Valid Bearer JWT?<br/>(HS256, JWT_SECRET)"}
    F1 -- "no, protected path" --> R401[401]
    F1 -- yes --> F2{"Account still active?"}
    F2 -- suspended --> R401b[401]
    F2 -- yes --> F3{"@PreAuthorize role?"}
    F3 -- wrong role --> R403[403]
    F3 -- ok --> F4{"Service: same organisation /<br/>own booking?"}
    F4 -- no --> R404["404 (existence not leaked)"]
    F4 -- yes --> OK[Action + audit + notification]
```

- **Passwords:** BCrypt. **Tokens:** HS256, 8 h, claims `sub`, `role`, `org`; secret from `JWT_SECRET` only.
- **Actor from the token, never the body.** Tested: a forged `actorId` in a request body is ignored.
- **Suspension takes effect immediately**, even for tokens issued earlier.
- **CORS** allows only the web app's origin. **No secrets** in the repository; all configuration via environment.
- **Demo sign-in** (`DEMO_LOGIN_ENABLED=true`) works only for the fictional `@demo.spareslot.example` accounts, so no
  demo password appears in the UI or this README.
- **Table-driven security test:** 44 protected endpoints × (anonymous → 401, wrong role → 403, other organisation →
  404), and refused calls must change nothing.

---

## 14. API reference

All paths are under `/api`. Errors are `{code, message, rule?, details?}`. Interactive docs: `/api/docs`.

| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/register-organisation` | anyone | create an account / sign in / sign up an organisation (unverified) |
| `GET /auth/demo-accounts`, `POST /auth/demo-login` | anyone (demo mode) | the "Sign in as" panel |
| `GET, PUT /me`; `POST /me/team`, `/me/team/join`, `/me/team/leave` | signed in | profile, credentials, weekly usage, team |
| `GET /resources?q=&category=&orgId=&eligible=` | anyone | search with the eligible-for-me filter |
| `GET /resources/{id}` | anyone | detail: conditions, requirements, booked windows, photos, my hours |
| `POST /resources`, `PUT /resources/{id}` | owner | create / edit (audited diff) |
| `GET /org/resources` | staff | all of my organisation's resources |
| `GET /organisations`, `/organisations/{id}` | anyone | organisation profiles |
| `POST /credentials`, `GET /credentials/mine` | user | file / list verification requests |
| `GET /credentials?status=`, `POST /credentials/{id}/review` | staff | review queue, verify / reject with reason |
| `POST /bookings` | user | request (section 10 checks) |
| `GET /bookings?mine=&status=&resourceId=&orgId=&overdue=` | signed in | lists, scoped to the caller |
| `GET /bookings/{id}`, `/bookings/{id}/events` | participants, own-org staff, admin | detail with `allowedActions` / `blockedActions` / queue; timeline |
| `POST /bookings/{id}/decision` | staff | approve / reject / waitlist + reason |
| `POST /bookings/{id}/cancel` | requester, staff | cancel + reason (refund and promotion follow) |
| `POST /bookings/{id}/check-in`, `/return`, `/close` | staff | condition records and transitions |
| `GET /bookings/{id}/deposit`; `POST …/deposit/pay`, `/waive`, `/refund`, `/forfeit` | see §11 | deposit and ledger |
| `GET /deposits/to-resolve` | staff | held deposits with advice |
| `POST, GET /bookings/{id}/photos`, `GET /photos/{id}/content` | participants, own-org staff | condition photos |
| `POST /resources/{id}/photos`, `DELETE …/photos/{photoId}`, `GET /resource-photos/{id}/content` | owner / anyone | listing photos |
| `POST /bookings/{id}/extensions`, `GET /extensions`, `POST /extensions/{id}/decision` | requester / staff | more time |
| `POST /incidents`, `GET /incidents`, `POST /incidents/{id}/review`, `/resolve` | participants / staff | incidents and disputes |
| `GET /notifications`, `POST /notifications/{id}/read`, `/read-all` | signed in | the bell |
| `GET /dashboard/borrower`, `/staff`, `/admin` | by role | one call per dashboard |
| `GET /admin/organisations`, `POST …/{id}/verify`, `GET /admin/users`, `POST …/{id}/suspend`, `/reinstate`, `GET /admin/audit` | admin | administration |

---

## 15. Frontend design

```mermaid
flowchart TB
    subgraph src
        API["api/: typed client<br/>types.ts mirrors Java records<br/>client.ts: token, errors, 401 handling"]
        LIB["lib/: auth (session, homeFor), labels (plain words), format (₹, dates)"]
        COMP["components/: ui kit (Tabs, Dialog, chips),<br/>Layout (nav, bell, account menu), booking panels"]
        PAGES["pages/: Discover, Resource, Booking, dashboards,<br/>Verify, Verifications, ResourceForm, Admin, Privacy, Tour"]
    end
    PAGES --> COMP --> API
    PAGES --> LIB
    API -->|"fetch + Bearer"| Backend[(Spring Boot API)]
```

- **The server decides the buttons.** `StatusActions` and `DepositPanel` render only `allowedActions`;
  `blockedActions` are shown as "X is not possible yet: <reason>".
- **Booking page:** a summary card, a *Next step* box, then tabs: Overview · Photos · Deposit · Incidents &
  extensions · History (tab kept in `?tab=` so links can target it).
- **Colour palette:** `#17252A` (ink), `#2B7A78` (brand), `#3AAFA9` (accent, used only for rings, underlines and
  text on dark), `#DEF2F1` (mist), `#FFFFFF`. All text combinations meet WCAG AA contrast.
- **Accessibility:** labels on every field, visible focus rings, accessible tabs (arrow keys), status shown with text
  and icon (never colour alone), `role="alert"` errors, works at 360 px wide.
- **Private photos** are fetched with the token and shown through object URLs (an `<img src>` cannot send a token).
- **Polling:** the notification bell refetches every 30 s with TanStack Query.

---

## 16. Testing

| Suite | Where | What it proves |
|---|---|---|
| Schema rules (88 SQL checks) | `backend/src/test/resources/schema_rules_test.sql` via `SchemaRulesIT` | the database itself refuses illegal transitions, missing reasons, double booking, audit/ledger edits, bad photos and deposit rule breaks |
| Journey | `BookingJourneyIT` | request → approve → pay → check-in → return → refund → close; the timeline's actors come from the token |
| Request rules | `RequestRulesIT` | each check in order, team quota, eligibility with expiry, waitlist ranking, promotion, competitors waitlisted |
| Deposits | `DepositRulesIT` | refund/forfeit rules, open dispute hold, automatic refund on cancellation, to-resolve list |
| Photos | `PhotoRulesIT` | type from bytes, 5 MB, EXIF/GPS removed, 1600 px, 6 per side, private serving |
| Auth and jobs | `AuthAndJobsIT` | registration, suspension, org verification, listing diff audit, demo sign-in, extensions, overdue job, waitlist expiry |
| Security matrix | `SecurityMatrixIT` | 44 endpoints × 401 / 403 / 404, and refused calls change nothing |
| Demo seed | `DemoSeedIT` | the seed applies through every trigger and covers every status and deposit state |
| API golden path | `e2e/golden_path.mjs` | the journey over HTTP against any deployment |
| Browser (Playwright) | `e2e/tests/*.spec.ts` | 31 tests: the ten-step journey clicked by a new user, every role, the demo states, phone-width layouts |

All backend tests run against a **real PostgreSQL 16** started by Testcontainers.

```bash
cd backend && ./mvnw verify                                   # 120 tests (needs Docker)
BASE_URL=http://localhost:3000 node e2e/golden_path.mjs       # API journey
cd e2e && npm install && BASE_URL=http://localhost:3000 npx playwright test
```

---

## 17. Running it locally

Needs Docker.

```bash
docker compose -f deploy/docker-compose.yml up --build
```

- Web app: http://localhost:3000 · API: http://localhost:8080 · API docs: http://localhost:8080/api/docs
- Ports can be changed with `WEB_PORT` and `BACKEND_PORT`.
- Fresh demo data: `docker compose -f deploy/docker-compose.yml down -v` and start again.
- Database shell: `docker compose -f deploy/docker-compose.yml exec db psql -U spareslot -d spareslot`

Development without Docker for the app itself:

```bash
cd backend && ./mvnw spring-boot:run       # needs DATABASE_URL, DATABASE_USERNAME/PASSWORD, JWT_SECRET
cd frontend && npm install && npm run dev  # http://localhost:5173, proxies /api to :8080
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | JDBC URL or `postgres://user:pass@host:port/db` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | when the URL has no credentials |
| `JWT_SECRET` | ≥ 32 characters; required outside local demo |
| `ALLOW_GENERATED_JWT_SECRET` | `true` only locally: a missing secret becomes a random one per run |
| `CORS_ORIGINS` | the web app origin(s), comma-separated |
| `DEMO_LOGIN_ENABLED` | `true` shows the "Sign in as" panel for the fictional demo accounts |
| `SEED_LOCATION` | empty to start without demo data |
| `JOBS_ENABLED` | overdue, reminder and waitlist-expiry jobs (default `true`) |
| `VITE_API_BASE` (frontend build) | the API's address when the web app is hosted separately |

---

## 18. Deployment (Render)

`render.yaml` is a Render Blueprint: **New > Blueprint**, pick this repository, **Apply**.

| Service | Type | Notes |
|---|---|---|
| `spareslot-db` | PostgreSQL 16 (free) | expires 30 days after creation on the free plan |
| `spareslot-sainadh-api` | Docker web service (free) | built from `deploy/backend.Dockerfile`; `JWT_SECRET` generated by Render; health check `/actuator/health`; JVM sized for 512 MB |
| `spareslot-sainadh` | static site (free) | Vite build with `VITE_API_BASE`; never sleeps, uses no instance hours |

`.github/workflows/keep-awake.yml` pings the API every 10 minutes (repository variable `SPARESLOT_API_URL`), so the
free API does not sleep during judging. Disable it afterwards.

**Fresh demo data before judging.** Demo dates are relative to the first start. Because the audit log is
append-only, the app cannot wipe it; instead, replace the demo database: in Render, delete `spareslot-db`
(Settings > Delete Database), open **Blueprints** and click **Manual Sync** to recreate it, then **Manual Deploy**
the API. Flyway recreates the schema and the fictional seed on start. Check with
`BASE_URL=https://spareslot-sainadh-api.onrender.com node e2e/golden_path.mjs`.

---

## 19. Demo accounts and a judge's walkthrough

Use the **Sign in as** panel on the sign-in page (no password needed in demo mode).

| Account | Role | Use it for |
|---|---|---|
| Nisha Pillai | borrower (student), no credentials yet | the full journey from scratch |
| Asha Verma | borrower (student) | an active booking, a waitlist position |
| Meera Das | borrower (creator) | a deposit to pay; a held deposit with an open damage incident |
| Kabir Shah | borrower (startup team) | an overdue return, a forfeited deposit, a shared team quota |
| Dev Iyer | manager, Brickyard Makerspace | requests, verifications, pickup and return |
| Lata Joshi | owner, Brickyard Makerspace | editing listings and listing photos |
| Tara Bose | manager, Monsoon Sound Studio | the damage incident and deposit decision |
| Arun Nair | manager, Lotus Hill College Electronics Lab | a deposit to refund, an extension request |
| Alex Admin | platform admin | verifying an organisation, suspending users, the audit log |

**The ten steps (about ten minutes):**

1. **Discover**: without signing in, open *Laser cutter (60 W)*; all rules are shown before asking.
2. **Blocked**: as **Nisha**, the laser cutter says *Safety induction* is missing; follow the link and file a request
   for Brickyard Makerspace.
3. **Verified**: as **Dev**, open *Verifications* and verify it with a reason; Nisha is now eligible.
4. **Request**: as **Nisha**, request the *Cordless drill and driver set* (₹300 deposit). Try more than 4 hours first:
   refused with the rule named, nothing booked.
5. **Approve**: as **Dev**, approve from *Requests*; the reason cannot be empty.
6. **Pay**: as **Nisha**, pay in the Deposit tab (*Demo payment: no real money moves*). Until then pickup is blocked
   and the page says why.
7. **Check in**: as **Dev**, check it in with a condition rating and photos; Nisha can add her own pickup photos.
8. **Return**: as **Dev**, record the return condition.
9. **Deposit back**: as **Dev**, refund it (advice says *refund*, a person decides), then close the booking.
10. **History**: as **Nisha**, open the History tab: who, what, when and why; the bell shows every notification.

Also worth a look: the *Portable LED light set* waitlist (Asha, Zoya), Kabir's overdue soldering station (automatic
delay incident), Tara's view of Meera's camera kit (photos from both sides, deposit held by an open incident), and
the admin's audit log and *Kestrel Street Community Workshop* awaiting verification.

---

## 20. Repository layout

```
backend/                         Spring Boot API (Java 21)
  src/main/java/org/spareslot/
    auth/        login, register, JWT, /me
    config/      security, CORS, DATABASE_URL parsing, Actor from JWT
    common/      AuditService, ApiException, error handler, labels
    resources/   listings, search, organisations
    credentials/ verification requests, EligibilityService
    bookings/    BookingService (transition), rules, waitlist, views
    deposits/    DepositService, PaymentProvider, DemoPaymentProvider
    photos/      ImageSanitizer, PhotoService
    incidents/ extensions/ notifications/ admin/ dashboard/ jobs/
  src/main/resources/db/migration/   V1–V3 (contract), V10–V11 (backend)
  src/main/resources/db/seed/        V90–V91 fictional demo data
  src/test/                          integration tests + schema_rules_test.sql
frontend/                        React + TypeScript + Tailwind + TanStack Query
deploy/                          Dockerfiles, nginx template, docker-compose
e2e/                             golden_path.mjs, Playwright tests
docs/                            SPEC.md (build contract), AI_USE.md, screenshots/
render.yaml                      Render blueprint
.github/workflows/keep-awake.yml keep the free API awake during judging
CLAUDE.md                        rules every contributor (and AI session) follows
```

---

## 21. Known limitations and next steps

- **Optional advisory AI** (incident summaries, resource matching) was the first item on the agreed cut list and is not
  built.
- **A deposit can be stuck** if an item returns rated worse but the damage incident is resolved in the borrower's
  favour: the contract allows neither a refund nor a fair forfeit. Needs a product decision (e.g. a corrected return
  record).
- **Promotion** checks the slot only, not the promoted borrower's quota or credential expiry.
- **No opening hours** or per-resource calendars: any future window is bookable until conflicts say otherwise.
- **Notifications** are in-app only (no email/SMS); polling every 30 s.
- **Free hosting:** the API sleeps without traffic (keep-awake workflow), and the free database expires after 30 days.
- Next steps: a real payment provider in test mode (`razorpay_test` is already allowed by the schema), opening hours,
  email notifications, the advisory features behind their feature flag.

---

## 22. AI use and third-party licences

Significant AI use is disclosed in **[`docs/AI_USE.md`](docs/AI_USE.md)**, file by file: the build contract and
schema were drafted with Claude (chat), and the application, tests, seed, deployment and documentation were
generated with Claude Code and reviewed by the team. The history was not squashed; the AI-use log is the record
of what was generated.

Libraries and their licences are listed in the same file: Spring Boot / Spring Security, Flyway, springdoc-openapi,
HikariCP, TypeScript and Playwright (Apache 2.0); the PostgreSQL JDBC driver and nginx (BSD-2-Clause); TwelveMonkeys
ImageIO (BSD-3-Clause); React, React Router, TanStack Query, Vite, Tailwind CSS, PostCSS, Autoprefixer and
Testcontainers (MIT); PostgreSQL (PostgreSQL Licence); Eclipse Temurin (GPLv2 with Classpath Exception).
