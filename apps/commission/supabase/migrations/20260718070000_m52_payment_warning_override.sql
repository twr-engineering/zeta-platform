-- M5.2 — A payment saved past active soft warnings is audit-logged (FR-M5-04,
-- PRD §6.4 / AC11: "the acknowledgment is audit-logged").
--
-- The payment warnings (future date, pre-booking date, possible duplicate,
-- Closed/Cancelled receivable — warnings.ts) are AMBER and NON-BLOCKING: the
-- engine surfaces them and the agent may proceed on "Continue anyway". When they
-- do, that this payment was saved with a warning active is recorded on the
-- payment's own audit trail so the decision is not silent.
--
-- The exact sibling of M1.3's commission.log_deal_warning_override, for the same
-- reason it is its OWN function and not a change to create_payment/update_payment:
-- the payment write path is the single writer of the payment row and its
-- field-level audit, and threading an optional warnings array through it would
-- complicate that contract for an informational note. The override entry is
-- written right after a successful save (a second call, not the same
-- transaction) — the honest boundary M0.4 drew for events it cannot roll into
-- the writer, the same one the deal side uses.
--
-- SECURITY INVOKER: the payment lookup runs under the caller's RLS, so a caller
-- can only ever log an override against their own payment, and
-- commission_private.write_audit_entry pins the actor to auth.uid().

create or replace function commission.log_payment_warning_override(
  p_payment_id uuid,
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

  -- RLS confines this to the caller's own payment; another tenant's id sees no row.
  select workspace_id into v_workspace_id
  from commission.payment
  where id = p_payment_id;

  if v_workspace_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id,
    'payment',
    p_payment_id,
    'update',
    jsonb_build_object(
      'warning_override',
      jsonb_build_object('old', null, 'new', array_to_string(p_warnings, ', '))
    )
  );

  return jsonb_build_object('ok', true, 'audit_entry_id', v_audit_id);
end;
$$;

comment on function commission.log_payment_warning_override is
  'FR-M5-04 / AC11. Records on a payment''s audit trail that it was saved past active soft warnings (the "Continue anyway" override). Called after a successful create/update; SECURITY INVOKER so RLS scopes the payment lookup and the actor is auth.uid().';

revoke all on function commission.log_payment_warning_override(uuid, text[]) from public;
grant execute on function commission.log_payment_warning_override(uuid, text[]) to authenticated;
