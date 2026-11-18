-- Introductions (Nov 2026): someone in both your crews can introduce you.
-- Stored as a pair of requests (one each way) marked `via` the introducer.
-- Unlike an invite link, BOTH people must accept: `accepted` records each
-- side's yes, and the connection is made when both rows are accepted.
ALTER TABLE crew_requests ADD COLUMN via TEXT;
ALTER TABLE crew_requests ADD COLUMN accepted INTEGER NOT NULL DEFAULT 0;
