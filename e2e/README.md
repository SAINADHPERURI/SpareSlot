# End-to-end golden path

`golden_path.mjs` runs the whole journey against a running SpareSlot through the public API: sign in, request,
approve, pay the demo deposit, check in with photos from both sides, return, refund, close, and read the timeline.

```bash
# against the local stack (docker compose -f deploy/docker-compose.yml up --build)
BASE_URL=http://localhost:3000 node e2e/golden_path.mjs

# against the deployed app
BASE_URL=https://<your-deployed-host> node e2e/golden_path.mjs
```

It signs in through the demo "sign in as" endpoint, so the target needs `DEMO_LOGIN_ENABLED=true` and the demo
seed. With demo sign-in turned off, set `E2E_PASSWORD` to the demo password in your shell (never commit it).
Each run books a new free one-hour window 10 to 40 days ahead, so it can be run many times.

Requires Node 22 or later. No packages to install.

# Browser tests (Playwright)

`tests/` clicks through the real UI against a running app with the demo seed and `DEMO_LOGIN_ENABLED=true`:

- `journey.spec.ts`: a brand-new borrower registers, is blocked by a missing credential, gets verified by a manager,
  is refused a too-long window, requests, is approved (the reason is mandatory), pays the demo deposit, both sides
  add photos at pickup, the item is returned, the deposit refunded beside its evidence, the booking closed, and the
  borrower reads the full history and the notifications.
- `roles.spec.ts`: each role's home, pages kept from other roles, another organisation's booking is not found.
- `seeded.spec.ts`: the waitlist labels, photos from both sides with a held deposit, the automatic overdue incident,
  a forfeit in the history, the eligible-for-me filter.
- `responsive.spec.ts` (phone viewport): no sideways scrolling, and the menu works.

```bash
cd e2e && npm install
BASE_URL=http://localhost:3000 npx playwright test            # downloads nothing if PW_CHANNEL is set:
BASE_URL=http://localhost:3000 PW_CHANNEL=msedge npx playwright test
npx playwright show-report                                     # the HTML report
```

Each run registers a new fictional borrower and books a fresh window, so the suite can be run repeatedly.
