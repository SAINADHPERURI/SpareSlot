# AI use log

The hackathon requires significant use of AI tools to be disclosed. Each session adds what it generated here
(through the integrator). Be specific and honest; this file feeds the AI tools section of the project document.

| Date | Tool | What it generated | Reviewed by |
|---|---|---|---|
| 2026-10-28 | Claude (chat, planning) | Problem-statement analysis, requirements and build spec document, architecture diagram, 48-hour slice plan | Manohar to confirm |
| 2026-10-28 | Claude (design prototype) | A clickable UI mock-up of the booking journey. It is a design sketch, not product code, and is not part of the submission | Manohar to confirm |
| 2026-10-28 | Claude (contract session) | `V1__core_schema.sql`, `V2__photos.sql`, `V3__security_deposit.sql`, `schema_rules_test.sql`, `docs/SPEC.md`, `CLAUDE.md`, session prompts | Manohar to confirm |
| 2026-10-28 | Claude Code (Opus 5.5) | Backend: Maven project and wrapper, `application.yml`, migrations `V10__system_account.sql` and `V11__waitlist_expiry.sql`, all Java under `backend/src/main/java/org/spareslot/` (security and JWT, resources, credentials and eligibility, the booking service and state machine, waitlist and expiry, deposits and the demo payment provider, photo sanitising, incidents, extensions, notifications, admin, dashboards, scheduled jobs) | Integrator to confirm |
| 2026-10-28 | Claude Code (Opus 5.5) | Backend tests under `backend/src/test/java/org/spareslot/` (Testcontainers runner for `schema_rules_test.sql`, journey, request rules, deposits, photos, auth and jobs, demo seed, a 44-row security matrix): 120 tests | Integrator to confirm |
| 2026-10-28 | Claude Code (Opus 5.5) | Demo seed `db/seed/V90__demo_seed.sql` and `V91__demo_fresh_waitlist.sql` (fictional data; the BCrypt hash and the placeholder images were generated in code) | Integrator to confirm |
| 2026-10-28 | Claude Code (Opus 5.5, with sub-agents) | All of `frontend/` (React, TypeScript, Tailwind, TanStack Query): every screen, the typed API client, the redesign with the team's colour palette | Integrator to confirm |
| 2026-10-28 | Claude Code (Opus 5.5) | `deploy/` (Dockerfiles, nginx config, docker-compose), `render.yaml`, `.github/workflows/keep-awake.yml`, `e2e/` (API golden path script and 31 Playwright browser tests), `README.md` | Integrator to confirm |
| 2026-10-28 | Claude Code (Opus 5.5) | Doc updates: waitlist expiry in `CLAUDE.md` rule 5 and `docs/SPEC.md` section 4, and this log | Integrator to confirm |

Pre-existing code, templates and libraries used (list each with its licence): Spring Boot, Spring Security,
Flyway (Apache 2.0), PostgreSQL JDBC driver (BSD-2-Clause), React, Vite, Tailwind CSS, TanStack Query (MIT).
Added during the build: springdoc-openapi (Apache 2.0), TwelveMonkeys ImageIO WebP plugin (BSD-3-Clause),
Testcontainers (MIT), HikariCP (Apache 2.0), React Router (MIT), TypeScript (Apache 2.0), PostCSS and Autoprefixer
(MIT), Playwright (Apache 2.0), nginx (BSD-2-Clause), Eclipse Temurin JDK images (GPLv2 with Classpath Exception),
PostgreSQL 16 (PostgreSQL Licence). Generated scaffolding: the Maven wrapper (Apache 2.0).
