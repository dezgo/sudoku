-- Crews become personal (Nov 2026). Instead of shared named groups where
-- everyone sees everyone, each player has their own crew: the people they're
-- connected to, one pair at a time. Inviting a friend connects just the two
-- of you. A connection is stored once with a < b and works both ways.
CREATE TABLE connections (
  a           TEXT    NOT NULL,
  b           TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX idx_connections_b ON connections(b);

-- One-off, when crews changed: everyone who shared a group is connected, so
-- nobody loses anyone. Nothing keeps groups and connections in step after this.
INSERT OR IGNORE INTO connections (a, b, created_at)
  SELECT x.user_id, y.user_id, MAX(x.joined_at, y.joined_at)
  FROM group_members x JOIN group_members y ON x.group_id = y.group_id AND x.user_id < y.user_id;

-- Each player's own invite code (sudokucrew.com/g/<code>), made on first use.
ALTER TABLE users ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX idx_users_invite_code ON users(invite_code);
