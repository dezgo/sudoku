-- "Playing right now" (Nov 2026). One row per device, overwritten by a
-- heartbeat about once a minute while the app is open, so the table never
-- grows past the number of devices. Rows older than a day are trimmed hourly.
CREATE TABLE presence (
  device_id  TEXT    PRIMARY KEY,
  playing    INTEGER NOT NULL DEFAULT 0,  -- 1 = a game is on screen and running
  at         INTEGER NOT NULL
);
CREATE INDEX idx_presence_at ON presence(at);
