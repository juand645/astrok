-- =============================================================================
-- Migration 004 — RLS policies for UPDATE, DELETE, and INSERT
-- =============================================================================
--
-- BUG FIXED
--   Migrations 002/003 only created ``FOR SELECT`` policies on tenant tables.
--   Postgres' default-deny rule means: once RLS is enabled and at least one
--   policy exists, every command (SELECT/INSERT/UPDATE/DELETE) needs its own
--   matching policy or it's blocked. Without UPDATE/DELETE/INSERT policies,
--   every write returned 0 rows, surfacing as ``StaleDataError`` from
--   SQLAlchemy (PATCH /api/plans, DELETE /api/clients, INSERT new rows, ...).
--
--   This only manifests when the connecting role is NOT a superuser and does
--   NOT have ``BYPASSRLS``. Production (Railway uses the ``postgres``
--   superuser) silently bypassed RLS — local dev (a dedicated ``gym_admin``
--   role) hit the wall hard.
--
-- POLICIES ADDED
--   * ``tenant_isolation_update FOR UPDATE USING (gym_id = current_gym_id)``
--     — can only update rows in the caller's gym. WITH CHECK defaults to
--     USING, so the updated row must also keep ``gym_id = current_gym_id``;
--     a row can't be moved to a different gym via UPDATE.
--   * ``tenant_isolation_delete FOR DELETE USING (gym_id = current_gym_id)``
--     — same scoping for DELETE.
--   * ``tenant_isolation_insert FOR INSERT WITH CHECK (true)`` — permissive.
--     The application layer already sets ``gym_id`` explicitly from
--     ``current_user.gym_id`` at every insert site; the one legitimate
--     cross-gym INSERT (``POST /api/gyms/`` creating a bootstrap admin in
--     the new gym) needs to write a row with a different ``gym_id`` than
--     the caller has, which a strict INSERT policy would block.
--
-- WHY 27 FLAT STATEMENTS (NOT A DO LOOP)
--   Same reason as migration 003 — keeps the SQL editor-agnostic so the
--   Railway console doesn't choke on dollar-quoted DO blocks.
--
-- Idempotent — ``DROP POLICY IF EXISTS`` makes re-runs safe.

SET search_path TO astrok, public;

BEGIN;

-- -----------------------------------------------------------------------------
-- Drop any prior policies with these names (idempotency)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation_update ON astrok.users;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.user_relations;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.appointments;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.trainer_unavailability;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.plans;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.plan_versions;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.client_measurements;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.workout_sessions;
DROP POLICY IF EXISTS tenant_isolation_update ON astrok.par_q_assessments;

DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.users;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.user_relations;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.appointments;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.trainer_unavailability;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.plans;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.plan_versions;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.client_measurements;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.workout_sessions;
DROP POLICY IF EXISTS tenant_isolation_delete ON astrok.par_q_assessments;

DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.users;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.user_relations;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.appointments;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.trainer_unavailability;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.plans;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.plan_versions;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.client_measurements;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.workout_sessions;
DROP POLICY IF EXISTS tenant_isolation_insert ON astrok.par_q_assessments;

-- -----------------------------------------------------------------------------
-- UPDATE policies — only rows in the caller's gym are updatable
-- -----------------------------------------------------------------------------

CREATE POLICY tenant_isolation_update ON astrok.users
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.user_relations
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.appointments
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.trainer_unavailability
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.plans
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.plan_versions
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.client_measurements
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.workout_sessions
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_update ON astrok.par_q_assessments
    FOR UPDATE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);

-- -----------------------------------------------------------------------------
-- DELETE policies — only rows in the caller's gym are deletable
-- -----------------------------------------------------------------------------

CREATE POLICY tenant_isolation_delete ON astrok.users
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.user_relations
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.appointments
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.trainer_unavailability
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.plans
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.plan_versions
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.client_measurements
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.workout_sessions
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);
CREATE POLICY tenant_isolation_delete ON astrok.par_q_assessments
    FOR DELETE USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::bigint);

-- -----------------------------------------------------------------------------
-- INSERT policies — permissive (WITH CHECK true), see header comment for why
-- -----------------------------------------------------------------------------

CREATE POLICY tenant_isolation_insert ON astrok.users
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.user_relations
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.appointments
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.trainer_unavailability
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.plans
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.plan_versions
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.client_measurements
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.workout_sessions
    FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_insert ON astrok.par_q_assessments
    FOR INSERT WITH CHECK (true);

COMMIT;
