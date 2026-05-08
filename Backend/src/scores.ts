import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';

const MAX_ELAPSED_SECONDS = 24 * 60 * 60;
const MAX_MISTAKES = 10_000;
const MAX_HINTS = 10_000;
const MAX_PENCIL_ASSISTS = 10_000;

export async function postScore(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{
    puzzle_id?: number;
    elapsed_seconds?: number;
    mistakes?: number;
    // Assist markers — all optional for backwards-compat with older clients.
    // Defaults are "no assist used" so an old client that omits these still
    // submits a valid (clean-looking) score. New clients should always send.
    hints_used?: number;
    pencil_assists_used?: number;
    highlight_mistakes_was_on?: boolean;
    highlight_rules_was_on?: boolean;
  }>(req);

  const puzzleId = body?.puzzle_id;
  const elapsed = body?.elapsed_seconds;
  const mistakes = body?.mistakes ?? 0;
  const hintsUsed = body?.hints_used ?? 0;
  const pencilAssistsUsed = body?.pencil_assists_used ?? 0;
  const highlightMistakesWasOn = body?.highlight_mistakes_was_on ?? false;
  const highlightRulesWasOn = body?.highlight_rules_was_on ?? false;

  if (typeof puzzleId !== 'number' || !Number.isInteger(puzzleId) || puzzleId <= 0) {
    return jsonError(400, 'invalid_puzzle_id');
  }
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > MAX_ELAPSED_SECONDS) {
    return jsonError(400, 'invalid_elapsed_seconds');
  }
  if (typeof mistakes !== 'number' || !Number.isInteger(mistakes) || mistakes < 0 || mistakes > MAX_MISTAKES) {
    return jsonError(400, 'invalid_mistakes');
  }
  if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > MAX_HINTS) {
    return jsonError(400, 'invalid_hints_used');
  }
  if (!Number.isInteger(pencilAssistsUsed) || pencilAssistsUsed < 0 || pencilAssistsUsed > MAX_PENCIL_ASSISTS) {
    return jsonError(400, 'invalid_pencil_assists_used');
  }

  const puzzle = await env.DB.prepare('SELECT 1 FROM daily_puzzles WHERE puzzle_id = ?')
    .bind(puzzleId)
    .first();
  if (!puzzle) return jsonError(404, 'unknown_puzzle');

  const now = Date.now();
  // INSERT OR IGNORE — composite PK (user_id, puzzle_id) makes resubmission a
  // no-op, so the offline pending-scores queue can retry safely. The user's
  // first submission is canonical; we don't overwrite with worse times.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO scores
       (user_id, puzzle_id, elapsed_seconds, mistakes, completed_at,
        hints_used, pencil_assists_used,
        highlight_mistakes_was_on, highlight_rules_was_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      auth.user_id,
      puzzleId,
      Math.round(elapsed),
      mistakes,
      now,
      hintsUsed,
      pencilAssistsUsed,
      highlightMistakesWasOn ? 1 : 0,
      highlightRulesWasOn ? 1 : 0,
    )
    .run();

  // Rank is global per puzzle (count of strictly-faster scores, plus
  // earlier-completed ties). The leaderboard view filters per group; this is
  // just feedback for the submitting user.
  //
  // "Faster" = lower *penalised* elapsed time. We charge +10% per mistake,
  // capped at 5 mistakes (+50%), so a perfect solve is never beaten by a
  // mistake-laden one of similar raw time. Stored as integer x10 in SQL to
  // keep the comparison float-free:
  //   penalised_x10 = elapsed_seconds * (10 + MIN(mistakes, 5))
  const stored = await env.DB.prepare(
    'SELECT elapsed_seconds, mistakes, completed_at FROM scores WHERE user_id = ? AND puzzle_id = ?',
  )
    .bind(auth.user_id, puzzleId)
    .first<{ elapsed_seconds: number; mistakes: number; completed_at: number }>();
  if (!stored) return jsonError(500, 'score_store_failed');

  const myPenalised = stored.elapsed_seconds * (10 + Math.min(stored.mistakes, 5));

  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM scores
       WHERE puzzle_id = ?
         AND ( elapsed_seconds * (10 + MIN(mistakes, 5)) < ?
            OR (elapsed_seconds * (10 + MIN(mistakes, 5)) = ? AND completed_at < ?) )`,
  )
    .bind(puzzleId, myPenalised, myPenalised, stored.completed_at)
    .first<{ c: number }>();

  const rank = (ahead?.c ?? 0) + 1;
  return jsonOk({ rank });
}

export async function getGroupScores(
  req: Request,
  env: Env,
  groupId: string,
  puzzleId: number,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const member = await env.DB.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
  )
    .bind(groupId, auth.user_id)
    .first();
  if (!member) return jsonError(403, 'not_a_member');

  // Order by penalised time: +10% per mistake, capped at 5 mistakes (+50%).
  // Stored as integer x10 in SQL to keep the comparison float-free:
  //   penalised_x10 = elapsed_seconds * (10 + MIN(mistakes, 5))
  // We never expose raw mistake counts on the leaderboard — only the derived
  // `flawless` boolean (mistakes == 0), which the client renders as a badge.
  const result = await env.DB.prepare(
    `SELECT u.display_name, s.elapsed_seconds, s.mistakes, s.completed_at,
            s.hints_used, s.pencil_assists_used,
            s.highlight_mistakes_was_on, s.highlight_rules_was_on
       FROM scores s
       JOIN group_members gm ON gm.user_id = s.user_id
       JOIN users u ON u.id = s.user_id
      WHERE gm.group_id = ? AND s.puzzle_id = ?
      ORDER BY s.elapsed_seconds * (10 + MIN(s.mistakes, 5)) ASC, s.completed_at ASC`,
  )
    .bind(groupId, puzzleId)
    .all<{
      display_name: string | null;
      elapsed_seconds: number;
      mistakes: number;
      completed_at: number;
      hints_used: number;
      pencil_assists_used: number;
      highlight_mistakes_was_on: number;
      highlight_rules_was_on: number;
    }>();

  const rows = (result.results ?? []).map((r, i) => ({
    display_name: r.display_name,
    elapsed_seconds: r.elapsed_seconds,
    // Effective seconds = the same value the SQL ORDER BY uses for ranking.
    // Exposing it lets the client show "raw vs effective" in the player
    // detail sheet without ever revealing the raw mistake count.
    effective_seconds: Math.round(r.elapsed_seconds * (10 + Math.min(r.mistakes, 5)) / 10),
    completed_at: r.completed_at,
    rank: i + 1,
    hints_used: r.hints_used,
    pencil_assists_used: r.pencil_assists_used,
    highlight_mistakes_was_on: r.highlight_mistakes_was_on === 1,
    highlight_rules_was_on: r.highlight_rules_was_on === 1,
    flawless: r.mistakes === 0,
  }));
  return jsonOk(rows);
}
