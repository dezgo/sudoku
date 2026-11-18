-- "Ash is playing now" for crews, and whether she can be asked to watch (Nov 2026).
-- user_id: the account signed in on that device, if any. visible: the player
-- shows their games to their crew (Settings). watchable: they let their crew
-- ask to watch.
ALTER TABLE presence ADD COLUMN user_id TEXT;
ALTER TABLE presence ADD COLUMN visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE presence ADD COLUMN watchable INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_presence_user ON presence(user_id);
