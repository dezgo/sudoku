-- Crew requests (Nov 2026): opening someone's invite link no longer connects
-- you straight away — it asks them, and they accept or ignore. So a link that
-- gets forwarded on can't add anyone without the owner's say-so.
CREATE TABLE crew_requests (
  from_user   TEXT    NOT NULL,
  to_user     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  -- Ignored requests stay put so the asker still sees "waiting" — ignoring is
  -- never announced. They just stop showing for the person who ignored them.
  ignored     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (from_user, to_user)
);
CREATE INDEX idx_crew_requests_to ON crew_requests(to_user);
