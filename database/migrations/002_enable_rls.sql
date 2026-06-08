-- =============================================================================
-- Migration 002 — Postgres Row-Level Security (defense in depth)
-- =============================================================================
--
-- WHAT THIS DOES
--   * Enables Row-Level Security on every tenant-owned table.
--   * Adds ``FORCE ROW LEVEL SECURITY`` so RLS applies even to the table
--     owner — important because most operators run the app as the same role
--     that owns the schema. Without FORCE, table-owner connections bypass
--     RLS and the policy is silently ignored.
--   * Creates one SELECT-only policy per table: rows are visible iff
--     ``gym_id = current_setting('app.current_gym_id')``.
--
-- WHY ONLY SELECT
--   The big risk is read-side data leaks (an unscoped SELECT returning rows
--   from another tenant). INSERT/UPDATE/DELETE are already gym-scoped at the
--   app layer — every endpoint that mutates sets ``gym_id`` explicitly from
--   ``current_user.gym_id``. Constraining writes via RLS would also block
--   the ``POST /api/gyms/`` flow that creates a bootstrap admin in a
--   *different* gym than the caller. Leaving INSERT/UPDATE/DELETE policy-free
--   keeps that working without special-casing.
--
-- WHAT THE APP MUST DO PER REQUEST
--   After resolving the caller's gym (in ``deps.get_authenticated_user`` and
--   in ``auth.login`` once the header-supplied slug is resolved), the backend
--   issues ``SET LOCAL app.current_gym_id = <gym_id>``. ``SET LOCAL`` is
--   transaction-scoped, so it auto-resets at COMMIT/ROLLBACK — every request
--   starts from a clean ContextVar.
--
-- BEHAVIOUR WHEN NO gym_id IS SET
--   The policy uses ``current_setting('app.current_gym_id', true)`` — the
--   ``true`` second argument returns NULL instead of erroring when the
--   variable is unset. Comparing ``gym_id = NULL`` yields NULL (treated as
--   FALSE in a USING clause), so the policy hides all rows when no gym
--   context exists. That's the safe default: unauthenticated queries see
--   nothing from tenant tables.
--
-- HOW TO RUN
--   Idempotent — safe to re-run. From psql or Railway's Data → Query tab:
--     \i database/migrations/002_enable_rls.sql
--
-- ROLLBACK
--   See the commented block at the bottom.

SET search_path TO astrok, public;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Register the GUC so SET LOCAL accepts ``app.current_gym_id``
-- -----------------------------------------------------------------------------
--
-- Postgres accepts any ``<prefix>.<name>`` GUC at runtime without prior
-- registration as long as the prefix isn't reserved — so SET LOCAL works
-- out of the box. Nothing to declare here, just documenting the contract:
--   * App writes:  SET LOCAL app.current_gym_id = '<bigint>'
--   * Policy reads: current_setting('app.current_gym_id', true)::bigint

-- -----------------------------------------------------------------------------
-- 2. Enable + force RLS on every tenant table
-- -----------------------------------------------------------------------------

ALTER TABLE astrok.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.users                 FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.user_relations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.user_relations        FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.appointments          FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.trainer_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.trainer_unavailability FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.plans                 FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.plan_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.plan_versions         FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.client_measurements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.client_measurements   FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.workout_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.workout_sessions      FORCE  ROW LEVEL SECURITY;

ALTER TABLE astrok.par_q_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE astrok.par_q_assessments     FORCE  ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. SELECT policies — one per tenant table
-- -----------------------------------------------------------------------------
--
-- Postgres does not have ``CREATE POLICY IF NOT EXISTS``, so wrap in DO
-- blocks that check pg_policies first. Keeps this migration idempotent.

DO $$
DECLARE
    target_table TEXT;
    tables TEXT[] := ARRAY[
        'users',
        'user_relations',
        'appointments',
        'trainer_unavailability',
        'plans',
        'plan_versions',
        'client_measurements',
        'workout_sessions',
        'par_q_assessments'
    ];
BEGIN
    FOREACH target_table IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'astrok'
              AND tablename = target_table
              AND policyname = 'tenant_isolation_select'
        ) THEN
            -- ``NULLIF(..., '')`` is required because Postgres returns the
            -- empty string for an unset custom GUC, not NULL. ``''::bigint``
            -- would error; ``NULL::bigint`` is fine and the policy correctly
            -- evaluates to FALSE (no rows visible). See migration 003 for the
            -- backstory.
            EXECUTE format(
                'CREATE POLICY tenant_isolation_select ON astrok.%I '
                'FOR SELECT '
                'USING (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::bigint)',
                target_table
            );
        END IF;
    END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
--   -- All tenant tables show rowsecurity = on AND forcerowsecurity = on.
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relnamespace = 'astrok'::regnamespace
--     AND relname IN (
--       'users', 'user_relations', 'appointments', 'trainer_unavailability',
--       'plans', 'plan_versions', 'client_measurements', 'workout_sessions',
--       'par_q_assessments'
--     )
--   ORDER BY relname;
--
--   -- One SELECT policy per table.
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'astrok'
--   ORDER BY tablename;
--
--   -- Sanity check: with no gym context, tenant tables look empty.
--   BEGIN;
--   SELECT count(*) FROM astrok.users;       -- expect 0
--   SET LOCAL app.current_gym_id = '1';
--   SELECT count(*) FROM astrok.users;       -- expect the default gym's users
--   ROLLBACK;

-- =============================================================================
-- ROLLBACK (commented — uncomment to revert)
-- =============================================================================
--
-- BEGIN;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.users;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.user_relations;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.appointments;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.trainer_unavailability;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.plans;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.plan_versions;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.client_measurements;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.workout_sessions;
-- DROP POLICY IF EXISTS tenant_isolation_select ON astrok.par_q_assessments;
-- ALTER TABLE astrok.users                  NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.user_relations         NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.appointments           NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.trainer_unavailability NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.plans                  NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.plan_versions          NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.client_measurements    NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.workout_sessions       NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE astrok.par_q_assessments      NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
-- COMMIT;
