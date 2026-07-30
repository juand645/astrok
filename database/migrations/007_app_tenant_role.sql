-- =============================================================================
-- Migration 007 — Non-superuser tenant role so RLS actually enforces
-- =============================================================================
--
-- WHY
--   Migrations 002/004 add ``FORCE ROW LEVEL SECURITY`` + per-table policies,
--   but Railway's default role (``postgres``) is a SUPERUSER, which BYPASSES
--   Row-Level Security regardless of the FORCE flag. Result: in production
--   the app was running with RLS effectively disabled — a compromised or
--   buggy endpoint could return rows from another tenant. App-layer scoping
--   (``tenancy.py``) still runs, but that's one layer instead of two.
--
-- WHAT THIS DOES
--   1. Creates a login role ``app_tenant`` — NOSUPERUSER, NOBYPASSRLS,
--      NOCREATEDB, NOCREATEROLE. This is the role the FastAPI app will
--      connect as from now on.
--   2. Grants it the minimum runtime privileges: read/write on every table in
--      ``astrok`` plus USAGE on the schema and its sequences.
--   3. Sets default privileges so future tables/sequences created by
--      ``postgres`` are usable by ``app_tenant`` automatically.
--
-- WHAT KEEPS RUNNING AS SUPERUSER
--   * Migrations (this file included) — DDL still needs owner privileges.
--   * Any ad-hoc backfill/repair jobs.
--   Only the running FastAPI app switches to ``app_tenant``.
--
-- HOW TO RUN
--   1. Substitute a strong password for the placeholder below. Do NOT commit
--      the real password — either edit the file locally right before running,
--      or run these statements interactively.
--   2. From Railway's Data → Query tab (connected as ``postgres``):
--        \i database/migrations/007_app_tenant_role.sql
--   3. Update Railway's ``DATABASE_URL`` service variable to use ``app_tenant``
--      as the username and the new password (host/port/db unchanged).
--   4. Redeploy the FastAPI service.
--   5. Verify with the query at the bottom of this file.
--
-- ROLLBACK
--   Revert ``DATABASE_URL`` to the ``postgres`` credentials, then optionally
--   ``DROP ROLE app_tenant`` (after ``REASSIGN OWNED`` / ``DROP OWNED`` — see
--   the commented block at the bottom).
--
-- IDEMPOTENT
--   Safe to re-run: the role is created only if missing; the grants are
--   idempotent by nature.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Create the role
-- -----------------------------------------------------------------------------
--
-- The password here is a placeholder. Replace with a strong secret BEFORE
-- executing this migration, or run steps 1–2 interactively so no plaintext
-- ever lands on disk. Password is only used the first time; ``ALTER ROLE ...
-- PASSWORD`` can rotate it later without needing this migration again.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    EXECUTE $create$
      CREATE ROLE app_tenant
        LOGIN
        PASSWORD 'CHANGE_ME_BEFORE_RUNNING'
        NOSUPERUSER
        NOBYPASSRLS
        NOCREATEDB
        NOCREATEROLE
        INHERIT
    $create$;
  END IF;
END $$;

-- Belt-and-suspenders: enforce the RLS-relevant attributes even if the role
-- already existed with different flags from a prior manual attempt.
ALTER ROLE app_tenant NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- -----------------------------------------------------------------------------
-- 2. Connect + schema access
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_tenant', current_database());
END $$;

GRANT USAGE ON SCHEMA astrok TO app_tenant;
-- ``public`` is on the search_path (see ``core/database.py``) so keeping USAGE
-- avoids surprise ``permission denied for schema public`` on any incidental
-- reference. No table privileges on public — nothing app-owned lives there.
GRANT USAGE ON SCHEMA public TO app_tenant;

-- -----------------------------------------------------------------------------
-- 3. Table + sequence privileges on existing objects
-- -----------------------------------------------------------------------------
--
-- Full DML — including on ``gyms`` (the tenant registry, no RLS) and
-- ``password_reset_tokens`` (unauthenticated lookups, no RLS). Access to
-- these is guarded at the endpoint layer (``require_super_admin`` /
-- explicit token validation), not at the DB layer.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA astrok TO app_tenant;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA astrok TO app_tenant;

-- -----------------------------------------------------------------------------
-- 4. Default privileges for FUTURE objects created by the migration runner
-- -----------------------------------------------------------------------------
--
-- ``ALTER DEFAULT PRIVILEGES`` only affects objects created by the role you
-- name in ``FOR ROLE``. We pin it to whoever is running THIS migration
-- (``current_user``) — typically ``postgres`` on Railway and ``gym_admin``
-- (or similar) locally. If a later migration is run by the same role and
-- creates a new tenant table, ``app_tenant`` already has grants at COMMIT.

DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA astrok '
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA astrok '
    'GRANT USAGE, SELECT ON SEQUENCES TO app_tenant',
    current_user
  );
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after step 4 above, connected as ``app_tenant``)
-- =============================================================================
--
--   -- Confirm the role has the right flags.
--   SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
--   FROM pg_roles
--   WHERE rolname = 'app_tenant';
--   -- Expect: rolsuper=f, rolbypassrls=f, rolcreatedb=f, rolcreaterole=f.
--
--   -- Sanity: with no gym scope, tenant tables look empty.
--   -- Run this in a fresh session opened as app_tenant.
--   BEGIN;
--     SELECT count(*) FROM astrok.users;              -- expect 0
--     SET LOCAL app.current_gym_id = '1';
--     SELECT count(*) FROM astrok.users;              -- expect gym 1's users
--   ROLLBACK;
--
--   -- Cross-tenant read attempt (should return 0 rows even if gym 2 has users).
--   BEGIN;
--     SET LOCAL app.current_gym_id = '1';
--     SELECT count(*) FROM astrok.users WHERE gym_id = 2;
--   ROLLBACK;

-- =============================================================================
-- ROLLBACK (commented — uncomment to revert)
-- =============================================================================
--
-- Prerequisite: switch ``DATABASE_URL`` back to postgres and redeploy first,
-- otherwise the app will lose its connection when the role is dropped.
--
-- BEGIN;
-- REASSIGN OWNED BY app_tenant TO postgres;   -- app_tenant owns nothing today,
-- DROP OWNED BY app_tenant;                    -- but these are cheap safety nets.
-- DROP ROLE IF EXISTS app_tenant;
-- COMMIT;
