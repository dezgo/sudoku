-- Private notes on people in your crew (Nov 2026): "Sandrene from work".
-- Only the owner ever reads them — the person the note is about never sees it.
CREATE TABLE crew_notes (
  owner       TEXT    NOT NULL,
  about       TEXT    NOT NULL,
  note        TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (owner, about)
);
CREATE INDEX idx_crew_notes_about ON crew_notes(about);
