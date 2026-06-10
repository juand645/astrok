-- =============================================================================
-- Migration 005 — super_admin role (cross-gym platform operator)
-- =============================================================================
--
-- WHAT THIS DOES
--   * Inserts a new ``super_admin`` global role.
--   * Grants it ``permissions:manage`` so existing RBAC code keeps making sense.
--   * Promotes the bootstrap admin user (``username='admin'`` in the default
--     gym) to ALSO have super_admin. They keep their gym-level ``admin`` role
--     so existing per-gym admin operations remain unchanged.
--
-- WHY A SEPARATE ROLE
--   The existing ``admin`` role is gym-scoped — every gym has its own admin
--   who manages clients/trainers within that gym. A platform operator who
--   creates new gyms and edits any gym's branding is a different concern
--   entirely. Splitting them keeps the principle of least privilege: a gym
--   owner who turns out to be malicious can't, say, rename your tenant.
--
-- AUTHORIZATION EFFECT
--   * ``GET /api/gyms/`` and ``POST /api/gyms/`` are gated on super_admin
--     (was: admin).
--   * ``PATCH /api/gyms/{id}`` accepts super_admin for any gym; gym admins
--     can still patch their own gym.
--
-- Idempotent.

SET search_path TO astrok, public;

BEGIN;

-- 1. Insert the super_admin role if it doesn't exist.
INSERT INTO astrok.roles (name, description, active, created_at, updated_at)
VALUES ('super_admin', 'Platform operator with cross-gym powers.', TRUE, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- 2. Grant super_admin every permission (cross-gym, manages everything).
INSERT INTO astrok.role_permissions (role_id, permission_id, created_at, updated_at)
SELECT r.id, p.id, NOW(), NOW()
FROM astrok.roles r
CROSS JOIN astrok.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Promote the bootstrap admin (username='admin', default gym) so the
--    feature is usable immediately on existing deployments. New super_admins
--    can later be created via SQL or a UI we add for it.
--
--    Skipped silently if no such user exists (e.g. fresh deploys that
--    renamed the bootstrap admin).
INSERT INTO astrok.user_roles (user_id, role_id, created_at, updated_at)
SELECT u.id, r.id, NOW(), NOW()
FROM astrok.users u
JOIN astrok.gyms g ON g.id = u.gym_id
CROSS JOIN astrok.roles r
WHERE u.username = 'admin'
  AND g.slug = 'default'
  AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
--   -- Should return one row.
--   SELECT id, name, active FROM astrok.roles WHERE name = 'super_admin';
--
--   -- Should show the bootstrap admin with both admin AND super_admin.
--   SELECT u.username, g.slug AS gym, r.name AS role
--   FROM astrok.users u
--   JOIN astrok.gyms g ON g.id = u.gym_id
--   JOIN astrok.user_roles ur ON ur.user_id = u.id
--   JOIN astrok.roles r ON r.id = ur.role_id
--   WHERE u.username = 'admin'
--   ORDER BY r.name;
