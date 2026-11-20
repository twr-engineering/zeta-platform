-- Signup bootstrap: profile + workspace + owner membership + tax settings,
-- created in one transaction.
--
-- Module: M0 FR-M0-02
--
-- M0.1's definition of done requires sign-up → workspace to be atomic, and the
-- M0 test plan requires a failure to roll all four rows back. An AFTER INSERT
-- trigger on auth.users runs inside GoTrue's own transaction, so a raise here
-- rolls back the user too — the strongest form of that guarantee available.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  resolved_display_name text;
  resolved_workspace_name text;
begin
  -- Prefer the name supplied at sign-up; fall back to the email local part so
  -- the workspace is never called "'s Book".
  resolved_display_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if resolved_display_name is null then
    resolved_display_name := split_part(new.email, '@', 1);
  end if;

  -- M0 §3.1: name defaults to the agent's display name, e.g. "JD's Book".
  resolved_workspace_name := left(resolved_display_name || '''s Book', 120);

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, resolved_display_name);

  insert into public.workspace (name)
  values (resolved_workspace_name)
  returning id into new_workspace_id;

  insert into public.membership (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  -- Defaults per M0 AC1: VAT 12%, EWT 10%, threshold ₱3,600,000.00, chase 3
  -- months. vat_registered stays unconfirmed until M10's wizard asks.
  insert into public.tax_settings (workspace_id)
  values (new_workspace_id);

  return new;
end;
$$;

comment on function app.handle_new_user() is
  'Bootstraps a signed-up agent: profile, workspace, single owner membership, default tax settings — atomically (M0 FR-M0-02).';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
