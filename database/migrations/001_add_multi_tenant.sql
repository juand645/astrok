-- =============================================================================
-- Migration 001 — multi-tenant: add `gyms` + `gym_id` everywhere
-- =============================================================================
--
-- WHAT THIS DOES
--   * Adds an `astrok.gyms` table with one default tenant row.
--   * Adds `gym_id` to every tenant-owned table, backfilled to the default gym.
--   * Drops the single-column UNIQUE on users.email / users.username and replaces
--     them with composite UNIQUE (gym_id, email) and (gym_id, username) — each
--     gym gets its own email/username namespace.
--   * Adds `(gym_id, ...)` indexes on the hot read paths so tenant scoping is
--     index-supported.
--
-- WHAT THIS DOES NOT DO YET
--   * Postgres Row-Level Security (RLS) policies. Tenant isolation is enforced
--     at the application layer via `gym_id` filters in deps.py. RLS can be
--     bolted on later as defense-in-depth — see migrations/002 (planned).
--   * Composite foreign keys to enforce same-gym membership across tables
--     (e.g. appointments.client_id + gym_id ↔ users.id + gym_id). Doable but
--     adds many constraint changes; deferred until the column shape is settled.
--   * Per-gym role definitions. Roles/permissions remain global app-wide.
--
-- HOW TO RUN
--   Idempotent — safe to re-run. From psql or Railway's Data → Query tab:
--     \i database/migrations/001_add_multi_tenant.sql
--   Or paste the whole file into a query window. Wrap in a transaction if your
--   client doesn't auto-commit per statement.
--
-- ROLLBACK
--   See `-- ROLLBACK` block at the bottom of this file (commented out).

SET search_path TO astrok, public;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. astrok.gyms
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS astrok.gyms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    brand_color VARCHAR(20),
    logo_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a default gym so existing rows have somewhere to land. Rename later via
--   UPDATE astrok.gyms SET slug = 'your-gym', name = 'Your Gym Name' WHERE slug = 'default';
--
-- Columns are listed explicitly (including ``active`` / ``created_at`` /
-- ``updated_at``) because the gyms table may have been auto-created by
-- ``Base.metadata.create_all`` in a dev workflow — SQLAlchemy ORM defaults
-- are Python-side, not DB-side, so an auto-created table won't have DEFAULT
-- clauses. Schema.sql's own CREATE TABLE does, so this would have worked
-- without it on a from-scratch psql run; the explicit values cover both.
INSERT INTO astrok.gyms (slug, name, active, created_at, updated_at)
VALUES ('default', 'Default Gym', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Add gym_id (NULLABLE first) to every tenant-owned table
-- -----------------------------------------------------------------------------

ALTER TABLE astrok.users                 ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.user_relations        ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.appointments          ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.trainer_unavailability ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.plans                 ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.plan_versions         ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.client_measurements   ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.workout_sessions      ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;
ALTER TABLE astrok.par_q_assessments     ADD COLUMN IF NOT EXISTS gym_id BIGINT REFERENCES astrok.gyms(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. Backfill existing rows to the default gym
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    default_gym_id BIGINT;
BEGIN
    SELECT id INTO default_gym_id FROM astrok.gyms WHERE slug = 'default';

    UPDATE astrok.users                  SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.user_relations         SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.appointments           SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.trainer_unavailability SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.plans                  SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.plan_versions          SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.client_measurements    SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.workout_sessions       SET gym_id = default_gym_id WHERE gym_id IS NULL;
    UPDATE astrok.par_q_assessments      SET gym_id = default_gym_id WHERE gym_id IS NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Promote gym_id to NOT NULL on every table
-- -----------------------------------------------------------------------------

ALTER TABLE astrok.users                  ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.user_relations         ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.appointments           ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.trainer_unavailability ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.plans                  ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.plan_versions          ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.client_measurements    ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.workout_sessions       ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE astrok.par_q_assessments      ALTER COLUMN gym_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Replace global UNIQUE on users.(email, username) with per-gym uniqueness
-- -----------------------------------------------------------------------------
--
-- The original schema declared `email VARCHAR(160) NOT NULL UNIQUE` inline,
-- which Postgres names `users_email_key` (same for `users_username_key`).
-- We drop the global ones and rebuild as composite.

ALTER TABLE astrok.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE astrok.users DROP CONSTRAINT IF EXISTS users_username_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_gym_email_unique'
    ) THEN
        ALTER TABLE astrok.users
            ADD CONSTRAINT users_gym_email_unique UNIQUE (gym_id, email);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_gym_username_unique'
    ) THEN
        ALTER TABLE astrok.users
            ADD CONSTRAINT users_gym_username_unique UNIQUE (gym_id, username);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Tenant-aware indexes on the hot read paths
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_gym_active
    ON astrok.users (gym_id, active);

