import type { Env, User } from './types';
import { jsonError, jsonOk, readJson } from './http';
import {
  generateBearerToken,
  generateOtpCode,
  generateUserId,
  sha256,
} from './crypto';
import { sendOtpEmail } from './email';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function authStart(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string }>(req);
  const email = body?.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return jsonError(400, 'invalid_email');

  // Reviewer bypass: short-circuit the Resend send so app-store reviewers
  // can sign in without needing to read an email inbox. The OTP for the
  // configured email is fixed (REVIEWER_OTP_CODE) and never written to the
  // auth_codes table — authVerify checks the env var directly for that
  // email. Real users hit the normal flow below.
  if (env.REVIEWER_EMAIL && env.REVIEWER_OTP_CODE && email === env.REVIEWER_EMAIL.toLowerCase()) {
    return new Response(null, { status: 204 });
  }

  const code = generateOtpCode();
  const codeHash = await sha256(code);
  const expiresAt = Date.now() + CODE_TTL_MS;

  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email),
    env.DB.prepare(
      'INSERT INTO auth_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)',
    ).bind(email, codeHash, expiresAt),
  ]);

  await sendOtpEmail(env, email, code);
  return new Response(null, { status: 204 });
}

export async function authVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; code?: string }>(req);
  const email = body?.email?.trim().toLowerCase();
  const code = body?.code?.trim();
  if (!email || !code) return jsonError(400, 'missing_fields');

  // Reviewer bypass — see authStart for context. Mirror of the bypass
  // there: accept the configured fixed code for the configured email,
  // skipping the auth_codes table entirely and falling through to the
  // normal user/session creation below.
  const isReviewer =
    !!env.REVIEWER_EMAIL &&
    !!env.REVIEWER_OTP_CODE &&
    email === env.REVIEWER_EMAIL.toLowerCase();

  if (isReviewer) {
    if (code !== env.REVIEWER_OTP_CODE) {
      return jsonError(400, 'wrong_code');
    }
    // Fall through to user / session creation below.
  } else {
    const row = await env.DB.prepare(
      'SELECT code_hash, expires_at, attempts FROM auth_codes WHERE email = ?',
    )
      .bind(email)
      .first<{ code_hash: string; expires_at: number; attempts: number }>();

    if (!row) return jsonError(400, 'no_pending_code');
    if (row.expires_at < Date.now()) {
      await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
      return jsonError(400, 'code_expired');
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
      return jsonError(400, 'too_many_attempts');
    }

    const codeHash = await sha256(code);
    if (codeHash !== row.code_hash) {
      await env.DB.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?')
        .bind(email)
        .run();
      return jsonError(400, 'wrong_code');
    }

    await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
  }

  const now = Date.now();
  let user = await env.DB.prepare('SELECT id, display_name FROM users WHERE email = ?')
    .bind(email)
    .first<User>();

  if (!user) {
    const userId = generateUserId();
    await env.DB.prepare(
      'INSERT INTO users (id, email, display_name, created_at, last_seen_at) VALUES (?, ?, NULL, ?, ?)',
    )
      .bind(userId, email, now, now)
      .run();
    user = { id: userId, display_name: null };
  } else {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, user.id).run();
  }

  const token = generateBearerToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare(
    'INSERT INTO auth_tokens (token_hash, user_id, created_at, last_used_at) VALUES (?, ?, ?, ?)',
  )
    .bind(tokenHash, user.id, now, now)
    .run();

  return jsonOk({
    token,
    user: { id: user.id, display_name: user.display_name },
    needs_display_name: user.display_name === null,
  });
}

// Resolves a request's bearer token to the owning user_id, or returns a Response
// the caller should return verbatim. Updates `last_used_at` on success.
export async function requireAuth(
  req: Request,
  env: Env,
): Promise<{ user_id: string } | Response> {
  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return jsonError(401, 'unauthenticated');
  }
  const token = header.slice(7).trim();
  if (!token) return jsonError(401, 'unauthenticated');

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id FROM auth_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ user_id: string }>();
  if (!row) return jsonError(401, 'invalid_token');

  // Best-effort touch of last_used_at; don't block on it.
  await env.DB.prepare('UPDATE auth_tokens SET last_used_at = ? WHERE token_hash = ?')
    .bind(Date.now(), tokenHash)
    .run();

  return { user_id: row.user_id };
}
