// Co-op games (SPEC §18): create, join, list, and the WebSocket hand-off to
// the game's live room (coop-room.ts). The puzzle comes from the creating
// phone — the web app's generator grades by technique, the server's doesn't —
// and is checked here for a unique solution, as for shared puzzles.

import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { solveUnique } from './generator';
import { randomName, SHARE_NAME_RE } from './shared';

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const MAX_PLAYERS = 4;

interface CoopRow {
  name: string;
  givens: string;
  solution: string;
  difficulty: string;
  created_by: string;
  completed_at: number | null;
  elapsed_seconds: number | null;
  mistakes: number | null;
}

async function players(env: Env, name: string) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.display_name FROM coop_players p JOIN users u ON u.id = p.user_id
      WHERE p.name = ? ORDER BY p.joined_at`,
  )
    .bind(name)
    .all<{ id: string; display_name: string | null }>();
  return results;
}

async function detail(env: Env, row: CoopRow) {
  return {
    name: row.name,
    difficulty: row.difficulty,
    givens: JSON.parse(row.givens),
    solution: JSON.parse(row.solution),
    created_by: row.created_by,
    completed_at: row.completed_at,
    elapsed_seconds: row.elapsed_seconds,
    mistakes: row.mistakes,
    players: await players(env, row.name),
  };
}

export async function createCoopGame(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<{ givens?: unknown; difficulty?: string }>(req);
  const difficulty = body?.difficulty;
  if (!difficulty || !DIFFICULTIES.includes(difficulty)) return jsonError(400, 'invalid_difficulty');
  const solution = solveUnique(body?.givens);
  if (!solution) return jsonError(400, 'invalid_puzzle');

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = randomName();
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO coop_games (name, givens, solution, difficulty, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(name, JSON.stringify(body!.givens), JSON.stringify(solution), difficulty, auth.user_id, now)
      .run();
    if (res.meta.changes !== 1) continue;
    await env.DB.prepare('INSERT INTO coop_players (name, user_id, joined_at) VALUES (?, ?, ?)')
      .bind(name, auth.user_id, now)
      .run();
    return jsonOk({ name }, 201);
  }
  return jsonError(500, 'name_collision');
}

/** Join (idempotent) and return the game. Full games only let existing players back in. */
export async function joinCoopGame(req: Request, env: Env, name: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  if (!SHARE_NAME_RE.test(name)) return jsonError(404, 'not_found');
  const row = await env.DB.prepare('SELECT * FROM coop_games WHERE name = ?').bind(name).first<CoopRow>();
  if (!row) return jsonError(404, 'not_found');
  const current = await players(env, name);
  if (!current.some((p) => p.id === auth.user_id)) {
    if (row.completed_at) return jsonError(409, 'game_finished');
    if (current.length >= MAX_PLAYERS) return jsonError(409, 'game_full');
    await env.DB.prepare('INSERT OR IGNORE INTO coop_players (name, user_id, joined_at) VALUES (?, ?, ?)')
      .bind(name, auth.user_id, Date.now())
      .run();
  }
  return jsonOk(await detail(env, row));
}

export async function listMyCoopGames(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const { results } = await env.DB.prepare(
    `SELECT g.* FROM coop_games g JOIN coop_players p ON p.name = g.name
      WHERE p.user_id = ? ORDER BY g.created_at DESC LIMIT 20`,
  )
    .bind(auth.user_id)
    .all<CoopRow>();
  const games = [];
  for (const row of results) {
    const { solution: _s, givens: _g, ...rest } = await detail(env, row);
    games.push(rest);
  }
  return jsonOk({ games });
}

/**
 * WebSocket into the game's live room. Browsers can't set headers on a
 * WebSocket, so the bearer token comes as ?token=.
 */
export async function connectCoopGame(req: Request, env: Env, name: string, token: string | null): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return jsonError(426, 'expected_websocket');
  const authed = new Request(req.url, { headers: { authorization: `Bearer ${token ?? ''}` } });
  const auth = await requireAuth(authed, env);
  if (auth instanceof Response) return auth;
  const member = await env.DB.prepare(
    `SELECT u.display_name FROM coop_players p JOIN users u ON u.id = p.user_id WHERE p.name = ? AND p.user_id = ?`,
  )
    .bind(name, auth.user_id)
    .first<{ display_name: string | null }>();
  if (!member) return jsonError(403, 'not_a_player');

  const headers = new Headers(req.headers);
  headers.set('x-coop-name', name);
  headers.set('x-user-id', auth.user_id);
  headers.set('x-user-name', member.display_name ?? '');
  const stub = env.COOP.get(env.COOP.idFromName(name));
  return stub.fetch(new Request(req.url, { headers }));
}
