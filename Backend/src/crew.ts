// Personal crews (Nov 2026): the people you're connected to, one pair at a
// time (table `connections`, a < b). Your crew sees your finished games,
// can see you're playing and ask to watch; nobody else's friends are shared.
//
//   GET    /v1/me/invite         → { code }   your invite code (made on first use)
//   POST   /v1/crew/join {code}  → { name, status }  ask to join whoever's code it is
//                                     status: 'requested' | 'connected' (they'd asked you too) | 'already'
//   POST   /v1/crew/requests/:userId/accept    accept someone's request
//   DELETE /v1/crew/requests/:userId           ignore it (never announced: they still see "waiting")
//   DELETE /v1/crew/:userId                    remove someone from your crew (both ways)
//   POST   /v1/crew/introduce {a, b}          introduce two people in my crew (both must accept;
//                                     silently does nothing if they're already connected)
//   PUT    /v1/crew/notes/:userId {note}       my private note on someone ("" clears it)

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
  const name = who.display_name ?? 'your friend';
  if (await areConnected(env, auth.user_id, who.id)) return jsonOk({ name, status: 'already' });
  // They'd already asked to join my crew: that's both of us saying yes.
  const theyAsked = await env.DB.prepare('SELECT via FROM crew_requests WHERE from_user = ? AND to_user = ?')
    .bind(who.id, auth.user_id)
    .first<{ via: string | null }>();
  if (theyAsked?.via) {
    // We'd been introduced: opening their link is my yes to it. Connect only if they've said yes too.
    await env.DB.prepare('UPDATE crew_requests SET accepted = 1, ignored = 0 WHERE from_user = ? AND to_user = ?').bind(who.id, auth.user_id).run();
    const theirs = await env.DB.prepare('SELECT accepted FROM crew_requests WHERE from_user = ? AND to_user = ?')
      .bind(auth.user_id, who.id)
      .first<{ accepted: number }>();
    if (theirs?.accepted !== 1) return jsonOk({ name, status: 'requested' });
  }
  if (theyAsked) {
    await connect(env, auth.user_id, who.id);
    await clearRequests(env, auth.user_id, who.id);
    return jsonOk({ name, status: 'connected' });
  }
  // Ask them. A stuck loop or a link passed round widely can't pile up requests.
  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM crew_requests WHERE to_user = ? AND ignored = 0')
    .bind(who.id)
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= 50) return jsonError(429, 'too_many_requests');
  await env.DB.prepare('INSERT OR IGNORE INTO crew_requests (from_user, to_user, created_at) VALUES (?, ?, ?)')
    .bind(auth.user_id, who.id, Date.now())
    .run();
  return jsonOk({ name, status: 'requested' });
}

async function clearRequests(env: Env, x: string, y: string): Promise<void> {
  await env.DB.prepare('DELETE FROM crew_requests WHERE (from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1)')
    .bind(x, y)
    .run();
}

export async function acceptRequest(req: Request, env: Env, from: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const me = auth.user_id;
  const asked = await env.DB.prepare('SELECT via FROM crew_requests WHERE from_user = ? AND to_user = ?')
    .bind(from, me)
    .first<{ via: string | null }>();
  if (!asked) return jsonError(404, 'no_request');
  if (asked.via) {
    // An introduction: my yes is recorded; we connect once they've said yes too.
    await env.DB.prepare('UPDATE crew_requests SET accepted = 1, ignored = 0 WHERE from_user = ? AND to_user = ?').bind(from, me).run();
    const theirs = await env.DB.prepare('SELECT accepted, via FROM crew_requests WHERE from_user = ? AND to_user = ?')
      .bind(me, from)
      .first<{ accepted: number; via: string | null }>();
    // The other row is theirs to answer: only their accepting it is a yes.
    if (!theirs || theirs.accepted !== 1) return jsonOk({ status: 'waiting' });
  }
  await connect(env, me, from);
  await clearRequests(env, me, from);
  return jsonOk({ status: 'connected' });
}

export async function ignoreRequest(req: Request, env: Env, from: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  // Kept, not deleted: the asker keeps seeing "waiting", so they're never told.
  await env.DB.prepare('UPDATE crew_requests SET ignored = 1 WHERE from_user = ? AND to_user = ?').bind(from, auth.user_id).run();
  return new Response(null, { status: 204 });
}

