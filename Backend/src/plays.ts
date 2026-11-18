// The crew feed (Nov 2026): what friends in your groups have just finished,
// how much they enjoyed it and whether they learnt something — so others get
// curious and try the same board. Deliberately not competitive: no times,
// no ranking. Favourites are the boards the crew loved most.
//
//   POST /v1/plays          record a finished game     → { id, ref }
//   PUT  /v1/plays/:id      rate it (enjoyment, learnt)
//   GET  /v1/crew           { feed, favourites } for the signed-in player

import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { ensureSharedName } from './shared';

const MODES = ['daily', 'past_daily', 'practice', 'shared', 'coop'];
const DAY = 24 * 60 * 60 * 1000;
const TECHNIQUE_RE = /^[a-zA-Z]{2,40}$/;

export async function postPlay(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<{
    mode?: unknown;
    difficulty?: unknown;
    puzzle_id?: unknown;
    givens?: unknown;
    techniques?: unknown;
    completed_at?: unknown;
  }>(req);
  const mode = typeof body?.mode === 'string' && MODES.includes(body.mode) ? body.mode : null;
  const difficulty = typeof body?.difficulty === 'string' ? body.difficulty : '';
  if (!mode) return jsonError(400, 'invalid_mode');

  let ref: string | null = null;
  if (mode === 'daily' || mode === 'past_daily') {
    const id = body?.puzzle_id;
    if (!Number.isInteger(id)) return jsonError(400, 'invalid_puzzle');
    const row = await env.DB.prepare('SELECT difficulty FROM daily_puzzles WHERE puzzle_id = ?')
      .bind(id)
      .first<{ difficulty: string }>();
    if (!row) return jsonError(400, 'invalid_puzzle');
    ref = `d:${id}`;
  } else {
    const name = await ensureSharedName(env, auth.user_id, body?.givens, difficulty);
    if (!name) return jsonError(400, 'invalid_puzzle');
    ref = `s:${name}`;
  }

  const techniques = Array.isArray(body?.techniques)
    ? [...new Set((body!.techniques as unknown[]).filter((t): t is string => typeof t === 'string' && TECHNIQUE_RE.test(t)))].slice(0, 12)
    : [];
  const now = Date.now();
  const at = typeof body?.completed_at === 'number' && body.completed_at > now - 7 * DAY && body.completed_at <= now + 60_000
    ? Math.round(body.completed_at)
    : now;

  // INSERT OR IGNORE + select: a retried post gets the same row back.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO plays (user_id, puzzle_ref, mode, difficulty, techniques, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(auth.user_id, ref, mode, difficulty || 'medium', techniques.length ? JSON.stringify(techniques) : null, at)
    .run();
  const row = await env.DB.prepare('SELECT id FROM plays WHERE user_id = ? AND puzzle_ref = ? AND completed_at = ?')
    .bind(auth.user_id, ref, at)
    .first<{ id: number }>();
  return jsonOk({ id: row!.id, ref }, 201);
}

