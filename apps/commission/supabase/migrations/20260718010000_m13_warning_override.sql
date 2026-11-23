-- M1.3 — Soft-warning overrides are audit-logged (FR-M1-11, PRD §6:
-- "Warnings render as amber inline banners with 'Continue anyway'
-- (audit-logged)").
--
-- A soft warning (duplicate, split-at-source, representation mismatch) never
-- blocks a save; the engine surfaces it and the agent may proceed. When they do,
-- the fact that the deal was saved with an active warning is recorded on the
-- deal's own audit trail so the decision is not silent.
--
-- This is its OWN function, not a change to create_deal / update_deal: the deal
-- write path is the single writer of the deal row and its field-level audit, and
-- threading an optional warnings array through it would complicate that contract
-- for a note that is informational. The override entry is written right after a
-- successful save (a second call, not the same transaction) — the honest
-- boundary, the same one M0.4 drew for events it cannot roll into the writer.
--
-- SECURITY INVOKER: the deal lookup runs under the caller's RLS, so a caller can
-- only ever log an override against their own deal, and commission_private.write_audit_entry
-- pins the actor to auth.uid().

create or replace function commission.log_deal_warning_override(
  p_deal_id uuid,
  p_warnings text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_audit_id uuid;
begin
  -- No warnings acknowledged → nothing to record.
  if p_warnings is null or array_length(p_warnings, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'no_warnings');
  end if;

  -- RLS confines this to the caller's own deal; another tenant's id sees no row.
  select workspace_id into v_workspace_id
  from commission.deal
  where id = p_deal_id;

  if v_workspace_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id,
    'deal',
    p_deal_id,
    'update',
    jsonb_build_object(
      'warning_override',
      jsonb_build_object('old', null, 'new', array_to_string(p_warnings, ', '))
    )
  );

  return jsonb_build_object('ok', true, 'audit_entry_id', v_audit_id);
end;
$$;

comment on function commission.log_deal_warning_override is
  'FR-M1-11. Records on a deal''s audit trail that it was saved past active soft warnings (the "Continue anyway" override). Called after a successful create/update; SECURITY INVOKER so RLS scopes the deal lookup and the actor is auth.uid().';
