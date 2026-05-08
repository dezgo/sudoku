// Tokens, hashes, code generation. All use the Web Crypto API available in
// Workers — no external deps.

const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // base32 minus 0/1/I/L/O

export function generateBearerToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function generateOtpCode(): string {
  // 6-digit numeric, leading zeros allowed.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0]! % 1_000_000).toString().padStart(6, '0');
}

export function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  }
  return out;
}

export function generateUserId(): string {
  return randomHex(16);
}

export function generateGroupId(): string {
  return randomHex(16);
}

export function generateMultiplayerGameId(): string {
  return randomHex(16);
}

export function generateIdempotencyKey(): string {
  return randomHex(16);
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(hash));
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
