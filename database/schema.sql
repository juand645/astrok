-- PostgreSQL schema for a gym-first appointment platform that can expand into
-- medical, wellness, rehab, nutrition, or other professional services.

SET search_path TO astrok, public;

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(160) NOT NULL,
    photo_url TEXT,
    email CITEXT NOT NULL UNIQUE,
    username CITEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    description TEXT,
    birth_date DATE,
    measures JSONB NOT NULL DEFAULT '{}'::JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_relations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    relation_type VARCHAR(60) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_relations_different_users CHECK (professional_id <> client_id),
    CONSTRAINT user_relations_type_check CHECK (
        relation_type IN (
            'trainer_client',
            'doctor_patient',
            'nutritionist_client',
            'therapist_patient',
            'coach_client'
        )
    )
);

CREATE TABLE appointments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    appointment_type VARCHAR(60) NOT NULL DEFAULT 'personal_training',
    status VARCHAR(40) NOT NULL DEFAULT 'requested',
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT appointments_different_users CHECK (client_id <> professional_id),
    CONSTRAINT appointments_valid_time CHECK (ends_at > starts_at),
    CONSTRAINT appointments_status_check CHECK (
        status IN (
            'requested',
            'confirmed',
            'cancelled',
            'completed',
            'no_show',
            'rescheduled'
        )
    ),
    CONSTRAINT appointments_type_check CHECK (
        appointment_type IN (
            'personal_training',
            'routine_review',
            'medical_consultation',
            'nutrition_consultation',
            'physical_therapy',
            'wellness_consultation'
        )
    )
);

CREATE TABLE plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
    plan_type VARCHAR(60) NOT NULL DEFAULT 'workout_routine',
    title VARCHAR(160) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::JSONB,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plans_different_users CHECK (client_id <> professional_id),
    CONSTRAINT plans_status_check CHECK (
        status IN ('draft', 'approved', 'archived')
    ),
    CONSTRAINT plans_type_check CHECK (
        plan_type IN (
            'workout_routine',
            'rehab_plan',
            'nutrition_plan',
            'treatment_plan',
            'wellness_plan'
        )
    )
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_relations_professional_id ON user_relations(professional_id);
CREATE INDEX idx_user_relations_client_id ON user_relations(client_id);
CREATE INDEX idx_user_relations_type ON user_relations(relation_type);
CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_professional_id ON appointments(professional_id);
CREATE INDEX idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_plans_client_id ON plans(client_id);
CREATE INDEX idx_plans_professional_id ON plans(professional_id);
CREATE INDEX idx_plans_type ON plans(plan_type);
CREATE INDEX idx_users_measures_gin ON users USING GIN (measures);
CREATE INDEX idx_appointments_details_gin ON appointments USING GIN (details);
CREATE INDEX idx_plans_content_gin ON plans USING GIN (content);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_permissions_updated_at
BEFORE UPDATE ON permissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_role_permissions_updated_at
BEFORE UPDATE ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_roles_updated_at
BEFORE UPDATE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_relations_updated_at
BEFORE UPDATE ON user_relations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_plans_updated_at
BEFORE UPDATE ON plans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (name, description)
VALUES
    ('admin', 'Full system administration access.'),
    ('client', 'Gym client, patient, or service recipient.'),
    ('trainer', 'Gym instructor or personal trainer.'),
    ('doctor', 'Medical professional.'),
    ('nutritionist', 'Nutrition professional.'),
    ('receptionist', 'Front desk and scheduling staff.');

INSERT INTO permissions (name, description)
VALUES
    ('users:read', 'View users.'),
    ('users:write', 'Create and update users.'),
    ('appointments:read', 'View appointments.'),
    ('appointments:write', 'Create and update appointments.'),
    ('plans:read', 'View plans and routines.'),
    ('plans:write', 'Create and update plans and routines.'),
    ('permissions:manage', 'Manage roles and permissions.');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'appointments:read',
    'appointments:write',
    'plans:read',
    'plans:write',
    'users:read'
)
WHERE r.name IN ('trainer', 'doctor', 'nutritionist');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('appointments:read', 'plans:read')
WHERE r.name = 'client';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('appointments:read', 'appointments:write', 'users:read')
WHERE r.name = 'receptionist';
