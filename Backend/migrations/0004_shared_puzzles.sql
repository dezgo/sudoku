-- Shared puzzles: a starting position saved under a three-word name
-- (e.g. eagle-maple-lantern) so a friend can open the same board from
-- sudokucrew.com/p/<name>. One row per (board, sharer): sharing the same
-- board again returns the same name. sharer_seconds is the sharer's time
-- when they'd finished it before sharing (NULL if shared mid-game).
CREATE TABLE shared_puzzles (
  name            TEXT    PRIMARY KEY,
  givens          TEXT    NOT NULL,            -- JSON int[9][9], 0 = blank
  solution        TEXT    NOT NULL,            -- JSON int[9][9]
  difficulty      TEXT    NOT NULL,            -- 'easy' | 'medium' | 'hard' | 'expert'
  created_by      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sharer_seconds  INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE (givens, created_by)
);
