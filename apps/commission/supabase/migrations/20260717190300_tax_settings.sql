-- tax_settings: the four (now five) knobs driving every computation in the
-- product. Exactly one row per workspace.
--
-- Module: M0 §3.3
--
-- Every rate is `numeric` — exact decimal, never float (Master PRD §4.3,
-- M0 §8). The scales mirror the PRD's declared types exactly.

create table commission.tax_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- Settings C6 — "Output VAT on commission (BIR standard 12%)".
  vat_rate numeric(6, 4) not null default 0.1200,

  -- Drives engine mode product-wide (M0 rule 13; Master PRD Q2).
  --   true  → commission-VAT machinery active (÷1.12 on receipted deals, VAT
  --           memos, EWT default 0.10)
  --   false → commission VAT off entirely (no ÷1.12, VAT memos = 0); EWT still
  --           applies on taxable deals, defaulting to 0.05
  --
  -- The PRD asks this at onboarding with "no silent default", but M0 AC1 also
  -- requires the bootstrapped row to carry EWT 10% — i.e. the VAT-registered
  -- defaults. Both hold via `vat_registered_confirmed_at`: the row starts on the
  -- AC1 defaults, and stays *unconfirmed* until M10's wizard puts the question
  -- to the agent. Treat NULL confirmation as "not yet answered", never as a
  -- silent yes.
  vat_registered boolean not null default true,
  vat_registered_confirmed_at timestamptz,

  -- Settings C7 — "10% individual broker; 5% if ≤₱3M sworn declaration".
  -- vat_registered sets the DEFAULT only; the rate stays editable, because a
  -- non-VAT agent without the sworn declaration is still withheld 10%.
  ewt_rate numeric(6, 4) not null default 0.1000,

  -- Settings C8 — BIR RR 1-2024 dwelling threshold. Comparison is strictly
  -- "above threshold ⇒ VAT-able"; exactly ₱3,600,000.00 is exempt (M0 rule 4).
  property_vat_threshold numeric(14, 2) not null default 3600000.00,

  -- Settings C9 — drives M6's "⚠ chase" flag when months idle >= this.
  chase_idle_months integer not null default 3,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Validation ranges are M0 §3.3 verbatim, enforced server-side so a forged
  -- request cannot land an out-of-range rate (M0 milestone DoD).
  constraint tax_settings_vat_rate_range check (vat_rate > 0 and vat_rate < 1),
  constraint tax_settings_ewt_rate_range check (ewt_rate >= 0 and ewt_rate < 1),
  constraint tax_settings_threshold_positive check (property_vat_threshold > 0),
  constraint tax_settings_chase_idle_min check (chase_idle_months >= 1),

  constraint tax_settings_one_per_workspace unique (workspace_id)
);

comment on table commission.tax_settings is
  'Exactly one row per workspace (M0 §3.3). Consumed by M1 (engine), M5 (payment splits), M6 (chase flag).';
comment on column commission.tax_settings.vat_registered is
  'Engine mode. true = VAT-registered agent; false = commission VAT off, EWT still applies. Flipping it is a confirmed-recompute event (M0 rule 3).';
comment on column commission.tax_settings.vat_registered_confirmed_at is
  'Set when the agent actually answers the onboarding question. NULL = unanswered — M10 must ask; never read the default as an answer.';

alter table commission.tax_settings enable row level security;

create policy "tax_settings_select_member"
  on commission.tax_settings for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "tax_settings_update_member"
  on commission.tax_settings for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- No INSERT/DELETE policies: the row is created by the signup bootstrap and
-- lives as long as the workspace. `tax_settings_one_per_workspace` makes a
-- second row impossible regardless.

create trigger tax_settings_touch_updated_at
  before update on commission.tax_settings
  for each row execute function commission_private.touch_updated_at();
