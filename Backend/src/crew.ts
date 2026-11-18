// Personal crews (Nov 2026): the people you're connected to, one pair at a
// time (table `connections`, a < b). Your crew sees your finished games,
// can see you're playing and ask to watch; nobody else's friends are shared.
//
//   GET    /v1/me/invite         → { code }   your invite code (made on first use)
//   POST   /v1/crew/join {code}  → { name }   connect with whoever's code it is
//   DELETE /v1/crew/:userId                    remove someone from your crew (both ways)

import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { generateInviteCode } from './crypto';

/** Everyone in my crew (not including me). */
export async function crewOf(env: Env, me: string): Promise<string[]> {
  const r = await env.DB.prepare('SELECT b AS id FROM connections WHERE a = ?1 UNION SELECT a FROM connections WHERE b = ?1')
    .bind(me)
    .all<{ id: string }>();
  return r.results.map((x) => x.id);
}

export async function areConnected(env: Env, x: string, y: string): Promise<boolean> {
  const [a, b] = x < y ? [x, y] : [y, x];
  return !!(await env.DB.prepare('SELECT 1 FROM connections WHERE a = ? AND b = ?').bind(a, b).first());
}

export async function connect(env: Env, x: string, y: string): Promise<void> {
  if (x === y) return;
  const [a, b] = x < y ? [x, y] : [y, x];
  await env.DB.prepare('INSERT OR IGNORE INTO connections (a, b, created_at) VALUES (?, ?, ?)').bind(a, b, Date.now()).run();
}

/** My invite code, made the first time it's needed. Never clashes with an old group code. */
export async function inviteCodeFor(env: Env, me: string): Promise<string> {
  const row = await env.DB.prepare('SELECT invite_code FROM users WHERE id = ?').bind(me).first<{ invite_code: string | null }>();
  if (row?.invite_code) return row.invite_code;
  for (let i = 0; i < 8; i++) {
    const code = generateInviteCode();
    const clash = await env.DB.prepare(
      'SELECT 1 FROM users WHERE invite_code = ?1 UNION SELECT 1 FROM groups WHERE invite_code = ?1',
    )
      .bind(code)
      .first();
    if (clash) continue;
    await env.DB.prepare('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL').bind(code, me).run();
    const again = await env.DB.prepare('SELECT invite_code FROM users WHERE id = ?').bind(me).first<{ invite_code: string }>();
    return again!.invite_code;
  }
  throw new Error('could not make an invite code');
}

export async function getMyInvite(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  return jsonOk({ code: await inviteCodeFor(env, auth.user_id) });
}

export async function joinCrew(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<{ code?: unknown }>(req);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return jsonError(400, 'missing_code');
  // A person's own code — or an old group link, which now connects you to whoever started that group.
  const who =
    (await env.DB.prepare('SELECT id, display_name FROM users WHERE invite_code = ?')
      .bind(code)
      .first<{ id: string; display_name: string | null }>()) ??
    (await env.DB.prepare('SELECT u.id, u.display_name FROM groups g JOIN users u ON u.id = g.created_by WHERE g.invite_code = ?')
      .bind(code)
      .first<{ id: string; display_name: string | null }>());
  if (!who) return jsonError(404, 'unknown_code');
  if (who.id === auth.user_id) return jsonError(400, 'thats_you');
  await connect(env, auth.user_id, who.id);
  return jsonOk({ name: who.display_name ?? 'your friend' });
}

export async function removeFromCrew(req: Request, env: Env, other: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const [a, b] = auth.user_id < other ? [auth.user_id, other] : [other, auth.user_id];
  await env.DB.prepare('DELETE FROM connections WHERE a = ? AND b = ?').bind(a, b).run();
  return new Response(null, { status: 204 });
}
