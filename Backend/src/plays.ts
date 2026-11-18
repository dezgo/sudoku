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
import { addDays, dateInTimezone } from './daily';

const MODES = ['daily', 'past_daily', 'practice', 'shared', 'coop'];
const DAY = 24 * 60 * 60 * 1000;
const TECHNIQUE_RE = /^[a-zA-Z]{2,40}$/;

const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Who a play belongs to: the signed-in account, or — for someone playing
 * without an account — 'anon:<device id>'. Anonymous plays never appear in a
 * crew (they belong to no group); they only add to the anonymous counts and
 * "Most loved this week".
 */
async function owner(req: Request, env: Env, deviceId: unknown): Promise<{ id: string; anon: boolean } | Response> {
  if (req.headers.get('authorization')) {
    const auth = await requireAuth(req, env);
    if (auth instanceof Response) return auth;
    return { id: auth.user_id, anon: false };
  }
  if (typeof deviceId === 'string' && DEVICE_RE.test(deviceId)) return { id: `anon:${deviceId}`, anon: true };
  return jsonError(401, 'unauthenticated');
}

export async function postPlay(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    device_id?: unknown;
    mode?: unknown;
    difficulty?: unknown;
    puzzle_id?: unknown;
    givens?: unknown;
    techniques?: unknown;
    completed_at?: unknown;
  }>(req);
  const who = await owner(req, env, body?.device_id);
  if (who instanceof Response) return who;
  const auth = { user_id: who.id };
  const mode = typeof body?.mode === 'string' && MODES.includes(body.mode) ? body.mode : null;
  const difficulty = typeof body?.difficulty === 'string' ? body.difficulty : '';
  if (!mode) return jsonError(400, 'invalid_mode');
  if (who.anon) {
    // No account to answer for: cap a device at a busy day's worth.
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM plays WHERE user_id = ? AND completed_at > ?')
      .bind(who.id, Date.now() - DAY)
      .first<{ n: number }>();
    if ((n?.n ?? 0) >= 100) return jsonError(429, 'rate_limited');
  }

  let ref: string | null = null;
  if (mode === 'daily' || mode === 'past_daily') {
    const id = body?.puzzle_id;
    if (!Number.isInteger(id)) return jsonError(400, 'invalid_puzzle');
    const row = await env.DB.prepare('SELECT difficulty FROM daily_puzzles WHERE puzzle_id = ?')
      .bind(id)
      .first<{ difficulty: string }>();
    if (!row) return jsonError(400, 'invalid_puzzle');
    ref = `d:${id}`;
  } else if (who.anon) {
    // Without an account we can't make a new shared name (it needs an owner),
    // so only boards that already have one — e.g. opened from a share link — count.
    const row = await env.DB.prepare('SELECT name FROM shared_puzzles WHERE givens = ? ORDER BY created_at LIMIT 1')
      .bind(JSON.stringify(body?.givens))
      .first<{ name: string }>();
    if (!row) return jsonOk({ id: null, ref: null });
    ref = `s:${row.name}`;
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
  const body = await readJson<{ enjoyment?: unknown; learnt?: unknown; device_id?: unknown }>(req);
  const who = await owner(req, env, body?.device_id);
  if (who instanceof Response) return who;
  const auth = { user_id: who.id };
  const enjoyment = body?.enjoyment === null ? null : Number(body?.enjoyment);
  const learnt = body?.learnt === null ? null : body?.learnt === true ? 1 : body?.learnt === false ? 0 : undefined;
  const sets: string[] = [];
  const vals: (number | null)[] = [];
  if (body && 'enjoyment' in body && body.enjoyment !== undefined) {
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
       WHERE p.user_id IN (${crewSql}) AND p.completed_at > ?
       ORDER BY p.completed_at DESC LIMIT 40`,
    )
      .bind(me, now - 14 * DAY)
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

  // Dailies finished before the feed existed (or by players on the old store
  // apps) are already in `scores` and already visible to the group on the
  // leaderboard, so show those too — with no rating, and no time.
  const crewScores = await env.DB.prepare(
    `SELECT s.user_id, s.puzzle_id, s.completed_at, d.difficulty, u.display_name
     FROM scores s JOIN users u ON u.id = s.user_id JOIN daily_puzzles d ON d.puzzle_id = s.puzzle_id
     WHERE s.user_id IN (${crewSql}) AND s.completed_at > ?
     ORDER BY s.completed_at DESC LIMIT 60`,
  )
    .bind(me, now - 14 * DAY)
    .all<{ user_id: string; puzzle_id: number; completed_at: number; difficulty: string; display_name: string | null }>();
  const posted = new Set(feedRes.results.map((p) => `${p.user_id}|${p.puzzle_ref}`));

  const done = new Set(mineRes.results.map((r) => r.puzzle_ref));
  for (const s of myScores.results) done.add(`d:${s.puzzle_id}`);
  const where = (ref: string) =>
    ref.startsWith('d:') ? { puzzle_id: Number(ref.slice(2)), name: null } : { puzzle_id: null, name: ref.slice(2) };

  const fromScores = crewScores.results
    .filter((sc) => !posted.has(`${sc.user_id}|d:${sc.puzzle_id}`))
    .map((sc) => ({
      id: `s${sc.puzzle_id}-${sc.user_id}`,
      who: sc.display_name ?? 'Someone',
      you: sc.user_id === me,
      puzzle_id: sc.puzzle_id,
      name: null,
      mode: 'daily',
      difficulty: sc.difficulty,
      techniques: [] as string[],
      enjoyment: null,
      learnt: null,
      completed_at: sc.completed_at,
      done: done.has(`d:${sc.puzzle_id}`),
    }));

  return jsonOk({
    groups: await crewGroups(env, me),
    feed: [...feedRes.results.map((p) => ({
      id: String(p.id),
      who: p.display_name ?? 'Someone',
      you: p.user_id === me,
      ...where(p.puzzle_ref),
      mode: p.mode,
      difficulty: p.difficulty,
      techniques: p.techniques ? (JSON.parse(p.techniques) as string[]) : [],
      enjoyment: p.enjoyment,
      learnt: p.learnt === null ? null : p.learnt === 1,
      completed_at: p.completed_at,
      done: done.has(p.puzzle_ref),
    })), ...fromScores]
      .sort((a, b) => b.completed_at - a.completed_at)
      .slice(0, 40),
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

/**
 * Each of my groups with its members and the days each played this week —
 * for the "Your crew" screen. A day counts if they finished a daily or any
 * other game (from `scores` and `plays`).
 */
async function crewGroups(env: Env, me: string) {
  const tz = env.DAILY_TIMEZONE;
  const today = dateInTimezone(new Date(), tz);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const since = Date.now() - 8 * DAY;
  const [groups, members, sc, pl] = await Promise.all([
    env.DB.prepare(
      `SELECT g.id, g.name, g.invite_code, g.created_by FROM groups g JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ? ORDER BY m.joined_at`,
    )
      .bind(me)
      .all<{ id: string; name: string; invite_code: string; created_by: string }>(),
    env.DB.prepare(
      `SELECT m.group_id, m.user_id, u.display_name,
              MAX(COALESCE((SELECT MAX(completed_at) FROM scores s WHERE s.user_id = m.user_id), 0),
                  COALESCE((SELECT MAX(completed_at) FROM plays p WHERE p.user_id = m.user_id), 0)) AS last_at
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)`,
    )
      .bind(me)
      .all<{ group_id: string; user_id: string; display_name: string | null; last_at: number }>(),
    env.DB.prepare(
      `SELECT user_id, completed_at FROM scores WHERE completed_at > ? AND user_id IN
         (SELECT gm2.user_id FROM group_members gm1 JOIN group_members gm2 ON gm2.group_id = gm1.group_id WHERE gm1.user_id = ?)`,
    )
      .bind(since, me)
      .all<{ user_id: string; completed_at: number }>(),
    env.DB.prepare(
      `SELECT user_id, completed_at FROM plays WHERE completed_at > ? AND user_id IN
         (SELECT gm2.user_id FROM group_members gm1 JOIN group_members gm2 ON gm2.group_id = gm1.group_id WHERE gm1.user_id = ?)`,
    )
      .bind(since, me)
      .all<{ user_id: string; completed_at: number }>(),
  ]);
  const played = new Map<string, Set<string>>();
  for (const r of [...sc.results, ...pl.results]) {
    if (!played.has(r.user_id)) played.set(r.user_id, new Set());
    played.get(r.user_id)!.add(dateInTimezone(new Date(r.completed_at), tz));
  }
  return groups.results.map((g) => ({
    id: g.id,
    name: g.name,
    invite_code: g.invite_code,
    can_rename: g.created_by === me,
    days,
    members: members.results
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        name: m.display_name ?? 'Someone',
        you: m.user_id === me,
        played: days.filter((d) => played.get(m.user_id)?.has(d)),
        last_at: m.last_at || null,
      }))
      .sort((a, b) => Number(b.you) - Number(a.you) || b.played.length - a.played.length || (b.last_at ?? 0) - (a.last_at ?? 0)),
  }));
}

// --- Everyone (anonymous) ----------------------------------------------------

/**
 * POST /v1/pulse { device_id, playing } — the heartbeat behind "playing right
 * now". Returns the live counts: other devices with a game running in the
 * last two and a half minutes, and how many people have solved today's daily.
 * No names, ever.
 */
export async function postPulse(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ device_id?: unknown; playing?: unknown; visible?: unknown; watchable?: unknown }>(req);
  const device = typeof body?.device_id === 'string' && DEVICE_RE.test(body.device_id) ? body.device_id : null;
  const now = Date.now();
  // Signed in: link the heartbeat to the account, so the crew can see "Ash is playing now".
  let me: string | null = null;
  if (req.headers.get('authorization')) {
    const auth = await requireAuth(req, env);
    if (!(auth instanceof Response)) me = auth.user_id;
  }
  if (device)
    await env.DB.prepare(
      `INSERT INTO presence (device_id, playing, at, user_id, visible, watchable) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(device_id) DO UPDATE SET playing = ?2, at = ?3, user_id = ?4, visible = ?5, watchable = ?6`,
    )
      .bind(device, body?.playing === true ? 1 : 0, now, me, body?.visible === true ? 1 : 0, body?.watchable === true ? 1 : 0)
      .run();
  const counts = await liveCounts(env);
  const mine = device && body?.playing === true ? 1 : 0;
  // Crew-mates with a game running right now — only those who show their games to their crew.
  const crew = me
    ? (
        await env.DB.prepare(
          `SELECT p.user_id, MAX(p.watchable) AS watchable, u.display_name FROM presence p JOIN users u ON u.id = p.user_id
           WHERE p.playing = 1 AND p.visible = 1 AND p.at > ?1 AND p.user_id != ?2 AND p.user_id IN
             (SELECT gm2.user_id FROM group_members gm1 JOIN group_members gm2 ON gm2.group_id = gm1.group_id WHERE gm1.user_id = ?2)
           GROUP BY p.user_id`,
        )
          .bind(now - 150_000, me)
          .all<{ user_id: string; watchable: number; display_name: string | null }>()
      ).results.map((r) => ({ id: r.user_id, name: r.display_name ?? 'Someone', watchable: r.watchable === 1 }))
    : [];
  return jsonOk({ playing_now: Math.max(0, counts.playing - mine), solved_today: counts.solvedToday, crew_playing: crew });
}

// A minute-ish of staleness is fine and keeps a busy day cheap: each copy of
// the Worker recomputes at most every 10 seconds.
let cached: { at: number; playing: number; solvedToday: number } | null = null;

async function liveCounts(env: Env): Promise<{ playing: number; solvedToday: number }> {
  const now = Date.now();
  if (cached && now - cached.at < 10_000) return cached;
  const today = dateToId(dateInTimezone(new Date(now), env.DAILY_TIMEZONE));
  const [p, solved] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE playing = 1 AND at > ?')
      .bind(now - 150_000)
      .first<{ n: number }>(),
    // Signed-in solves are in scores; account-less ones only in plays.
    env.DB.prepare(
      `SELECT (SELECT COUNT(DISTINCT user_id) FROM scores WHERE puzzle_id = ?1)
            + (SELECT COUNT(DISTINCT user_id) FROM plays WHERE puzzle_ref = ?2 AND user_id LIKE 'anon:%') AS n`,
    )
      .bind(today, `d:${today}`)
      .first<{ n: number }>(),
  ]);
  cached = { at: now, playing: p?.n ?? 0, solvedToday: solved?.n ?? 0 };
  return cached;
}

const dateToId = (d: string) => parseInt(d.replace(/-/g, ''), 10);

/** GET /v1/everyone?device_id= — puzzles everyone loved this week, anonymously. */
export async function getEveryone(req: Request, env: Env, deviceId: string | null): Promise<Response> {
  let me: string | null = null;
  if (req.headers.get('authorization')) {
    const auth = await requireAuth(req, env);
    if (!(auth instanceof Response)) me = auth.user_id;
  }
  const anon = deviceId && DEVICE_RE.test(deviceId) ? `anon:${deviceId}` : null;
  const [fav, mine, scores] = await Promise.all([
    env.DB.prepare(
      `SELECT puzzle_ref, MAX(difficulty) AS difficulty, COUNT(enjoyment) AS ratings, SUM(enjoyment = 3) AS loved,
              AVG(enjoyment) AS avg, SUM(learnt = 1) AS learnt, COUNT(DISTINCT user_id) AS players, MAX(completed_at) AS last_at
       FROM plays WHERE completed_at > ?
       GROUP BY puzzle_ref HAVING COUNT(enjoyment) > 0 AND AVG(enjoyment) >= 2
       ORDER BY loved DESC, avg DESC, players DESC, last_at DESC LIMIT 15`,
    )
      .bind(Date.now() - 7 * DAY)
      .all<{ puzzle_ref: string; difficulty: string; ratings: number; loved: number; learnt: number; players: number; last_at: number }>(),
    env.DB.prepare('SELECT DISTINCT puzzle_ref FROM plays WHERE user_id IN (?, ?)')
      .bind(me ?? '-', anon ?? '-')
      .all<{ puzzle_ref: string }>(),
    me
      ? env.DB.prepare('SELECT puzzle_id FROM scores WHERE user_id = ?').bind(me).all<{ puzzle_id: number }>()
      : Promise.resolve({ results: [] as { puzzle_id: number }[] }),
  ]);
  const done = new Set(mine.results.map((r) => r.puzzle_ref));
  for (const s of scores.results) done.add(`d:${s.puzzle_id}`);
  const counts = await liveCounts(env);
  return jsonOk({
    playing_now: counts.playing,
    solved_today: counts.solvedToday,
    favourites: fav.results.map((f) => ({
      ...(f.puzzle_ref.startsWith('d:')
        ? { puzzle_id: Number(f.puzzle_ref.slice(2)), name: null }
        : { puzzle_id: null, name: f.puzzle_ref.slice(2) }),
      difficulty: f.difficulty,
      ratings: f.ratings,
      loved: f.loved,
      learnt: f.learnt ?? 0,
      players: f.players,
      names: [] as string[],
      last_at: f.last_at,
      done: done.has(f.puzzle_ref),
    })),
  });
}

export async function prunePresence(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM presence WHERE at < ?').bind(Date.now() - DAY).run();
}
