-- =============================================================================
-- Migration 003 — make RLS policies robust to an unset GUC
-- =============================================================================
--
-- BUG FIXED
--   Postgres returns the empty string ``''`` (not NULL) for
--   ``current_setting('app.current_gym_id', true)`` when the GUC was never
--   set in the current session. Casting ``''::bigint`` raises:
--     ERROR: invalid input syntax for type bigint: ""
--
--   That blew up every authenticated request the moment its session opened
--   a fresh connection without a ``SET LOCAL`` having run yet.
--
-- FIX
--   Use ``NULLIF(current_setting(...), '')::bigint``. ``NULLIF`` turns the
--   empty string into a real NULL, and ``gym_id = NULL`` evaluates to NULL
--   (treated as FALSE in a USING clause). Net effect: with no gym scope set,
--   every tenant row is hidden — the same safe-default behaviour we wanted,
--   without the SQL error.
--
-- WHY 18 FLAT STATEMENTS INSTEAD OF A DO BLOCK
--   Some web-based SQL editors (notably Railway's Data tab) auto-append
--   ``LIMIT N`` to queries for table-browsing convenience — that's harmless
--   for SELECTs but produces ``syntax error at or near "LIMIT"`` on DDL.
--   Dollar-quoted ``DO $$ ... $$`` blocks also confuse some paste paths
--   (smart-quote conversion, hidden whitespace). Flat statements work in
--   every editor and runner without surprises.
--
-- Idempotent — re-runs are no-ops once the new policy is in place. The
-- ``DROP POLICY IF EXISTS`` makes it safe regardless of whether migration
-- 002 was already applied or not.

SET search_path TO astrok, public;

BEGIN;

DROP POLICY IF EXISTS tenant_isolation_select ON astrok.users;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.user_relations;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.appointments;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.trainer_unavailability;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.plans;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.plan_versions;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.client_measurements;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.workout_sessions;
DROP POLICY IF EXISTS tenant_isolation_select ON astrok.par_q_assessments;

CREATE POLICY tenant_isolation_select ON astrok.users
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.user_relations
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.appointments
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.trainer_unavailability
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.plans
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.plan_versions
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.client_measurements
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.workout_sessions
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_select ON astrok.par_q_assessments
    FOR SELECT USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);

COMMIT;
