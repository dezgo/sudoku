// GET /v1/watch/:userId/ws?token=&role=host|watcher — opens the live watch
// relay (watch-room.ts). The host must be that user; a watcher must share a
// crew with them. Whether the host lets them watch is up to the host's phone.

import type { Env } from './types';
import { jsonError } from './http';
import { requireAuth } from './auth';

export async function connectWatch(req: Request, env: Env, hostId: string, token: string | null, role: string | null): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return jsonError(426, 'expected_websocket');
  const auth = await requireAuth(new Request(req.url, { headers: { authorization: `Bearer ${token ?? ''}` } }), env);
  if (auth instanceof Response) return auth;
  const asHost = role === 'host';
  if (asHost && auth.user_id !== hostId) return jsonError(403, 'not_you');
  if (!asHost) {
    if (auth.user_id === hostId) return jsonError(400, 'cant_watch_yourself');
    const shared = await env.DB.prepare(
      `SELECT 1 FROM group_members a JOIN group_members b ON a.group_id = b.group_id
       WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`,
    )
      .bind(auth.user_id, hostId)
      .first();
    if (!shared) return jsonError(403, 'not_in_your_crew');
  }
  const u = await env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(auth.user_id).first<{ display_name: string | null }>();
  const headers = new Headers(req.headers);
  headers.set('x-role', asHost ? 'host' : 'watcher');
  headers.set('x-user-id', auth.user_id);
  headers.set('x-user-name', u?.display_name ?? '');
  const stub = env.WATCH.get(env.WATCH.idFromName(hostId));
  return stub.fetch(new Request(req.url, { headers }));
}
