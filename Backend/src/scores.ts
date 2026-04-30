import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';

const MAX_ELAPSED_SECONDS = 24 * 60 * 60;
const MAX_MISTAKES = 10_000;

export async function postScore(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{
    puzzle_id?: number;
    elapsed_seconds?: number;
    mistakes?: number;
  }>(req);

  const puzzleId = body?.puzzle_id;
  const elapsed = body?.elapsed_seconds;
  const mistakes = body?.mistakes ?? 0;

  if (typeof puzzleId !== 'number' || !Number.isInteger(puzzleId) || puzzleId <= 0) {
    return jsonError(400, 'invalid_puzzle_id');
  }
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > MAX_ELAPSED_SECONDS) {
    return jsonError(400, 'invalid_elapsed_seconds');
  }
  if (typeof mistakes !== 'number' || !Number.isInteger(mistakes) || mistakes < 0 || mistakes > MAX_MISTAKES) {
    return jsonError(400, 'invalid_mistakes');
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
    `INSERT OR IGNORE INTO scores (user_id, puzzle_id, elapsed_seconds, mistakes, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(auth.user_id, puzzleId, Math.round(elapsed), mistakes, now)
    .run();

  // Rank is global per puzzle (count of strictly-faster scores, plus
  // earlier-completed ties). The leaderboard view filters per group; this is
  // just feedback for the submitting user.
  const stored = await env.DB.prepare(
    'SELECT elapsed_seconds, completed_at FROM scores WHERE user_id = ? AND puzzle_id = ?',
  )
    .bind(auth.user_id, puzzleId)
    .first<{ elapsed_seconds: number; completed_at: number }>();
  if (!stored) return jsonError(500, 'score_store_failed');

  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM scores
       WHERE puzzle_id = ?
         AND ( elapsed_seconds < ?
            OR (elapsed_seconds = ? AND completed_at < ?) )`,
  )
    .bind(puzzleId, stored.elapsed_seconds, stored.elapsed_seconds, stored.completed_at)
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

  const result = await env.DB.prepare(
    `SELECT u.display_name, s.elapsed_seconds, s.completed_at
       FROM scores s
       JOIN group_members gm ON gm.user_id = s.user_id
       JOIN users u ON u.id = s.user_id
      WHERE gm.group_id = ? AND s.puzzle_id = ?
      ORDER BY s.elapsed_seconds ASC, s.completed_at ASC`,
  )
    .bind(groupId, puzzleId)
    .all<{ display_name: string | null; elapsed_seconds: number; completed_at: number }>();

  const rows = (result.results ?? []).map((r, i) => ({
    display_name: r.display_name,
    elapsed_seconds: r.elapsed_seconds,
    completed_at: r.completed_at,
    rank: i + 1,
  }));
  return jsonOk(rows);
}
