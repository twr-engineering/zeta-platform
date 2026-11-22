-- ADR-23: the CMS (Payload + Zeta Comps) in the shared platform database, schema "cms".
-- Run ONCE per environment, as the database owner (Supabase SQL editor, "postgres" role),
-- BEFORE the first `payload migrate` there. It is idempotent.
-- Replace the password placeholder at run time; never commit a real password.
--
-- Guardrails it sets up (Architecture ADR-23):
--   (2) the CMS has its own role and cannot touch the commission schema ("public");
--   (4) the role has a connection cap, so CMS traffic can never starve the commission app.
-- The "cms" schema is not added to Supabase's exposed schemas, so its REST API never serves it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cms_app') THEN
    CREATE ROLE cms_app LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD' CONNECTION LIMIT 20;
  END IF;
END $$;

-- Postgres 16+: a non-superuser owner (Supabase's "postgres") must be a member of cms_app before it
-- can hand it the schema. The creator already holds ADMIN on the role, so it can grant itself this.
GRANT cms_app TO CURRENT_USER;

-- The schema belongs to the CMS role: it creates and alters its own tables through migrations.
CREATE SCHEMA IF NOT EXISTS cms AUTHORIZATION cms_app;
ALTER SCHEMA cms OWNER TO cms_app;

-- If "cms" already has objects (created by another user), hand them to the CMS role. Migrations
-- must run as cms_app (its connection string) so every new object it creates is its own.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'cms' LOOP
    EXECUTE format('ALTER TABLE cms.%I OWNER TO cms_app', r.tablename);  -- owned sequences follow
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'cms' AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE cms.%I OWNER TO cms_app', r.typname);
  END LOOP;
END $$;

-- Unqualified names resolve to "cms" for this role (Payload qualifies everything anyway).
ALTER ROLE cms_app SET search_path = cms;

-- No access to the commission schema or Supabase's internal schemas.
REVOKE ALL ON SCHEMA public FROM cms_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM cms_app;
REVOKE ALL ON SCHEMA auth FROM cms_app;
REVOKE ALL ON SCHEMA storage FROM cms_app;

-- Supabase's client roles get nothing in "cms".
REVOKE ALL ON SCHEMA cms FROM anon, authenticated;

-- Read-only analysis across apps (guardrail 3): an "analytics" schema of views, readable by a
-- separate read-only role. Create the views later; the role and schema can exist now.
CREATE SCHEMA IF NOT EXISTS analytics;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_reader') THEN
    CREATE ROLE analytics_reader NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA analytics TO analytics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO analytics_reader;
