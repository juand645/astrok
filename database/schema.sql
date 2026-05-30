-- PostgreSQL schema for the Gym AI Assistant.
--
-- All tables are fully qualified with the `astrok.` schema prefix so this file
-- works in any SQL editor (Railway's Data tab, psql, pgAdmin, DBeaver) without
-- needing to set ``search_path`` first. The backend still sets
-- ``search_path = astrok,public`` per connection, so app queries don't need
-- the prefix at runtime — but the schema file itself does.
--
-- Run as the application user (e.g. gym_admin) on a freshly-created database:
--   psql -h localhost -U gym_admin -d gym_training -f database/schema.sql
-- Or paste into Railway's Postgres Data → Query tab.

CREATE SCHEMA IF NOT EXISTS astrok;
SET search_path TO astrok, public;

-- =============================================================================
-- Identity & access
-- =============================================================================

CREATE TABLE astrok.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(160) NOT NULL,
    photo_url TEXT,
    email VARCHAR(160) NOT NULL UNIQUE,
    username VARCHAR(160) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    personal_number VARCHAR(40),
    id_number VARCHAR(40),
    description TEXT,
    birth_date DATE,
    measures JSONB NOT NULL DEFAULT '{}'::JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    coach_messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE astrok.roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE astrok.permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE astrok.user_roles (
    user_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES astrok.roles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE astrok.role_permissions (
    role_id BIGINT NOT NULL REFERENCES astrok.roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES astrok.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- Professional <-> client relationship (trainer/client, doctor/patient, etc.)
-- =============================================================================

CREATE TABLE astrok.user_relations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    relation_type VARCHAR(60) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_relations_different_users CHECK (professional_id <> client_id)
);

-- =============================================================================
-- Appointments
-- =============================================================================

CREATE TABLE astrok.appointments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    professional_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    appointment_type VARCHAR(60) NOT NULL DEFAULT 'personal_training',
    status VARCHAR(40) NOT NULL DEFAULT 'requested',
    focus VARCHAR(120) NOT NULL DEFAULT 'Personal training',
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT appointments_different_users CHECK (client_id <> professional_id),
    CONSTRAINT appointments_valid_time CHECK (ends_at > starts_at)
);

CREATE TABLE astrok.trainer_unavailability (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT trainer_unavailability_valid_time CHECK (ends_at > starts_at)
);
CREATE INDEX idx_trainer_unavailability_professional_starts
    ON astrok.trainer_unavailability(professional_id, starts_at);

-- =============================================================================
-- Plans (workout routines, nutrition plans, rehab, etc.)
-- =============================================================================

CREATE TABLE astrok.plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    professional_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    appointment_id BIGINT REFERENCES astrok.appointments(id) ON DELETE SET NULL,
    plan_type VARCHAR(60) NOT NULL DEFAULT 'workout_routine',
    title VARCHAR(160) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::JSONB,
    description TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plans_different_users CHECK (client_id <> professional_id)
);

-- Append-only history of plan edits. A new row is written on every PATCH to
-- /api/plans/{id} via services/history.save_plan_version.
CREATE TABLE astrok.plan_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES astrok.plans(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content JSONB NOT NULL,
    status VARCHAR(40) NOT NULL,
    description TEXT,
    changed_by BIGINT REFERENCES astrok.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_note TEXT,
    UNIQUE (plan_id, version)
);

-- =============================================================================
-- Client measurements (append-only history; users.measures is the latest cache)
-- =============================================================================

CREATE TABLE astrok.client_measurements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE CASCADE,
    recorded_by BIGINT REFERENCES astrok.users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measures JSONB NOT NULL,
    notes TEXT
);

-- =============================================================================
-- Workout sessions (one row per training day, capped at 2 per (plan, day_key)
-- by application logic in app/api/sessions.py)
-- =============================================================================

CREATE TABLE astrok.workout_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES astrok.plans(id) ON DELETE CASCADE,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    recorded_by BIGINT REFERENCES astrok.users(id) ON DELETE SET NULL,
    day_key VARCHAR(40) NOT NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    performance JSONB NOT NULL DEFAULT '[]'::JSONB,
    rating SMALLINT,
    notes TEXT,
    ai_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workout_sessions_rating_check
        CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

-- =============================================================================
-- PAR-Q assessments (health screening lifecycle)
-- =============================================================================

CREATE TABLE astrok.par_q_assessments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE CASCADE,
    requested_by BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE RESTRICT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    responses JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT par_q_status_check CHECK (status IN ('requested', 'completed', 'expired'))
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_user_roles_user_id ON astrok.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON astrok.user_roles(role_id);

CREATE INDEX idx_user_relations_professional_id ON astrok.user_relations(professional_id);
CREATE INDEX idx_user_relations_client_id ON astrok.user_relations(client_id);
CREATE INDEX idx_user_relations_type ON astrok.user_relations(relation_type);

