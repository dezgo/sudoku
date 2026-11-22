// Usage reporting (POST /v1/usage, see Backend/src/usage.ts). Small events
// are queued and sent in batches: soon after they happen, when the app goes
// to the background, and on the next launch if the phone was offline. Never
// blocks or breaks the game: every failure is swallowed and retried later.
//
// The device id is a random string made up here on first launch. It's what
// lets the stats count someone who plays without an account. It isn't tied
// to anyone unless they sign in on this device.

import { readJSON, writeJSON } from './storage';
import { inStoreApp } from './shell';

export type UsageKind = 'open' | 'game_start' | 'game_resume' | 'game_finish' | 'feature' | 'setting' | 'screen';
type UsageEvent = { k: UsageKind; at: number; d?: Record<string, unknown> };

const DEVICE_KEY = 'sudoku.device.v1';
const QUEUE_KEY = 'sudoku.usage_queue.v1';
const MAX_QUEUE = 300;
const SEND_AFTER_MS = 15_000;
const BATCH = 100;

let queue: UsageEvent[] = readJSON<UsageEvent[]>(QUEUE_KEY, []);
let timer: number | null = null;
let sending = false;
let tokenFn: () => string | null = () => null;

export function deviceId(): string {
  let id = readJSON<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    writeJSON(DEVICE_KEY, id);
  }
  return id;
}

function platform(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'computer';
}

function standalone(): boolean {
  return (
    inStoreApp() ||
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function build(): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  return src?.split('/').pop() ?? null;
}

/** Called once at start-up so batches go out signed in when the player is. */
export function initUsage(getToken: () => string | null): void {
  tokenFn = getToken;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushUsage(true);
  });
  window.addEventListener('pagehide', () => void flushUsage(true));
}

export function track(k: UsageKind, d?: Record<string, unknown>): void {
  queue.push(d ? { k, at: Date.now(), d } : { k, at: Date.now() });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  writeJSON(QUEUE_KEY, queue);
  if (timer === null) timer = window.setTimeout(() => void flushUsage(), SEND_AFTER_MS);
}

export async function flushUsage(leaving = false): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (sending || !queue.length) return;
  sending = true;
  const batch = queue.slice(0, BATCH);
  const token = tokenFn();
  try {
    // keepalive lets the request finish after the page is hidden or closed.
    const r = await fetch('/v1/usage', {
      method: 'POST',
      keepalive: leaving,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        device: { id: deviceId(), platform: platform(), standalone: standalone(), build: build() },
        events: batch,
      }),
    });
    // 4xx will never succeed — drop the batch rather than retry it forever.
    if (r.ok || (r.status >= 400 && r.status < 500)) {
      queue = queue.slice(batch.length);
      writeJSON(QUEUE_KEY, queue);
    }
  } catch {
    /* offline — keep the queue for next time */
  } finally {
    sending = false;
  }
  if (!leaving && queue.length && timer === null) timer = window.setTimeout(() => void flushUsage(), SEND_AFTER_MS);
}
