// Shared puzzles (SPEC §17.5): save a starting position under a three-word
// name so a friend can open the same board at /p/<name>. Only the givens
// are shown to the friend; the solution travels with the puzzle (as for
// dailies) so their app can check mistakes and spot the finish.

import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { solveUnique } from './generator';
import { NAME_WORDS } from './words';

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
export const SHARE_NAME_RE = /^[a-z]+-[a-z]+-[a-z]+$/;

function randomName(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => NAME_WORDS[b]!).join('-'); // 256 words: one byte each
}

export async function createSharedPuzzle(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<{ givens?: unknown; difficulty?: string; elapsed_seconds?: unknown }>(req);
  const difficulty = body?.difficulty;
  if (!difficulty || !DIFFICULTIES.includes(difficulty)) return jsonError(400, 'invalid_difficulty');
  const solution = solveUnique(body?.givens);
  if (!solution) return jsonError(400, 'invalid_puzzle');
  const givens = JSON.stringify(body!.givens);
  const secs = body?.elapsed_seconds;
  const sharerSeconds = Number.isInteger(secs) && (secs as number) > 0 ? (secs as number) : null;

  const existing = await env.DB.prepare('SELECT name FROM shared_puzzles WHERE givens = ? AND created_by = ?')
    .bind(givens, auth.user_id)
    .first<{ name: string }>();
  if (existing) {
    // Shared mid-game earlier, finished since: record the time now.
    if (sharerSeconds !== null) {
      await env.DB.prepare('UPDATE shared_puzzles SET sharer_seconds = ? WHERE name = ?')
        .bind(sharerSeconds, existing.name)
        .run();
    }
    return jsonOk({ name: existing.name });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const name = randomName();
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO shared_puzzles
         (name, givens, solution, difficulty, created_by, sharer_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(name, givens, JSON.stringify(solution), difficulty, auth.user_id, sharerSeconds, Date.now())
      .run();
    if (res.meta.changes === 1) return jsonOk({ name }, 201);
  }
  return jsonError(500, 'name_collision');
}

export async function getSharedPuzzle(env: Env, name: string): Promise<Response> {
  if (!SHARE_NAME_RE.test(name)) return jsonError(404, 'not_found');
  const row = await env.DB.prepare(
    `SELECT s.name, s.givens, s.solution, s.difficulty, s.sharer_seconds, u.display_name
       FROM shared_puzzles s JOIN users u ON u.id = s.created_by
      WHERE s.name = ?`,
  )
    .bind(name)
    .first<{
      name: string;
      givens: string;
      solution: string;
      difficulty: string;
      sharer_seconds: number | null;
      display_name: string | null;
    }>();
  if (!row) return jsonError(404, 'not_found');
  return jsonOk({
    name: row.name,
    difficulty: row.difficulty,
    givens: JSON.parse(row.givens),
    solution: JSON.parse(row.solution),
    shared_by: row.display_name,
    sharer_seconds: row.sharer_seconds,
  });
}
