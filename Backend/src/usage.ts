// Usage reporting from the web app (POST /v1/usage). The app batches small
// events — opened, game started / finished, feature used — and sends them
// every so often. Signing in is optional: a valid token links the device to
// the account, a missing or stale one just records the device on its own.
// Never answers 401, because the web client treats a 401 as "signed out".
//
// Nothing here identifies a person beyond the account they chose to sign in
// with: no IP address or user-agent string is stored.

import type { Env } from './types';
import { jsonError, readJson } from './http';
import { sha256 } from './crypto';
import { dateInTimezone } from './daily';

const KINDS = new Set(['open', 'game_start', 'game_resume', 'game_finish', 'feature', 'setting', 'screen']);
const PLATFORMS = new Set(['iphone', 'ipad', 'android', 'computer']);
const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BATCH = 100;
const MAX_DETAIL = 300;
// A busy day is a few hundred events; this only stops a stuck loop or a bot.
const MAX_PER_DEVICE_DAY = 2000;
const DAY = 24 * 60 * 60 * 1000;

interface Body {
  device?: { id?: unknown; platform?: unknown; standalone?: unknown; build?: unknown };
  events?: unknown;
}

export async function postUsage(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  const deviceId = typeof body?.device?.id === 'string' ? body.device.id : '';
  if (!DEVICE_RE.test(deviceId)) return jsonError(400, 'bad_device');
  if (!Array.isArray(body?.events)) return jsonError(400, 'bad_events');

  const now = Date.now();
  const platform =
    typeof body!.device!.platform === 'string' && PLATFORMS.has(body!.device!.platform)
      ? body!.device!.platform
      : null;
  const standalone = body!.device!.standalone === true ? 1 : 0;
  const build = typeof body!.device!.build === 'string' ? body!.device!.build.slice(0, 80) : null;
  const userId = await optionalUser(req, env);

  const events: { kind: string; detail: string | null; at: number }[] = [];
  for (const e of (body!.events as unknown[]).slice(0, MAX_BATCH)) {
    if (!e || typeof e !== 'object') continue;
    const { k, at, d } = e as { k?: unknown; at?: unknown; d?: unknown };
    if (typeof k !== 'string' || !KINDS.has(k)) continue;
    // Events queued offline can be days old; anything outside a week (or from
    // a clock set in the future) is stamped with the time it arrived.
    const t = typeof at === 'number' && at > now - 7 * DAY && at < now + 5 * 60 * 1000 ? Math.round(at) : now;
    let detail: string | null = null;
    if (d && typeof d === 'object') {
      const s = JSON.stringify(d);
      if (s.length <= MAX_DETAIL) detail = s;
    }
    events.push({ kind: k, detail, at: t });
  }

  const today = dateInTimezone(new Date(now), env.DAILY_TIMEZONE);
  const sofar = await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_events WHERE device_id = ? AND day = ?')
    .bind(deviceId, today)
    .first<{ n: number }>();
  const room = Math.max(0, MAX_PER_DEVICE_DAY - (sofar?.n ?? 0));

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO devices (device_id, user_id, platform, standalone, build, first_seen_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(device_id) DO UPDATE SET
         user_id = COALESCE(?2, devices.user_id),
         platform = COALESCE(?3, devices.platform),
         standalone = ?4,
         build = COALESCE(?5, devices.build),
         last_seen_at = ?6`,
    ).bind(deviceId, userId, platform, standalone, build, now),
  ];
  for (const e of events.slice(0, room)) {
    stmts.push(
      env.DB.prepare(
        'INSERT INTO usage_events (device_id, user_id, kind, detail, day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(deviceId, userId, e.kind, e.detail, dateInTimezone(new Date(e.at), env.DAILY_TIMEZONE), e.at),
    );
  }
  if (userId) stmts.push(env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, userId));
  await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
}

async function optionalUser(req: Request, env: Env): Promise<string | null> {
  const header = req.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const row = await env.DB.prepare('SELECT user_id FROM auth_tokens WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Raw events are only useful for a year or so; the weekly cron trims older ones. */
export async function pruneUsage(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM usage_events WHERE created_at < ?')
    .bind(Date.now() - 400 * DAY)
    .run();
}