/** Requests waiting on me, and the ones I've sent that are still waiting. */
export async function requestsFor(env: Env, me: string) {
  const [incoming, outgoing] = await Promise.all([
    env.DB.prepare(
      `SELECT r.from_user AS id, u.display_name, r.created_at, r.via, v.display_name AS via_name
       FROM crew_requests r JOIN users u ON u.id = r.from_user LEFT JOIN users v ON v.id = r.via
       WHERE r.to_user = ? AND r.ignored = 0 AND r.accepted = 0 ORDER BY r.created_at`,
    )
      .bind(me)
      .all<{ id: string; display_name: string | null; created_at: number; via: string | null; via_name: string | null }>(),
    env.DB.prepare(
      // An introduction only counts as "waiting on them" once I've said yes to it.
      `SELECT r.to_user AS id, u.display_name FROM crew_requests r JOIN users u ON u.id = r.to_user
       WHERE r.from_user = ?1 AND (r.via IS NULL OR EXISTS (
         SELECT 1 FROM crew_requests x WHERE x.from_user = r.to_user AND x.to_user = ?1 AND x.accepted = 1))
       ORDER BY r.created_at`,
    )
      .bind(me)
      .all<{ id: string; display_name: string | null }>(),
  ]);
  return {
    requests: incoming.results.map((r) => ({
      id: r.id,
      name: r.display_name ?? 'Someone',
      at: r.created_at,
      via: r.via ? (r.via_name ?? 'A friend') : null,
    })),
    waiting: outgoing.results.map((r) => ({ id: r.id, name: r.display_name ?? 'Someone' })),
  };
}

export async function removeFromCrew(req: Request, env: Env, other: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const [a, b] = auth.user_id < other ? [auth.user_id, other] : [other, auth.user_id];
  await env.DB.prepare('DELETE FROM connections WHERE a = ? AND b = ?').bind(a, b).run();
  return new Response(null, { status: 204 });
}

/** My private notes on people, keyed by their id. Nobody else ever sees these. */
export async function notesFor(env: Env, me: string): Promise<Record<string, string>> {
  const r = await env.DB.prepare('SELECT about, note FROM crew_notes WHERE owner = ?').bind(me).all<{ about: string; note: string }>();
  return Object.fromEntries(r.results.map((n) => [n.about, n.note]));
}

export async function putNote(req: Request, env: Env, about: string): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const me = auth.user_id;
  const body = await readJson<{ note?: unknown }>(req);
  if (typeof body?.note !== 'string') return jsonError(400, 'missing_note');
  const note = body.note.trim().slice(0, 200);
  if (!note) {
    await env.DB.prepare('DELETE FROM crew_notes WHERE owner = ? AND about = ?').bind(me, about).run();
    return new Response(null, { status: 204 });
  }
  // Only people you're connected to, or who you've asked / who asked you.
  const known =
    (await areConnected(env, me, about)) ||
    !!(await env.DB.prepare('SELECT 1 FROM crew_requests WHERE (from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1)')
      .bind(me, about)
      .first());
  if (!known) return jsonError(404, 'not_in_crew');
  await env.DB.prepare(
    'INSERT INTO crew_notes (owner, about, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner, about) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at',
  )
    .bind(me, about, note, Date.now())
    .run();
  return new Response(null, { status: 204 });
}

/**
 * Introduce two people in my crew to each other. Each gets "Derek introduced
 * you to Tim" and they connect only if both accept. If they're already
 * connected nothing happens — and the reply is the same either way, so the
 * introducer never learns who's connected to whom.
 */
export async function introduce(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const me = auth.user_id;
  const body = await readJson<{ a?: unknown; b?: unknown }>(req);
  const a = typeof body?.a === 'string' ? body.a : '';
  const b = typeof body?.b === 'string' ? body.b : '';
  if (!a || !b || a === b || a === me || b === me) return jsonError(400, 'bad_pair');
  if (!(await areConnected(env, me, a)) || !(await areConnected(env, me, b))) return jsonError(404, 'not_in_crew');
  if (!(await areConnected(env, a, b))) {
    const now = Date.now();
    // OR IGNORE: an existing request between them (or one they ignored) stays as it is.
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO crew_requests (from_user, to_user, created_at, via) VALUES (?, ?, ?, ?)').bind(a, b, now, me),
      env.DB.prepare('INSERT OR IGNORE INTO crew_requests (from_user, to_user, created_at, via) VALUES (?, ?, ?, ?)').bind(b, a, now, me),
    ]);
  }
  return new Response(null, { status: 204 });
}
