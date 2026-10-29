# zeta-payload

Payload CMS 3 + Next.js rebuild of `zetagroup.ph`.

Governed by two documents in `docs/`:

- **`docs/PRD.md`** — the PRD (v2.2). Read the Parity Doctrine (GP.1–GP.6) first.
- **`docs/WP-00-behavioural-parity-matrix.md`** — captured rules. **No P\*-class requirement may be
  built until its row there is complete and signed** (FR-PY02).
- **`docs/PENDING.md`** — every placeholder standing in for a rule not yet captured.

Working with Claude Code? `CLAUDE.md` is the agent brief, and it applies to people too.

## The one rule that matters

This project reproduces the existing system's **logic** exactly and changes only the
**experience** around it. If a change alters what a user gets, it is frozen. If it changes
only how fast, how clearly or how accessibly they get it, it is fair game.

Anything in `src/lib/` carrying a `CAPTURED` comment is parity logic. Do not "improve" it.
Silent logic changes are defects, not refactors.

## Local setup

Postgres.app holds 5432 and gates socket access behind a macOS app permission, so this
project uses the Homebrew server on **5433** instead:

```bash
pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" -l /tmp/pg5433.log start
createdb -h 127.0.0.1 -p 5433 zeta_dev

pnpm install
cp .env.example .env      # then fill in USER and PAYLOAD_SECRET
pnpm payload migrate      # schema
pnpm sync:crm             # seed 513 listings from the golden-master fixtures
pnpm dev                  # http://localhost:3000, admin at /admin/
```

## Claude Code in the cloud (claude.ai/code or Claude Desktop)

One-time, per collaborator:

1. Get access to this GitHub repo, and connect GitHub in Claude Code on the web (install the Claude GitHub App
   on the repo's owner account).
2. Create a cloud environment for the repo:
   - **Setup script:** `bash scripts/cloud/setup.sh`
   - **Network access:** *Trusted* (the default) is enough while the CRM runs on fixtures. When live access exists,
     switch to *Custom*, keep the defaults, add `crm.respacio.com`, and add `RESPACIO_API_KEY` as a
     **network secret** for that host, so the key never enters the VM.
3. Start a session. The SessionStart hook (`scripts/cloud/session-start.sh`) starts Postgres, writes a dev `.env`,
   migrates and seeds, so `pnpm dev` works straight away.

From a local terminal you can also hand a task to the cloud: `claude --cloud "…"` (push your branch first), and pull
a cloud session back with `claude --teleport`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server + admin |
| `pnpm test:parity` | **Golden-master suite.** A failure here is a launch blocker |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after a schema change |
| `pnpm generate:importmap` | Regenerate the admin import map |
| `pnpm sync:crm` | Mirror Respacio into Payload (fixtures until `RESPACIO_API_KEY` is set) |
| `pnpm pending` | List placeholders; `--md` regenerates `docs/PENDING.md` |
| `pnpm payload migrate:create <name>` | After any schema change. Dev auto-push is off |

## Parity suite

`tests/parity/` asserts that this build computes what the live site computes. Cases named
`GM-*` correspond to golden-master vectors in the PRD (FR-PY03).

**Never re-baseline a failing parity test to make it pass.** A failure means either the
implementation drifted or the captured rule was wrong. Both are findings.

The suite has already earned its keep once: it disproved a documented claim that a zero
interest rate yields `Infinity` (it yields `NaN`, via `Infinity * 0`). The matrix was
corrected, not the code.

## Status

Built:

- Content model for locations, listings, shortlists, posts, taxonomies, pages, testimonials, directory
- **Respacio adapter + mirror sync** (`src/crm/respacio/`), with a fixture transport replaying the production cache.
  Idempotent; withdraws after two missed syncs, never deletes. Hourly Payload job.
- **Search** — the frozen `/search_results/` URL contract (sort precedence, band hull, facet AND/OR, page size),
  server-rendered over the mirror, replay-tested against 1,381 real CRM calls
- **Listing detail** at `/r/{ref}/` and `/long-term/{ref}/` (provisional field set)
- **Price display** — `format_price` ported (BPM-008)
- `/buy/` with the **loan calculator**, FR-T01, verified against production to the centavo (BPM-001)
- Placeholders for the 21 uncaptured / client-blocked rules (`docs/PENDING.md`)

Not built: design system (WP-03), filter panel UI, location and shortlist pages, accounts, forms, editorial,
WordPress content migration (WP-10).
