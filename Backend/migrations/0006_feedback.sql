-- Feedback sent from the web app (Settings › Send feedback, or the link on
-- the home screen). Each one is also emailed to FEEDBACK_TO; this table is
-- the backup copy and the basis for the rate limit.
CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,                 -- NULL when sent without signing in
  reply_to    TEXT,                 -- signed in: account email; otherwise the optional one typed in
  message     TEXT    NOT NULL,
  context     TEXT,                 -- what screen / puzzle, device, app build
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_feedback_created ON feedback(created_at);
