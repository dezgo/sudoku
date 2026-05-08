import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { generateGroupId, generateInviteCode } from './crypto';

const MAX_GROUP_NAME = 64;
const MAX_INVITE_GENERATION_ATTEMPTS = 8;

export async function createGroup(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ name?: string }>(req);
  const name = body?.name?.trim();
  if (!name) return jsonError(400, 'missing_name');
  if (name.length > MAX_GROUP_NAME) return jsonError(400, 'name_too_long');

  // Try a few invite codes in case of (extremely unlikely) collision. ~1B
  // possibilities with 6-char base32; collisions become a real concern only
  // at hundreds of thousands of groups.
  let inviteCode: string | null = null;
  for (let i = 0; i < MAX_INVITE_GENERATION_ATTEMPTS; i++) {
    const candidate = generateInviteCode();
    const existing = await env.DB.prepare('SELECT 1 FROM groups WHERE invite_code = ?')
      .bind(candidate)
      .first();
    if (!existing) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) return jsonError(500, 'invite_code_collision');

  const groupId = generateGroupId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(groupId, name, inviteCode, auth.user_id, now),
    env.DB.prepare(
      'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
    ).bind(groupId, auth.user_id, now),
  ]);

  return jsonOk({ group: { id: groupId, name }, invite_code: inviteCode });
}

export async function joinGroup(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ invite_code?: string }>(req);
  const code = body?.invite_code?.trim().toUpperCase();
  if (!code) return jsonError(400, 'missing_invite_code');

  const group = await env.DB.prepare('SELECT id, name FROM groups WHERE invite_code = ?')
    .bind(code)
    .first<{ id: string; name: string }>();
  if (!group) return jsonError(404, 'unknown_invite_code');

  // INSERT OR IGNORE — re-joining is idempotent.
  await env.DB.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
  )
    .bind(group.id, auth.user_id, Date.now())
    .run();

  return jsonOk({ group });
}

export async function getGroupMembers(
  req: Request,
  env: Env,
  groupId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  // Membership check — only members can see the roster.
  const member = await env.DB.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
  )
    .bind(groupId, auth.user_id)
    .first();
  if (!member) return jsonError(403, 'not_a_member');

  // Per-member stats (all-time across every daily): how many they've solved
  // and when they last solved one. LEFT JOIN so zero-score users still appear.
  const result = await env.DB.prepare(
    `SELECT u.id,
            u.display_name,
            COUNT(s.puzzle_id)  AS dailies_completed,
            MAX(s.completed_at) AS last_completed_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN scores s ON s.user_id = u.id
      WHERE gm.group_id = ?
      GROUP BY u.id, u.display_name, gm.joined_at
      ORDER BY gm.joined_at ASC`,
  )
    .bind(groupId)
    .all<{
      id: string;
      display_name: string | null;
      dailies_completed: number;
      last_completed_at: number | null;
    }>();

  const users = (result.results ?? []).map((r) => ({
    user: { id: r.id, display_name: r.display_name },
    dailies_completed: r.dailies_completed ?? 0,
    last_completed_at: r.last_completed_at,
  }));
  return jsonOk(users);
}

export async function leaveGroup(
  req: Request,
  env: Env,
  groupId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, auth.user_id)
    .run();

  return new Response(null, { status: 204 });
}
