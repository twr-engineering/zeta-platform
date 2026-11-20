# @zeta/parity

Behaviour captured from the production zetagroup.ph WordPress site, extracted from `apps/cms` (Phase 3).

| Entry | What |
|---|---|
| `@zeta/parity/price` | Price display rules (BPM-008) |
| `@zeta/parity/calculator` | Loan calculator, exact to the centavo |
| `@zeta/parity/search/params` | The frozen `/search_results/` URL-to-CRM parameter contract |
| `@zeta/parity/pending` | Registry of rules not yet captured; `apps/cms` `pnpm pending --md` regenerates its `docs/PENDING.md` |

**Parity Doctrine.** Code marked `CAPTURED` reproduces production exactly, quirks included. Do not "improve" it. The golden-master tests (`tests/`, replaying `tests/fixtures/search-calls.json`, 1,381 real CRM calls) are the contract: a failing test is an import bug or a finding, never a re-baseline. Governing docs: `apps/cms/docs/WP-00-behavioural-parity-matrix.md`.

`pnpm --filter @zeta/parity test` runs the suite.
