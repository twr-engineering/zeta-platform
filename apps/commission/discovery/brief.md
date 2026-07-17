# ZETA GCI + Collections

**One-liner:** Micro SaaS for individual Philippine real estate agents to self-log commissions through a BIR-compliant commission & VAT engine, track commission receivables against developers (collectible vs collected = balance), and plan GCI goals with funnels linked to their own actuals.

**Target users (v1):** Solo Philippine real estate brokers and salespersons — self-logging deals across developer (pre-selling/RFO), resale, rental, and referral transactions. One workspace = one agent. Teams/brokerages are v2.

**Source of truth:** `discovery/prd.md` (the Master PRD, verbatim) and the full handoff package in `discovery/source/` — one PRD + one Milestones doc per module M0–M10, plus `WORKBOOK_REFERENCE.md` (verified extraction of the source Excel workbook, including test fixtures that must reproduce to the centavo) and the original workbook `ZETA GCI Calculator  Collections v30.20 (1).xlsx`.

**Read the referenced module PRD in `discovery/source/` in full before implementing any milestone.** The Master PRD is the map; the module PRDs carry the acceptance criteria.

**Key constraints (see Master PRD §4 and §6 for the authoritative list):**
- All money math in a single server-side pure calculation engine; exact decimal arithmetic; computed fields never editable.
- Relational database (PostgreSQL-class) with FKs, sequences (permanent `D001…` deal IDs), append-only audit log, soft-delete.
- Multi-tenant, single-user tenants in v1; schema team-ready for v2.
- ₱ PHP formatting, Asia/Manila workspace time; mobile-first daily loop (payment fast-entry, chase list).
- CSV/XLSX export on every table; one-time workbook importer is in MVP scope.
