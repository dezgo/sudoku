import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';

const MAX_DISPLAY_NAME = 32;

export async function getMe(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare('SELECT id, display_name FROM users WHERE id = ?')
    .bind(auth.user_id)
    .first<{ id: string; display_name: string | null }>();
  if (!row) return jsonError(404, 'user_not_found');

  return jsonOk({ user: row });
}

export async function putMe(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ display_name?: string }>(req);
  const displayName = body?.display_name?.trim();
  if (!displayName) return jsonError(400, 'missing_display_name');
  if (displayName.length > MAX_DISPLAY_NAME) return jsonError(400, 'display_name_too_long');

  await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
    .bind(displayName, auth.user_id)
    .run();

  return jsonOk({ user: { id: auth.user_id, display_name: displayName } });
}

/// Hard-delete this user and every row tied to them. Required by App Store
/// Guideline 5.1.1(v) — apps that support account creation must offer
/// in-app account deletion. The /delete-account web page stays as a
/// no-network fallback, but in-app is what Apple actually checks for.
export async function deleteMe(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  const userId = auth.user_id;

  const userRow = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string }>();

  // Order matters only loosely (no enforced FKs), but go child→parent so
  // any future FK additions don't trip over orphaned references.
  const stmts = [
    env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM group_members WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM multiplayer_moves WHERE player_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM multiplayer_forfeits WHERE player_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM multiplayer_players WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM push_tokens WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ];
  if (userRow?.email) {
    stmts.push(
      env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(userRow.email),
    );
  }
  await env.DB.batch(stmts);

  // Note: groups the user *created* are intentionally preserved. Other
  // members may still rely on them; only the creator's `created_by`
  // reference is left dangling, which the app tolerates (the column is
  // never read user-facing). Multiplayer games this user started likewise
  // remain — opponents can still see history. Per Apple guidance, this
  // counts as deleting the user's data while keeping shared / collaborative
  // artefacts intact.

  return new Response(null, { status: 204 });
}

export async function getMeScores(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  // All daily scores this user has posted, joined to puzzle metadata so the
  // client can populate completed-history without a second round-trip.
  // Limited to last 365 entries — even a year of daily play is well below
  // the row cap, and protects bandwidth if a user racks up generated solves
  // (currently unscored, but future-proof anyway).
  const result = await env.DB.prepare(
    `SELECT s.puzzle_id, s.elapsed_seconds, s.mistakes, s.completed_at,
            s.hints_used, s.pencil_assists_used,
            s.highlight_mistakes_was_on, s.highlight_rules_was_on,
            d.difficulty, d.date, d.givens, d.solution
       FROM scores s
       JOIN daily_puzzles d ON d.puzzle_id = s.puzzle_id
      WHERE s.user_id = ?
      ORDER BY s.completed_at DESC
      LIMIT 365`,
  )
    .bind(auth.user_id)
    .all<{
      puzzle_id: number;
      elapsed_seconds: number;
      mistakes: number;
      completed_at: number;
      hints_used: number;
      pencil_assists_used: number;
      highlight_mistakes_was_on: number;
      highlight_rules_was_on: number;
      difficulty: string;
      date: string;
      givens: string;
      solution: string;
    }>();

  const scores = (result.results ?? []).map((r) => ({
    puzzle_id: r.puzzle_id,
    elapsed_seconds: r.elapsed_seconds,
    mistakes: r.mistakes,
    completed_at: r.completed_at,
    hints_used: r.hints_used,
    pencil_assists_used: r.pencil_assists_used,
    highlight_mistakes_was_on: r.highlight_mistakes_was_on === 1,
    highlight_rules_was_on: r.highlight_rules_was_on === 1,
    difficulty: r.difficulty,
    date: r.date,
    givens: JSON.parse(r.givens),
    solution: JSON.parse(r.solution),
  }));
  return jsonOk({ scores });
}

export async function getMeGroups(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const result = await env.DB.prepare(
    `SELECT g.id, g.name, g.invite_code,
            (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY gm.joined_at ASC`,
  )
    .bind(auth.user_id)
    .all<{ id: string; name: string; invite_code: string; member_count: number }>();

  // invite_code is exposed to all members (not just the creator) so anyone in
  // the group can share the join code — friends-group dynamics, no privacy
  // concern at this scale.
  const rows = (result.results ?? []).map((r) => ({
    group: { id: r.id, name: r.name },
    member_count: r.member_count,
    invite_code: r.invite_code,
  }));
  return jsonOk(rows);
}
