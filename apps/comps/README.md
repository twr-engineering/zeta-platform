# apps/comps — Zeta Comps

Zeta's internal closed-deals database and CMA tool. Built milestone by milestone from the app PRD (v1.2, product owner Jong) on the platform Payload backend.

- Platform contract and deviations from the app PRD: `docs/apps/comps/PLATFORM.md` (kept out of git; vault `Projects/Zeta/Platform/client-apps/comps.md`).
- Data: `comps-*` collections in `packages/cms-config`. Migrations run from `apps/cms`.
- Access tier 1: route handlers use the Local API (`src/lib/payload.ts`) with the signed-in user, so collection access rules apply.

```sh
pnpm comps dev      # http://localhost:3002 (needs DATABASE_URI + PAYLOAD_SECRET, see .env.example)
```
