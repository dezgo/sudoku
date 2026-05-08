// Push notification dispatch for multiplayer events. Two backends:
//   - APNs (iOS): HTTP/2 endpoint, JWT-bearer auth via .p8 (ES256).
//   - FCM v1 (Android): OAuth bearer derived from a service-account JWT (RS256).
//
// Credentials live in Worker secrets — list at end of file. When secrets are
// absent (e.g. local dev, or production before Derek configures push), this
// module logs and returns silently. That keeps multiplayer game logic
// working even before the push side is wired.
//
// JWT signing uses Web Crypto (subtle.sign), available in Workers.

import type { Env } from './types';

export interface PushMessage {
  title: string;
  body: string;
  // Custom payload — mp_invite, mp_your_turn, mp_forfeit, mp_game_end, etc.
  data: Record<string, string>;
}

interface PushEnv extends Env {
  // APNs auth-key flow (preferred over cert flow — no renewals).
  APNS_KEY_ID?: string;       // 10-char Key ID from Apple Dev Portal
  APNS_TEAM_ID?: string;      // 10-char Team ID
  APNS_BUNDLE_ID?: string;    // e.g. com.derekgillett.Sudoku
  APNS_PRIVATE_KEY?: string;  // PEM contents of the .p8 file (with newlines)
  APNS_USE_SANDBOX?: string;  // "1" to send to api.sandbox.push.apple.com (TestFlight)

  // FCM service-account flow.
  FCM_PROJECT_ID?: string;    // Firebase project id, e.g. sudoku-crew-prod
  FCM_CLIENT_EMAIL?: string;  // service-account email
  FCM_PRIVATE_KEY?: string;   // PEM contents of the service account's private key
}

/** Send a push to every registered device for a user. Best-effort — errors
 *  per device are logged but never thrown. */
export async function sendPush(env: Env, userId: string, msg: PushMessage): Promise<void> {
  const tokens = await env.DB.prepare(
    'SELECT platform, token FROM push_tokens WHERE user_id = ?',
  )
    .bind(userId)
    .all<{ platform: string; token: string }>();

  for (const t of tokens.results ?? []) {
    try {
      if (t.platform === 'ios') await sendApns(env as PushEnv, t.token, msg);
      else if (t.platform === 'android') await sendFcm(env as PushEnv, t.token, msg);
    } catch (err) {
      console.error(`push failed for user=${userId} platform=${t.platform}`, err);
      // Apple/Google return specific errors when a token is permanently
      // invalid (BadDeviceToken / UNREGISTERED) — prune those so we don't
      // keep retrying.
      if (isPermanentlyInvalid(err)) {
        await env.DB.prepare('DELETE FROM push_tokens WHERE token = ?')
          .bind(t.token)
          .run()
          .catch(() => undefined);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// APNs (iOS)
// ---------------------------------------------------------------------------

async function sendApns(env: PushEnv, deviceToken: string, msg: PushMessage): Promise<void> {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_BUNDLE_ID || !env.APNS_PRIVATE_KEY) {
    console.warn('APNs disabled (secrets missing) — skipping push');
    return;
  }

  const jwt = await mintApnsJwt(env);
  const host = env.APNS_USE_SANDBOX === '1'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com';

  const payload = {
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: 'default',
      'mutable-content': 1,
    },
    ...msg.data,
  };

  const resp = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${jwt}`,
      'apns-topic': env.APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    const err: any = new Error(`apns ${resp.status}: ${errBody}`);
    err.permanentlyInvalid = resp.status === 400 || resp.status === 410;
    throw err;
  }
}

// APNs JWTs live up to 60 minutes — we mint fresh per send for now. Could
// cache in module scope but Workers isolate frequently anyway.
async function mintApnsJwt(env: PushEnv): Promise<string> {
  const header = { alg: 'ES256', kid: env.APNS_KEY_ID };
  const claims = { iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) };
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = await importEcKey(env.APNS_PRIVATE_KEY!);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function importEcKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

// ---------------------------------------------------------------------------
// FCM v1 (Android)
// ---------------------------------------------------------------------------

async function sendFcm(env: PushEnv, deviceToken: string, msg: PushMessage): Promise<void> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    console.warn('FCM disabled (secrets missing) — skipping push');
    return;
  }

  const accessToken = await getFcmAccessToken(env);
  const payload = {
    message: {
      token: deviceToken,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
      android: { priority: 'high' as const },
    },
  };

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) {
    const errBody = await resp.text();
    const err: any = new Error(`fcm ${resp.status}: ${errBody}`);
    err.permanentlyInvalid =
      resp.status === 404 || resp.status === 400 || /UNREGISTERED|INVALID_ARGUMENT/.test(errBody);
    throw err;
  }
}

async function getFcmAccessToken(env: PushEnv): Promise<string> {
  // Sign a JWT, exchange it for an OAuth bearer.
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = await importRsaKey(env.FCM_PRIVATE_KEY!);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`fcm oauth ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as { access_token: string };
  return json.access_token;
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPermanentlyInvalid(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as any).permanentlyInvalid);
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Required Worker secrets (set via `wrangler secret put NAME`):
//
//   APNS_KEY_ID         (10-char Key ID from Apple Developer Portal)
//   APNS_TEAM_ID        (10-char Team ID)
//   APNS_BUNDLE_ID      (e.g. com.derekgillett.Sudoku)
//   APNS_PRIVATE_KEY    (full PEM contents of the .p8, including header/footer)
//   APNS_USE_SANDBOX    ("1" while shipping via TestFlight; unset/0 for prod)
//
//   FCM_PROJECT_ID      (Firebase project id)
//   FCM_CLIENT_EMAIL    (service-account email, ends in @<proj>.iam.gserviceaccount.com)
//   FCM_PRIVATE_KEY     (PEM contents of the service account's private key)
// ---------------------------------------------------------------------------
