# Client App PRD — `<app name>`

Copy this file to `client-apps/<app-name>.md` and fill it in. Sections 1-3 are the app's own business. Section 4 is the platform contract and maps one-to-one to [Architecture.md §7](../Architecture.md) (items C1-C15). An app is ready to scaffold when every row in section 4 has an answer or an explicit "none".

| Field | Value |
|---|---|
| **Status** | Draft / Approved |
| **Date** | YYYY-MM-DD (PHT) |
| **Author** | |
| **Platform docs version** | Architecture v_._ / Platform PRD v_._ |

---

## 1. Product

| Item | Answer |
|---|---|
| One-line description | |
| Problem | |
| Users | |
| Goals | |
| Non-goals | |
| Success metrics | |

## 2. Features

List features, user stories and acceptance criteria here, or link the documents that hold them. The platform docs do not constrain this section.

| ID | Feature | Priority | Acceptance |
|---|---|---|---|
| | | | |

## 3. Milestones

| Milestone | Outcome | Target |
|---|---|---|
| | | |

---

## 4. Platform contract

### C1. Identity

| Item | Answer |
|---|---|
| App name | |
| Workspace path | `apps/<name>` |
| Owner | |
| Domains (local / preview / staging / production) | |

### C2. Access tier

| Item | Answer |
|---|---|
| Tier | 1 (Local API, trusted server) or 2 (REST via SDK). Default: 2 |
| Reason | |
| Needs GraphQL? | no / yes, because |

### C3. Tenancy

| Item | Answer |
|---|---|
| Brands served | |
| How the brand is resolved (domain, path, fixed) | |
| Tenancy of its own (workspaces, orgs)? | none / describe, and where it is enforced |

### C4. Users and auth

| Item | Answer |
|---|---|
| Who logs in | nobody / staff / end users (describe) |
| Auth home | Payload collection `<slug>` / external provider (name) |
| Session mechanism | cookie / JWT / provider SDK |
| Roles and what each may do | |
| Service account needed? Scopes? | |
| Browser calls the CMS directly? | no (default) / yes, origins: |

### C5. Collections it reads

| Collection / global | Fields relied on | Published only? | Notes |
|---|---|---|---|
| | | | |

### C6. Collections it owns

Slugs carry the `<app>-` prefix. Every row needs all four access rules.

| Slug | Purpose | Brand-scoped | read | create | update | delete |
|---|---|---|---|---|---|---|
| | | | | | | |

### C7. Data outside Payload

| Item | Answer |
|---|---|
| Own database? | no / yes: engine, host |
| Why it cannot be Payload collections | |
| Who writes migrations, and where they live | |
| Tenant isolation mechanism | |
| Backup and restore owner | |

### C8. Money

| Item | Answer |
|---|---|
| Stores or computes money? | no / yes |
| Library / package | |
| Storage type | never a Payload `number` field |
| Rounding policy | |
| Fixtures that must reproduce exactly | |

```ts
// Shape reminder: money crosses boundaries as an exact decimal string
type Money = string
```

### C9. Frozen behaviour

| Suite or rule set | Location | Gate | May it be re-baselined? |
|---|---|---|---|
| | | | never / with signed deviation |

### C10. Integrations

| Concern | Needed? | Detail |
|---|---|---|
| Background jobs | | schedule, queue, failure handling |
| Email | | templates, sending domain |
| Media | | upload? sizes? brand attribution? |
| CRM mirror | | read only; apps never call the CRM |
| Forms | | which, where submissions go |
| Webhooks in / out | | |
| Third-party services | | name, data shared, DPA status |

### C11. Personal data

| Item | Answer |
|---|---|
| Categories collected | |
| Lawful basis per category | |
| Retention | |
| EU data subjects? | no / yes |
| Export path | |
| Erasure path | |
| Consent wording and versioning | |
| Processors | |

### C12. Locales

| Item | Answer |
|---|---|
| Languages | default `en` |
| Localizable content fields | |
| Currencies | default PHP |
| Time zone | default Asia/Manila |

### C13. Non-functional

| Item | Target |
|---|---|
| Performance budgets | |
| Accessibility | |
| Browser and device support | |
| Availability | |

### C14. Tests and CI

| Suite | Runner | Required check? |
|---|---|---|
| Typecheck, lint, unit, build | | yes (platform default) |
| | | |

### C15. Deploy

| Item | Answer |
|---|---|
| Host | |
| Environments | preview, staging, production (default) |
| Environment variables (names only) | |
| Secrets held by | |
| Rollback method | |
| Deploy order relative to the CMS | after CMS migrations (required for Tier 1) |

---

## 5. Platform changes this app needs

Anything not already provided by the platform PRD §5. Each row becomes an entry in the platform PRD change log.

| Change | Why | Affects other apps? |
|---|---|---|
| | | |

## 6. Open questions

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| | | | |

## 7. Change log

| Date (PHT) | Version | Change |
|---|---|---|
| | | |
