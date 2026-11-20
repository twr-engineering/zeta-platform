# Handover

State of the zetagroup.ph rebuild as of 30 October 2026. Read this first, then `README.md` (setup) and
`CLAUDE.md` (rules). Keep this file current at every handover; it describes state, not history.

## Where things live

| What | Where |
|---|---|
| Code | `github.com/twr-engineering/zeta-payload` (private). `main` is unprotected by choice; CI runs on every PR |
| Requirements | `docs/PRD.md` (v2.2) and `docs/WP-00-behavioural-parity-matrix.md` (captured rules, §7 = latest findings) |
| Placeholders | `src/lib/parity/pending.ts` → `docs/PENDING.md` (generated) |
| Production pull (11 GB WordPress root + 89 MB MySQL dump) | **Not in GitHub.** Held offline on the developer's machine (`~/Projects/zeta-group`). Contains secrets and personal data; never upload it. Needed only for the capture tasks below |
| CRM fixtures | `tests/fixtures/respacio/` — extracted from the dump's `wp_curl_info` cache, redacted (no agent contacts, commissions or lead data) |

## Logins and access

Record **who holds** each credential, never the credential itself.

| System | Used for | Held by |
|---|---|---|
| Respacio CRM (API key) | Live listing sync (`RESPACIO_API_KEY`) | _not issued yet — client question_ |
| OVH (cluster151) | Current WordPress hosting | _TBD_ |
| Domain / DNS for zetagroup.ph | Cut-over | _TBD_ |
| WordPress admin | Comparing logged-in behaviour (gated downloads) | _TBD_ |
| Production hosting for the new build | Deploy | _not chosen yet_ |

## What works

All of this was checked from a fresh clone on 30 Oct 2026: setup per README, migrate, seed, 41 tests,
typecheck, lint, `next build`, and every route below served by `next start`.

- Respacio → Payload mirror sync (fixtures until a key exists). Idempotent, withdraws after two missed syncs,
  never deletes. Hourly Payload job (`ENABLE_JOB_AUTORUN=true` to run it in-process).
- `/search_results/` — the frozen URL contract, replay-tested against 1,381 real CRM calls.
- `/r/{ref}/` and `/long-term/{ref}/` (provisional field set), `/buy/` with the loan calculator (exact to the centavo).
- `/admin/` and `/api/` — stock Payload.

Not built: design system (WP-03), filter panel UI, location and shortlist pages, accounts, forms, editorial
templates, WordPress content migration (WP-10), deployment.

## Open risks

1. **The cloud SessionStart hook (`scripts/cloud/session-start.sh`) has not yet run in a real cloud session.**
   The first claude.ai/code session will be its test. The org must allow the Claude GitHub App on this repo.
2. **No live CRM access.** Everything runs on the August cache. Field drift in the live API will only show once
   a key exists — run `RESPACIO_MODE=live pnpm sync:crm` and the parity suite then.
3. **Capture tasks need the offline dump**, so they cannot be done from a cloud session.

## Waiting on the client (6)

Full wording and interim behaviour in `docs/PENDING.md`.

1. What a sold / withdrawn listing URL does — one sold reference number answers it.
2. Which of the 89 contact forms are live.
3. A login, to test whether the gated downloads on `/buy/` are meant to require one.
4. Confirm the shortlist count = the number of results in the shortlist's saved search.
5. Should the Beachfront shortlist filter by the Beachfront attribute (`fa[]=a145`)? Today it is a copy of Commercial.
6. A Respacio API key.

## Next work, in order

1. Capture the listing field set and the `/r/` vs `/long-term/` map from the dump (`listing-field-render-set`,
   `view-page-map`) — the listing page design depends on them.
2. Design system (WP-03).
3. Search filter panel, then location and shortlist pages.
4. The remaining capture tasks and the six live-site checks in `docs/PENDING.md`.
