-- Introductions I've made (Nov 2026), so "Introduced ✓" shows on both
-- people's pages. Recorded for every introduction, even between people who
-- were already connected (where no request is sent) — so whether the button
-- says "Introduced" never hints at who's connected to whom.
CREATE TABLE crew_intros (
  by_user     TEXT    NOT NULL,
  a           TEXT    NOT NULL,   -- a < b
  b           TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (by_user, a, b)
);

-- Introductions already sent before this table existed (still pending).
INSERT OR IGNORE INTO crew_intros (by_user, a, b, created_at)
  SELECT via, MIN(from_user, to_user), MAX(from_user, to_user), MIN(created_at)
  FROM crew_requests WHERE via IS NOT NULL
  GROUP BY via, MIN(from_user, to_user), MAX(from_user, to_user);
