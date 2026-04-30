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
