// Update banner. iOS keeps a home-screen web app suspended in memory, so
// reopening it resumes the old page and a deploy never shows up unless the
// player force-quits — which nobody knows to do. Whenever the app comes back
// to the foreground (and every few minutes while open), compare the live
// page's script bundle with the one running; if it changed, show an
// "Update" banner. Tapping it saves and reloads — safe mid-game, since
// progress is saved continuously.

import { store } from './store';

const running = (): string | null =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;

async function check(): Promise<void> {
  const current = running();
  if (!current || store.updateReady) return;
  try {
    // The query string matters: the service worker answers plain /play/ from
    // its cache — a copy of the version already running — so without it the
    // check always saw "no change" and the banner never appeared (found on
    // Derek's phone, 25 Oct 2026). sw.js passes ?update-check straight to
    // the network.
    const html = await (
      await fetch(`${import.meta.env.BASE_URL}?update-check=${Date.now()}`, { cache: 'no-store' })
    ).text();
    const live = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
    if (live && live !== current) {
      store.updateReady = true;
      store.emit();
    }
  } catch {
    /* offline — try again next time */
  }
}

export function applyUpdate(): void {
  store.saveProgress();
  location.reload();
}

export function startUpdateChecks(): void {
  // Dev server scripts aren't hashed bundles; nothing to compare.
  if (!import.meta.env.PROD) return;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
  // Cheap (one small HTML fetch), so check often enough that a deploy shows
  // up while someone is mid-session, not only after they leave the app.
  setInterval(() => void check(), 3 * 60 * 1000);
  void check();
}
