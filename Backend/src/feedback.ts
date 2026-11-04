// Feedback from players: "I'd like X changed / added" or "Y is broken".
// Signing in is optional — if signed in we know who it is and can reply to
// their account email; otherwise they can leave an email if they want an
// answer. Saved to D1 and emailed to FEEDBACK_TO (hello@sudokucrew.com,
// which forwards to Derek), with Reply-To set so a reply goes straight back.

import type { Env } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';

const MAX_MESSAGE = 4000;
const MAX_CONTEXT = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;

export async function postFeedback(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let userId: string | null = null;
  if (req.headers.get('authorization')) {
    const auth = await requireAuth(req, env);
    if (!(auth instanceof Response)) userId = auth.user_id;
    // A stale token still lets the message through, just unattributed.
  }

  const body = await readJson<{ message?: unknown; email?: unknown; context?: unknown }>(req);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return jsonError(400, 'empty_message');
  if (message.length > MAX_MESSAGE) return jsonError(400, 'message_too_long');
  const context = typeof body?.context === 'string' ? body.context.slice(0, MAX_CONTEXT) : null;

  // Enough for anyone with a lot to say; stops a stuck loop or a bot flooding the inbox.
  const since = Date.now() - HOUR;
  const recent = await env.DB.prepare(
    userId
      ? 'SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?'
      : 'SELECT COUNT(*) AS n FROM feedback WHERE user_id IS NULL AND created_at > ?',
  )
    .bind(...(userId ? [userId, since] : [since]))
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= (userId ? 10 : 20)) return jsonError(429, 'rate_limited');

  let name: string | null = null;
  let replyTo: string | null = null;
  if (userId) {
    const u = await env.DB.prepare('SELECT email, display_name FROM users WHERE id = ?')
      .bind(userId)
      .first<{ email: string; display_name: string | null }>();
    name = u?.display_name ?? null;
    replyTo = u?.email ?? null;
  } else if (typeof body?.email === 'string' && EMAIL_RE.test(body.email.trim())) {
    replyTo = body.email.trim().slice(0, 200);
  }

  await env.DB.prepare(
    'INSERT INTO feedback (user_id, reply_to, message, context, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, replyTo, message, context, Date.now())
    .run();

  // Email after replying — the player shouldn't wait on Resend, and the row is already saved.
  ctx.waitUntil(
    sendFeedbackEmail(env, { message, name, replyTo, context, signedIn: !!userId }).catch((err) =>
      console.error('feedback email failed', err),
    ),
  );
  return jsonOk({ ok: true }, 201);
}

async function sendFeedbackEmail(
  env: Env,
  f: { message: string; name: string | null; replyTo: string | null; context: string | null; signedIn: boolean },
): Promise<void> {
  if (!env.FEEDBACK_TO) return;
  const who = f.signedIn ? `${f.name ?? 'No display name'} (${f.replyTo ?? 'unknown email'})` : f.replyTo ? `Not signed in — left email ${f.replyTo}` : 'Not signed in, no email left';
  const firstLine = f.message.split('\n')[0]!.slice(0, 60);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.FEEDBACK_TO],
      ...(f.replyTo ? { reply_to: f.replyTo } : {}),
      subject: `Sudoku feedback from ${f.name ?? (f.signedIn ? 'a player' : 'someone')}: ${firstLine}`,
      text: `${f.message}\n\n— — —\nFrom: ${who}\n${f.context ? `Where: ${f.context}\n` : ''}${f.replyTo ? 'Reply to this email to answer them.' : "They can't be replied to."}`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}
