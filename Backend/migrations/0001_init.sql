-- Initial schema for the Sudoku backend.
-- See ../../SPEC.md §17 for the model. All timestamps are unix-millis.

-- Users. `email` is the cross-device anchor; `display_name` is global,
-- one per user, set on first sign-in. NULL until set.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

-- Active OTP codes. Stored as sha256 hashes. One row per email; reissuing
-- a code replaces the prior row. TTL ~15 min; max 5 verification attempts.
CREATE TABLE auth_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

-- Issued bearer tokens. Stored as sha256 hashes; the raw token is returned
-- to the client exactly once at /auth/verify time. No expiry — revocation
-- is by row-delete.
CREATE TABLE auth_tokens (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

-- Persisted daily puzzles. The Worker generates a row on first request for
-- a date and serves it byte-identical from then on.
CREATE TABLE daily_puzzles (
  puzzle_id     INTEGER PRIMARY KEY,           -- YYYYMMDD
  date          TEXT NOT NULL UNIQUE,          -- "YYYY-MM-DD"
  difficulty    TEXT NOT NULL,                 -- "easy" | "medium" | "hard"
  givens        TEXT NOT NULL,                 -- JSON-encoded int[9][9]
  solution      TEXT NOT NULL,                 -- JSON-encoded int[9][9]
  generated_at  INTEGER NOT NULL
);

-- Groups. `invite_code` is 6-char base32 (no ambiguous chars), unique.
CREATE TABLE groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL
);

-- Group membership. A user can be in N groups simultaneously.
CREATE TABLE group_members (
  group_id   TEXT NOT NULL REFERENCES groups(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members(user_id);

-- Scores. Composite PK gives us free idempotency: re-submitting the same
-- (user, puzzle) is a no-op (INSERT OR IGNORE), preserving the first solve
-- as canonical, which matches the "earliest completion wins ties" rule.
-- Phase 1 ships the table; Phase 2 ships the endpoints that use it.
CREATE TABLE scores (
  user_id          TEXT NOT NULL REFERENCES users(id),
  puzzle_id        INTEGER NOT NULL REFERENCES daily_puzzles(puzzle_id),
  elapsed_seconds  INTEGER NOT NULL,
  mistakes         INTEGER NOT NULL DEFAULT 0,
  completed_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, puzzle_id)
);
CREATE INDEX idx_scores_puzzle ON scores(puzzle_id);
