-- Co-op: 2–4 players solve one board together, live. The live board lives
-- in a Durable Object (CoopRoom, one per game); these tables are the index
-- (who is in which game, for joining and "my co-op games") plus the result.
CREATE TABLE coop_games (
  name             TEXT    PRIMARY KEY,           -- three-word name, as for shared puzzles
  givens           TEXT    NOT NULL,              -- JSON int[9][9], 0 = blank
  solution         TEXT    NOT NULL,              -- JSON int[9][9]
  difficulty       TEXT    NOT NULL,              -- 'easy' | 'medium' | 'hard' | 'expert'
  created_by       TEXT    NOT NULL REFERENCES users(id),
  created_at       INTEGER NOT NULL,
  completed_at     INTEGER,
  elapsed_seconds  INTEGER,
  mistakes         INTEGER
);

CREATE TABLE coop_players (
  name       TEXT    NOT NULL REFERENCES coop_games(name),
  user_id    TEXT    NOT NULL REFERENCES users(id),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (name, user_id)
);
CREATE INDEX idx_coop_players_user ON coop_players(user_id);
