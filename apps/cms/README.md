# zeta-payload

Payload CMS 3 + Next.js rebuild of `zetagroup.ph`.

Governed by two documents in the sibling `zeta-group/` repo:

- **`zetagrouppayloadprd (1).md`** — the PRD (v2.2). Read the Parity Doctrine (GP.1–GP.6) first.
- **`WP-00-behavioural-parity-matrix.md`** — captured rules. **No P\*-class requirement may be
  built until its row there is complete and signed** (FR-PY02).

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
createdb -h 127.0.0.1 -p 5433 zeta_payload

pnpm install
cp .env.example .env      # then fill in
pnpm dev                  # http://localhost:3000/admin
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server + admin |
| `pnpm test:parity` | **Golden-master suite.** A failure here is a launch blocker |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after a schema change |
| `pnpm generate:importmap` | Regenerate the admin import map |

## Parity suite

`tests/parity/` asserts that this build computes what the live site computes. Cases named
`GM-*` correspond to golden-master vectors in the PRD (FR-PY03).

**Never re-baseline a failing parity test to make it pass.** A failure means either the
implementation drifted or the captured rule was wrong. Both are findings.

The suite has already earned its keep once: it disproved a documented claim that a zero
interest rate yields `Infinity` (it yields `NaN`, via `Infinity * 0`). The matrix was
corrected, not the code.

## Status

Scaffold and content model only. Built so far:

- Content model for locations, listings, shortlists, posts, taxonomies, pages, testimonials, directory
- `src/lib/calculator.ts` — FR-T01, verified against production to the centavo (BPM-001)
- Globals for site settings and calculator defaults

Not built, and deliberately so — these depend on rules that are not yet captured:
search facets, the price slider, forms, listing detail routes, gated downloads.
