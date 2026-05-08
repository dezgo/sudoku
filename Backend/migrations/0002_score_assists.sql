-- Assist markers on scores: track which aids the user had on or used during
-- the solve, so the leaderboard can show who solved "clean" vs "with help".
-- See SPEC.md §17.4. All four are recorded; the UI renders them as small
-- icons next to each leaderboard row.
--
-- Ints rather than booleans — D1/SQLite has no bool type; we store
-- counters where meaningful (hints, pencil assists) and 0/1 flags otherwise.
ALTER TABLE scores ADD COLUMN hints_used                  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN pencil_assists_used         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN highlight_mistakes_was_on   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN highlight_rules_was_on      INTEGER NOT NULL DEFAULT 0;
