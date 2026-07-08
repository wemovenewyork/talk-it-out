-- Talk It Out — Phase 5 initial schema (Neon Postgres)
-- Run once against the new `talk-it-out` Neon project. Idempotent where practical.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- case-insensitive email

-- Organizations workers can join via a short code.
CREATE TABLE IF NOT EXISTS orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        char(6) UNIQUE NOT NULL,             -- e.g. join code distributed by a steward
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext UNIQUE NOT NULL,
  name           text NOT NULL,
  password_hash  text NOT NULL,                    -- bcrypt, 12 rounds; never plaintext
  org_id         uuid REFERENCES orgs(id) ON DELETE SET NULL,
  personal_email text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Submission lifecycle: draft -> completed -> amended (amended links to its parent).
DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('draft', 'completed', 'amended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref_code              text NOT NULL,
  form_type             text,
  status                submission_status NOT NULL DEFAULT 'draft',
  fields                jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript            text,
  pdf_blob_url          text,
  original_scan_blob_url text,
  signature_blob_url    text,
  amended_from          uuid REFERENCES submissions(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id, created_at DESC);

-- Event log — powers coarse per-user rate limiting now and pattern alerts later.
CREATE TABLE IF NOT EXISTS events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  type          text NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_user_type_time ON events(user_id, type, created_at DESC);

-- One-hour password reset tokens (store only a SHA-256 hash of the token).
CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
