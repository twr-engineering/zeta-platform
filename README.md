# zeta-platform

Monorepo for Zeta Group / TWR client apps. Payload CMS is the shared backend; client apps sit beside it.

| Path | What | Origin |
|---|---|---|
| `apps/cms` | Payload CMS 3 + Next.js 16. Admin, REST/GraphQL, jobs, and (for now) the zetagroup.ph site | `twr-engineering/zeta-payload` (history kept) |
| `apps/commission` | ZETA GCI + Collections. Next.js 15 + Supabase | `Illamapalooza/nurture-your-commission` (history kept) |
| `packages/*` | Shared packages, extracted in Phase 3 | — |

Architecture, PRD and the client-app PRD template live in [`docs/platform/`](docs/platform/).

## Commands

```sh
pnpm install            # all apps (each app keeps its own lockfile for now, see docs/platform/Architecture.md ADR-19)
pnpm cms dev            # = pnpm --filter cms dev
pnpm commission dev     # = pnpm --filter commission dev
```

Each app's own README / CLAUDE.md still governs that app. The Parity Doctrine (`apps/cms`) and the money-engine rules (`apps/commission`) apply unchanged.
