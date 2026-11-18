-- Finished games, for the crew feed and favourites (Nov 2026). The point is
-- curiosity and enjoyment, not competition: no times are kept here.
--
-- puzzle_ref says which board it was, so ratings from different players add
-- up on the same puzzle:
--   'd:<puzzle_id>'   a daily
--   's:<name>'        any other board, stored as a shared puzzle (/p/<name>)
CREATE TABLE plays (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL,
  puzzle_ref    TEXT    NOT NULL,
  mode          TEXT    NOT NULL,      -- daily | past_daily | practice | shared | coop
  difficulty    TEXT    NOT NULL,
  techniques    TEXT,                  -- JSON list of hint techniques used, or NULL
  enjoyment     INTEGER,               -- 1 meh, 2 good, 3 loved it; NULL = not rated
  learnt        INTEGER,               -- 1 yes, 0 not really; NULL = not answered
  completed_at  INTEGER NOT NULL,
  UNIQUE (user_id, puzzle_ref, completed_at)
);
CREATE INDEX idx_plays_user ON plays(user_id, completed_at);
CREATE INDEX idx_plays_completed ON plays(completed_at);
CREATE INDEX idx_plays_ref ON plays(puzzle_ref);
