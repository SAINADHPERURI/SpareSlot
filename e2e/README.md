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