CREATE INDEX IF NOT EXISTS idx_user_relations_gym_professional
    ON astrok.user_relations (gym_id, professional_id, active);

CREATE INDEX IF NOT EXISTS idx_appointments_gym_starts
    ON astrok.appointments (gym_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_gym_professional_starts
    ON astrok.appointments (gym_id, professional_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_trainer_unavailability_gym_starts
    ON astrok.trainer_unavailability (gym_id, professional_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_plans_gym_client
    ON astrok.plans (gym_id, client_id);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_gym_client_date
    ON astrok.workout_sessions (gym_id, client_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_par_q_gym_client_status
    ON astrok.par_q_assessments (gym_id, client_id, status);

-- -----------------------------------------------------------------------------
-- 7. Unique index on users(id, gym_id) so future composite FKs are possible
-- -----------------------------------------------------------------------------
--
-- A future hardening step can add ON appointments / plans / etc.:
--   FOREIGN KEY (client_id, gym_id) REFERENCES astrok.users(id, gym_id)
-- which makes it impossible at the DB level to attach a row from gym A to a
-- user from gym B. That requires this composite unique index to already exist.

CREATE UNIQUE INDEX IF NOT EXISTS users_id_gym_unique
    ON astrok.users (id, gym_id);

COMMIT;

-- =============================================================================
-- VERIFICATION (run these after the migration to confirm it landed cleanly)
-- =============================================================================
--
--   SELECT id, slug, name FROM astrok.gyms;
--   -- Expect: 1 row (default).
--
--   SELECT COUNT(*) AS rows_without_gym FROM astrok.users WHERE gym_id IS NULL;
--   -- Expect: 0.
--
--   SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'astrok' AND column_name = 'gym_id'
--   ORDER BY table_name;
--   -- Expect: every row shows is_nullable = NO.
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'astrok.users'::regclass
--     AND contype = 'u'
--   ORDER BY conname;
--   -- Expect: users_gym_email_unique, users_gym_username_unique,
--   --         users_id_gym_unique (latter as a unique index, see pg_indexes).

-- =============================================================================
-- ROLLBACK (commented out — uncomment and run as a separate script if needed)
-- =============================================================================
--
-- BEGIN;
-- ALTER TABLE astrok.users DROP CONSTRAINT IF EXISTS users_gym_email_unique;
-- ALTER TABLE astrok.users DROP CONSTRAINT IF EXISTS users_gym_username_unique;
-- ALTER TABLE astrok.users ADD CONSTRAINT users_email_key UNIQUE (email);
-- ALTER TABLE astrok.users ADD CONSTRAINT users_username_key UNIQUE (username);
-- DROP INDEX IF EXISTS astrok.users_id_gym_unique;
-- DROP INDEX IF EXISTS astrok.idx_users_gym_active;
-- DROP INDEX IF EXISTS astrok.idx_user_relations_gym_professional;
-- DROP INDEX IF EXISTS astrok.idx_appointments_gym_starts;
-- DROP INDEX IF EXISTS astrok.idx_appointments_gym_professional_starts;
-- DROP INDEX IF EXISTS astrok.idx_trainer_unavailability_gym_starts;
-- DROP INDEX IF EXISTS astrok.idx_plans_gym_client;
-- DROP INDEX IF EXISTS astrok.idx_workout_sessions_gym_client_date;
-- DROP INDEX IF EXISTS astrok.idx_par_q_gym_client_status;
-- ALTER TABLE astrok.users                  DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.user_relations         DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.appointments           DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.trainer_unavailability DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.plans                  DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.plan_versions          DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.client_measurements    DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.workout_sessions       DROP COLUMN IF EXISTS gym_id;
-- ALTER TABLE astrok.par_q_assessments      DROP COLUMN IF EXISTS gym_id;
-- DROP TABLE IF EXISTS astrok.gyms;
-- COMMIT;