export async function ratePlay(req: Request, env: Env, id: number): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<{ enjoyment?: unknown; learnt?: unknown }>(req);
  const enjoyment = body?.enjoyment === null ? null : Number(body?.enjoyment);
  const learnt = body?.learnt === null ? null : body?.learnt === true ? 1 : body?.learnt === false ? 0 : undefined;
  const sets: string[] = [];
  const vals: (number | null)[] = [];
  if (body && 'enjoyment' in body) {
    if (enjoyment !== null && ![1, 2, 3].includes(enjoyment)) return jsonError(400, 'invalid_enjoyment');
    sets.push('enjoyment = ?');
    vals.push(enjoyment);
  }
  if (learnt !== undefined) {
    sets.push('learnt = ?');
    vals.push(learnt);
  }
  if (!sets.length) return jsonError(400, 'nothing_to_change');
  const res = await env.DB.prepare(`UPDATE plays SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals, id, auth.user_id)
    .run();
  if (!res.meta.changes) return jsonError(404, 'not_found');
  return new Response(null, { status: 204 });
}

interface PlayRow {
  id: number;
  user_id: string;
  display_name: string | null;
  puzzle_ref: string;
  mode: string;
  difficulty: string;
  techniques: string | null;
  enjoyment: number | null;
  learnt: number | null;
  completed_at: number;
}

export async function getCrew(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const me = auth.user_id;
  const now = Date.now();
  const crewSql = `SELECT DISTINCT gm2.user_id FROM group_members gm1
                   JOIN group_members gm2 ON gm2.group_id = gm1.group_id WHERE gm1.user_id = ?`;

  const [feedRes, favRes, mineRes, myScores] = await Promise.all([
    env.DB.prepare(
      `SELECT p.*, u.display_name FROM plays p JOIN users u ON u.id = p.user_id
       WHERE p.user_id IN (${crewSql}) AND p.user_id != ? AND p.completed_at > ?
       ORDER BY p.completed_at DESC LIMIT 40`,
    )
      .bind(me, me, now - 14 * DAY)
      .all<PlayRow>(),
    // Favourites include your own ratings: it's the crew's taste, you're in the crew.
    env.DB.prepare(
      `SELECT p.puzzle_ref, MAX(p.difficulty) AS difficulty, MAX(p.completed_at) AS last_at,
              COUNT(p.enjoyment) AS ratings, SUM(p.enjoyment = 3) AS loved, AVG(p.enjoyment) AS avg,
              SUM(p.learnt = 1) AS learnt, COUNT(DISTINCT p.user_id) AS players,
              GROUP_CONCAT(DISTINCT COALESCE(u.display_name, 'Someone')) AS names
       FROM plays p JOIN users u ON u.id = p.user_id
       WHERE p.user_id IN (${crewSql}) AND p.completed_at > ?
       GROUP BY p.puzzle_ref HAVING COUNT(p.enjoyment) > 0 AND AVG(p.enjoyment) >= 2
       ORDER BY loved DESC, avg DESC, last_at DESC LIMIT 12`,
    )
      .bind(me, now - 60 * DAY)
      .all<{ puzzle_ref: string; difficulty: string; last_at: number; ratings: number; loved: number; avg: number; learnt: number; players: number; names: string }>(),
    env.DB.prepare('SELECT DISTINCT puzzle_ref FROM plays WHERE user_id = ?').bind(me).all<{ puzzle_ref: string }>(),
    env.DB.prepare('SELECT puzzle_id FROM scores WHERE user_id = ?').bind(me).all<{ puzzle_id: number }>(),
  ]);

  const done = new Set(mineRes.results.map((r) => r.puzzle_ref));
  for (const s of myScores.results) done.add(`d:${s.puzzle_id}`);
  const where = (ref: string) =>
    ref.startsWith('d:') ? { puzzle_id: Number(ref.slice(2)), name: null } : { puzzle_id: null, name: ref.slice(2) };

  return jsonOk({
    feed: feedRes.results.map((p) => ({
      id: p.id,
      who: p.display_name ?? 'Someone',
      ...where(p.puzzle_ref),
      mode: p.mode,
      difficulty: p.difficulty,
      techniques: p.techniques ? (JSON.parse(p.techniques) as string[]) : [],
      enjoyment: p.enjoyment,
      learnt: p.learnt === null ? null : p.learnt === 1,
      completed_at: p.completed_at,
      done: done.has(p.puzzle_ref),
    })),
    favourites: favRes.results.map((f) => ({
      ...where(f.puzzle_ref),
      difficulty: f.difficulty,
      ratings: f.ratings,
      loved: f.loved,
      learnt: f.learnt,
      players: f.players,
      names: f.names.split(','),
      last_at: f.last_at,
      done: done.has(f.puzzle_ref),
    })),
  });
}
