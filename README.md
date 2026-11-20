# zeta-platform

Monorepo for Zeta Group / TWR client apps. Payload CMS is the shared backend; client apps sit beside it.

| Path | What | Origin |
|---|---|---|
| `apps/cms` | Payload CMS 3 + Next.js 16. Admin, REST/GraphQL, jobs, and (for now) the zetagroup.ph site | `twr-engineering/zeta-payload` (history kept) |
| `apps/commission` | ZETA GCI + Collections. Next.js 15 + Supabase | `Illamapalooza/nurture-your-commission` (history kept) |
| `packages/*` | Shared packages, extracted in Phase 3 | — |

The client-app PRD template is in [`docs/platform/client-apps/`](docs/platform/client-apps/). The platform Architecture and PRD, and the portal PRD (`apps/cms/docs/PRD.md`), are kept out of git on purpose; ask Julius for copies.

## Commands

```sh
pnpm install            # all apps, one shared lockfile at the root
pnpm cms dev            # runs `dev` in apps/cms
pnpm commission dev     # runs `dev` in apps/commission
```

Each app's own README / CLAUDE.md still governs that app. The Parity Doctrine (`apps/cms`) and the money-engine rules (`apps/commission`) apply unchanged.
