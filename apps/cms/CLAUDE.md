@AGENTS.md

# Zeta Group portal — Payload CMS 3 + Next.js rebuild of zetagroup.ph

## The one rule
This project reproduces the current site's **logic** exactly and changes only the **experience** around it
(PRD "Parity Doctrine", GP.1–GP.6). If a change alters *what* a user gets — a number, a result set, a URL,
a field, a validation — it is frozen. If it only changes how fast, clearly or accessibly they get it, it is
fair game. When unsure, treat it as frozen and ask.

- `docs/PRD.md` — requirements (v2.2). `docs/WP-00-behavioural-parity-matrix.md` — the captured rules.
- Code carrying a `CAPTURED` comment is parity logic (`src/lib/calculator.ts`, `price.ts`, `search/params.ts`).
  Do not "improve" it. A silent logic change is a defect, not a refactor.
- **Never re-baseline a failing test in `tests/parity/`.** A failure means the code drifted or the captured
  rule was wrong — both are findings to report, not to paper over.

## Placeholders for uncaptured rules
Behaviour that is not captured yet (or is waiting on the client) is registered once in
`src/lib/parity/pending.ts` and marked where it applies with `pending('id')` (logic) or
`<Pending id="…" />` (UI, deliberately visible). `pnpm pending` lists them; `docs/PENDING.md` is generated
from the registry with `pnpm pending --md` — regenerate it whenever you touch the registry.
- Never build a P*-class behaviour from a guess. If you need one that is not captured, add a registry entry
  with an explicit interim behaviour rather than inventing the rule.
- When a rule gets captured: implement it, delete its entry, fix every call site the type checker flags,
  update the matrix row, regenerate `docs/PENDING.md`.

## Architecture
- **Respacio CRM is reached only by the sync** (`src/crm/respacio/`). The front end reads Payload, never the
  CRM (PRD §15.6). `Listings` is a durable mirror; CRM-owned fields are read-only, editorial fields survive syncs.
- No API key yet, so the client replays `tests/fixtures/respacio/` — the golden-master corpus extracted from the
  production cache (513 listings, 73 details, 1,381 search calls; redacted). `RESPACIO_MODE=live` +
  `RESPACIO_API_KEY` switches to the real API.
- Search URL contract (`/search_results/?…`) is frozen: `src/lib/search/params.ts` parses it, `query.ts` runs it.
- Listing URLs are `/r/{reference_no}/` and `/long-term/{reference_no}/`. `trailingSlash: true` is required —
  every WordPress URL ends in `/`.
- Styling is placeholder CSS; the design system is WP-03 (not started).

## Commands
| | |
|---|---|
| `pnpm dev` | http://localhost:3000, admin at `/admin/` (create the first user there) |
| `pnpm test` / `pnpm test:parity` | Vitest. Parity failures are launch blockers |
| `pnpm typecheck` | Run before calling any change done |
| `pnpm sync:crm` | Mirror the CRM (fixtures without a key). Idempotent |
| `pnpm pending` | List placeholders |
| `pnpm generate:types` | After any collection/global change, then commit `src/payload-types.ts` |
| `pnpm payload migrate:create <name>` | After any schema change — commit the migration |

**Schema changes go through migrations.** Dev auto-push is off (`push: false`) because it stops on an
interactive prompt that hangs unattended sessions. Change the collection → `pnpm generate:types` →
`pnpm payload migrate:create <name>` → `pnpm payload migrate`. Never run `migrate:fresh` / `migrate:reset`.

## Environments
- **Cloud (claude.ai/code, Claude Desktop cloud):** `.claude/settings.json` runs
  `scripts/cloud/session-start.sh` on start — it starts Postgres 16, writes a dev `.env`, migrates and seeds.
  The environment's setup script should be `bash scripts/cloud/setup.sh`. Network access: add
  `crm.respacio.com` only once live CRM access exists, with the API key as a *network secret*.
- **Local:** see README (Homebrew Postgres on 5433).

## Conventions
- TypeScript: use `type`, never `interface`.
- Comments explain *why* and cite evidence (matrix row, PRD id, `file:line`). Match that density.
- Commit messages: conventional (`feat:`, `fix:`, `parity:`, `docs:`). Work on branches; PR into `main`.
- Never commit `.env`, credentials, or anything from the production dump that is not already redacted.