CREATE INDEX idx_appointments_client_id ON astrok.appointments(client_id);
CREATE INDEX idx_appointments_professional_id ON astrok.appointments(professional_id);
CREATE INDEX idx_appointments_starts_at ON astrok.appointments(starts_at);
CREATE INDEX idx_appointments_status ON astrok.appointments(status);
CREATE INDEX idx_appointments_details_gin ON astrok.appointments USING GIN (details);

CREATE INDEX idx_plans_client_id ON astrok.plans(client_id);
CREATE INDEX idx_plans_professional_id ON astrok.plans(professional_id);
CREATE INDEX idx_plans_type ON astrok.plans(plan_type);
CREATE INDEX idx_plans_content_gin ON astrok.plans USING GIN (content);

CREATE INDEX idx_plan_versions_plan_changed ON astrok.plan_versions(plan_id, changed_at DESC);

CREATE INDEX idx_client_measurements_client_recorded
    ON astrok.client_measurements(client_id, recorded_at DESC);
CREATE INDEX idx_client_measurements_measures_gin
    ON astrok.client_measurements USING GIN (measures);

CREATE INDEX idx_workout_sessions_plan_day_date
    ON astrok.workout_sessions(plan_id, day_key, session_date DESC);
CREATE INDEX idx_workout_sessions_client
    ON astrok.workout_sessions(client_id, session_date DESC);
CREATE INDEX idx_workout_sessions_performance_gin
    ON astrok.workout_sessions USING GIN (performance);

CREATE INDEX idx_par_q_client_status ON astrok.par_q_assessments (client_id, status);
CREATE INDEX idx_par_q_client_completed
    ON astrok.par_q_assessments (client_id, completed_at DESC NULLS LAST);

CREATE INDEX idx_users_measures_gin ON astrok.users USING GIN (measures);

-- =============================================================================
-- Seed data
--
-- The live dev environment uses three roles (admin, trainer, client). The
-- additional professional roles (doctor, nutritionist, receptionist) are
-- included here as future-proofing — the user_relations.relation_type column
-- already accepts the matching values.
-- =============================================================================

INSERT INTO astrok.roles (name, description) VALUES
    ('admin',        'Full system administration access.'),
    ('trainer',      'Gym instructor or personal trainer.'),
    ('client',       'Gym client, patient, or service recipient.'),
    ('doctor',       'Medical professional.'),
    ('nutritionist', 'Nutrition professional.'),
    ('receptionist', 'Front desk and scheduling staff.');

INSERT INTO astrok.permissions (name, description) VALUES
    ('users:read',         'View users.'),
    ('users:write',        'Create and update users.'),
    ('appointments:read',  'View appointments.'),
    ('appointments:write', 'Create and update appointments.'),
    ('plans:read',         'View plans and routines.'),
    ('plans:write',        'Create and update plans and routines.'),
    ('sessions:read',      'View workout session history.'),
    ('sessions:write',     'Log workout sessions.'),
    ('measurements:read',  'View client measurements.'),
    ('measurements:write', 'Record client measurements.'),
    ('permissions:manage', 'Manage roles and permissions.');

-- admin gets everything
INSERT INTO astrok.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM astrok.roles r
CROSS JOIN astrok.permissions p
WHERE r.name = 'admin';

-- trainer/doctor/nutritionist: clinical write + read across the board
INSERT INTO astrok.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM astrok.roles r
JOIN astrok.permissions p ON p.name IN (
    'users:read',
    'appointments:read',
    'appointments:write',
    'plans:read',
    'plans:write',
    'sessions:read',
    'measurements:read',
    'measurements:write'
)
WHERE r.name IN ('trainer', 'doctor', 'nutritionist');

-- client: read their own data + log their own sessions
INSERT INTO astrok.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM astrok.roles r
JOIN astrok.permissions p ON p.name IN (
    'appointments:read',
    'appointments:write',
    'plans:read',
    'sessions:read',
    'sessions:write',
    'measurements:read'
)
WHERE r.name = 'client';

-- receptionist: scheduling
INSERT INTO astrok.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM astrok.roles r
JOIN astrok.permissions p ON p.name IN (
    'users:read',
    'appointments:read',
    'appointments:write'
)
WHERE r.name = 'receptionist';

-- -----------------------------------------------------------------------------
-- Bootstrap admin
--
-- Lets a fresh deploy log in without manual SQL surgery. Change the password
-- IMMEDIATELY after the first login (Profile → Change password).
--
-- Credentials:
--   username: admin
--   password: ChangeMe123!
--
-- The hash below was produced with:
--   from app.core.security import hash_password
--   print(hash_password("ChangeMe123!"))
-- -----------------------------------------------------------------------------

INSERT INTO astrok.users (full_name, email, username, password_hash, active)
VALUES (
    'Administrator',
    'admin@example.com',
    'admin',
    '$2b$12$tXHG1aU.txIVh9W/yiQLBuQXNQKdgiWgRpNf/PsznOy7Bmc3.B1mi',
    TRUE
);

INSERT INTO astrok.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM astrok.users u, astrok.roles r
WHERE u.username = 'admin' AND r.name = 'admin';
