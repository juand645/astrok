-- =============================================================================
-- Migration 006 — password reset tokens
-- =============================================================================
--
-- Single-use, time-limited tokens that let a user set a new password from a
-- link in their email. The token sent in the email is opaque (43 chars of
-- secure-random url-safe base64); only its SHA-256 hash is stored here, so
-- a DB dump can't be replayed.
--
-- DELIBERATELY NOT GYM-SCOPED
--   The redeem endpoint runs unauthenticated (the user has forgotten their
--   password — they have no token, no session, no gym context). With RLS on,
--   a tenant filter would hide every row from that lookup. Skipping gym_id
--   here is safe because the security primitive is the cryptographic token,
--   not gym scoping. Same shape as the ``gyms`` and ``roles`` tables.
--
-- LIFECYCLE
--   * On request: any prior un-used token for the same user is marked used
--     so old links from a forgotten request can't be replayed.
--   * On redeem: ``used_at`` is set; subsequent redeem attempts fail.
--   * Expired rows can be cleaned up by a periodic job (out of scope here).
--
-- Idempotent.

SET search_path TO astrok, public;

BEGIN;

CREATE TABLE IF NOT EXISTS astrok.password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES astrok.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON astrok.password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
    ON astrok.password_reset_tokens(user_id)
    WHERE used_at IS NULL;

COMMIT;
