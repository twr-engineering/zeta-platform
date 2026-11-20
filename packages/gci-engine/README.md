# @zeta/gci-engine

The ZETA GCI commission money engine, extracted from `apps/commission` (Phase 3).

| Entry | What |
|---|---|
| `@zeta/gci-engine/money` | Decimal money type, parsing, rounding, formatting |
| `@zeta/gci-engine/engine` | Deal, receivable and payment-split rules, warnings. Rules: [`src/engine/ROUNDING.md`](src/engine/ROUNDING.md) |

Rules that travel with it:
- Money is never a JS `number` across a boundary. Decimal strings only.
- The engine fixtures (D001-D021, N1) and the rounding tripwire test are the contract. A failing fixture is a finding; never edit an assertion to make it pass.
- Not to be merged with the CMS portal calculator (ADR-16).

`pnpm --filter @zeta/gci-engine test` runs the engine suite.
