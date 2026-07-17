-- M0.4 — account write path & data ownership.
--
-- Module: M0 §3.2 (User/profile), §3.7 (audit), FR-M0-10; milestone M0.4.
--
-- THE SHAPE HERE IS M0.2'S, DELIBERATELY — one database function per mutation,
-- so the change and its audit entry (rule 12) share a single transaction.
-- PostgREST gives no transaction across two calls, and an unaudited change to
-- the account is exactly what rule 12 forbids. Every function is SECURITY
-- INVOKER (RLS still governs) and the actor is taken from auth.uid() inside the
-- function, never a parameter — a forged actor is unrepresentable.
--
-- What is NOT here: account deletion and the auth-level mutations (email,
-- password). Those live in auth.users, which GoTrue owns — a Postgres function
-- cannot change a password or delete an auth user under the caller's own token.
-- Deletion is a service-role admin call behind a typed confirmation (see
-- src/lib/account/actions.ts); it rides the orphan reaper
-- (app.reap_orphaned_workspace) rather than duplicating it. The two log_*
-- functions below record those auth events in the workspace trail after GoTrue
-- has done the deed, so the audit log still answers "when did I change my
-- password / email".

-- ---------------------------------------------------------------------------
-- public.rename_profile — the display-name edit (M0 §3.2)
-- ---------------------------------------------------------------------------

-- One transaction: lock → diff → update → audit entry. The display name is a
-- profile attribute (it seeds the workspace name at signup and identifies the
-- agent), so a change to it is audited like any other settings change.
--
-- Not friction-gated: rule 9 reserves gates for destructive and money-restating
-- actions, and a name is neither. Audited all the same (rule 12).
create or replace function public.rename_profile(p_display_name text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.profiles;
  v_after public.profiles;
  v_workspace_id uuid;
  v_name text := btrim(p_display_name);
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'display name cannot be blank' using errcode = 'check_violation';
  end if;

  -- RLS (profiles_update_own) narrows this to the caller's own row. FOR UPDATE
  -- locks it so the diff cannot race a concurrent save.
  select * into v_before from public.profiles
    where id = (select auth.uid())
    for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  if v_before.display_name is not distinct from v_name then
    return jsonb_build_object('changed', false, 'display_name', v_before.display_name);
  end if;

  update public.profiles set display_name = v_name
  where id = v_before.id
  returning * into v_after;

  -- The audit trail is workspace-scoped (rule 1). v1 gives each user exactly one
  -- workspace, and app.current_workspace_id() resolves it.
  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'no workspace for this user' using errcode = 'no_data_found';
  end if;

  perform app.write_audit_entry(
    v_workspace_id, 'profile', v_after.id, 'update',
    jsonb_build_object('display_name',
      jsonb_build_object('old', to_jsonb(v_before.display_name), 'new', to_jsonb(v_after.display_name)))
  );

  return jsonb_build_object('changed', true, 'display_name', v_after.display_name);
end;
$$;

comment on function public.rename_profile is
  'M0.4 display-name edit. Update + audit entry in one transaction (rule 12). Not gated: a name change restates nothing (rule 9).';

-- ---------------------------------------------------------------------------
-- public.log_password_change / public.log_email_change — auth-event trail
-- ---------------------------------------------------------------------------

-- GoTrue changes the password/email; these record that it happened, in the same
-- workspace trail as every other change, so the agent can answer "when did I
-- change my password" and support/BIR have the event (SECURITY.md §10: log
-- authentication events). The secret itself never touches the trail — the
-- password entry is a redacted marker, and the fixed shapes here keep the log
-- from being stuffable with arbitrary text via the RPC.
create or replace function public.log_password_change()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'no workspace for this user' using errcode = 'no_data_found';
  end if;

  -- old = new = '•••••••' → the viewer renders it as a single redacted value
  -- ("Password  •••••••"), not a meaningless "•••••••  →  •••••••" arrow.
  return app.write_audit_entry(
    v_workspace_id, 'account', (select auth.uid()), 'update',
    jsonb_build_object('password',
      jsonb_build_object('old', '•••••••', 'new', '•••••••'))
  );
end;
$$;

comment on function public.log_password_change is
  'M0.4. Records a password change in the workspace audit trail. The secret is never stored — the entry is a redacted marker.';

create or replace function public.log_email_change(p_old text, p_new text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'no workspace for this user' using errcode = 'no_data_found';
  end if;

  -- An email address is not a secret; it reads plainly in the trail, and the
  -- change is a *request* until the new address is confirmed (GoTrue mails it).
  return app.write_audit_entry(
    v_workspace_id, 'account', (select auth.uid()), 'update',
    jsonb_build_object('email',
      jsonb_build_object('old', to_jsonb(p_old), 'new', to_jsonb(p_new)))
  );
end;
$$;

comment on function public.log_email_change is
  'M0.4. Records an email-change request in the workspace audit trail. Email addresses are not secret, so both sides are stored.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.rename_profile(text) from public;
revoke all on function public.log_password_change() from public;
revoke all on function public.log_email_change(text, text) from public;

grant execute on function public.rename_profile(text) to authenticated;
grant execute on function public.log_password_change() to authenticated;
grant execute on function public.log_email_change(text, text) to authenticated;
