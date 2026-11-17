-- How the web app is used (Nov 2026). Before this the only record of play
-- was a finished daily in `scores`, so practice games, players without an
-- account and which features got used were all invisible.
--
-- A device is one browser / home-screen install, identified by a random id
-- the web app makes up on first launch. It isn't tied to the person unless
-- they sign in on it. No IP address or user-agent string is stored.
CREATE TABLE devices (
  device_id      TEXT    PRIMARY KEY,
  user_id        TEXT,                 -- last account signed in on it; NULL = never signed in
  platform       TEXT,                 -- 'iphone' | 'ipad' | 'android' | 'computer'
  standalone     INTEGER NOT NULL DEFAULT 0, -- 1 = home-screen app, 0 = browser tab
  build          TEXT,                 -- web app bundle name, to tell versions apart
  first_seen_at  INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL
);
CREATE INDEX idx_devices_user ON devices(user_id);

-- One row per thing that happened. `kind` is one of:
--   open         the app was opened or brought back to the front
--   game_start   a new game began          detail: {mode, difficulty}
--   game_resume  a saved game was picked up detail: {mode, difficulty}
--   game_finish  a game was solved          detail: {mode, difficulty, seconds, mistakes, lifelines}
--   feature      a feature was used         detail: {f, ...}
--   setting      a setting was changed      detail: {key, value}
--   screen       a screen / sheet was opened detail: {s}
-- `day` is the date in DAILY_TIMEZONE, so "active days" match the daily puzzle's days.
CREATE TABLE usage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT    NOT NULL,
  user_id     TEXT,
  kind        TEXT    NOT NULL,
  detail      TEXT,                    -- small JSON object, or NULL
  day         TEXT    NOT NULL,        -- 'YYYY-MM-DD'
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_usage_created ON usage_events(created_at);
CREATE INDEX idx_usage_device_day ON usage_events(device_id, day);
CREATE INDEX idx_usage_user ON usage_events(user_id);
