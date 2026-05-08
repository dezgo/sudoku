-- Multiplayer v3: turn-based async sudoku with 2+ players. See
-- ../multiplayer-design.md for the design doc. Status field values are
-- documented inline. Ints are unix-millis where labelled `_at` and seconds
-- where labelled `_seconds`.

-- Game-level metadata. The puzzle is duplicated into the row (rather than
-- referencing daily_puzzles) because multiplayer games use freshly-generated
-- puzzles independent of the daily.
CREATE TABLE multiplayer_games (
  id                     TEXT PRIMARY KEY,
  puzzle_id              INTEGER NOT NULL,
  puzzle_givens          TEXT    NOT NULL,            -- JSON int[9][9]
  puzzle_solution        TEXT    NOT NULL,            -- JSON int[9][9]
  difficulty             TEXT    NOT NULL,            -- 'easy' | 'medium' | 'hard'
  created_by             TEXT    NOT NULL REFERENCES users(id),
  created_at             INTEGER NOT NULL,
  status                 TEXT    NOT NULL,            -- 'pending' | 'active' | 'completed' | 'abandoned'
  active_player_id       TEXT             REFERENCES users(id),
  turn_deadline          INTEGER,                     -- unix-millis; NULL while pending or unlimited
  turn_duration_seconds  INTEGER NOT NULL,            -- 3600 | 21600 | 86400 | 0 (0 = unlimited)
  competitive_mode       INTEGER NOT NULL DEFAULT 0,  -- 0/1 bool; 1 enables single-winner ranking
  invite_code            TEXT    NOT NULL UNIQUE,     -- 6-char base32 (mirrors group invite codes)
  winner_id              TEXT             REFERENCES users(id),
  completed_at           INTEGER
);
CREATE INDEX idx_mp_games_active_deadline ON multiplayer_games(status, turn_deadline);
CREATE INDEX idx_mp_games_creator ON multiplayer_games(created_by);

-- Players in a game. join_order dictates rotation. status can transition:
--   invited -> joined | declined
--   joined  -> left
CREATE TABLE multiplayer_players (
  game_id     TEXT    NOT NULL REFERENCES multiplayer_games(id),
  user_id     TEXT    NOT NULL REFERENCES users(id),
  join_order  INTEGER NOT NULL,
  status      TEXT    NOT NULL,                       -- 'invited' | 'joined' | 'declined' | 'left'
  joined_at   INTEGER,                                -- unix-millis when status became 'joined'
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX idx_mp_players_user ON multiplayer_players(user_id, status);

-- Move log. Wrong placements are logged with was_correct=0 but the cell
-- stays empty (the wrong digit isn't applied to the live board state).
-- Server reconstructs the live board from puzzle_givens + WHERE was_correct=1.
-- The composite (game_id, idempotency_key) is unique to make POST /moves
-- safely retryable.
CREATE TABLE multiplayer_moves (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id           TEXT    NOT NULL REFERENCES multiplayer_games(id),
  move_index        INTEGER NOT NULL,
  player_id         TEXT    NOT NULL REFERENCES users(id),
  row               INTEGER NOT NULL,                 -- 0..8
  col               INTEGER NOT NULL,                 -- 0..8
  value             INTEGER NOT NULL,                 -- 1..9; never 0
  was_correct       INTEGER NOT NULL,                 -- 0/1
  placed_at         INTEGER NOT NULL,
  idempotency_key   TEXT    NOT NULL,
  UNIQUE (game_id, idempotency_key)
);
CREATE INDEX idx_mp_moves_game ON multiplayer_moves(game_id, move_index);

-- Forfeit log: when an active player's turn deadline passes, we record a
-- skip. Separate table so it's clear in code that "no move" != "wrong move".
CREATE TABLE multiplayer_forfeits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      TEXT    NOT NULL REFERENCES multiplayer_games(id),
  player_id    TEXT    NOT NULL REFERENCES users(id),
  forfeited_at INTEGER NOT NULL
);
CREATE INDEX idx_mp_forfeits_game ON multiplayer_forfeits(game_id);

-- Push tokens for APNs (iOS) and FCM (Android). One user, multiple devices.
-- token is unique because each device's token is unique to (vendor x device).
CREATE TABLE push_tokens (
  user_id     TEXT    NOT NULL REFERENCES users(id),
  platform    TEXT    NOT NULL,                       -- 'ios' | 'android'
  token       TEXT    NOT NULL UNIQUE,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, token)
);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
