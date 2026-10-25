// Update banner. iOS keeps a home-screen web app suspended in memory, so
// reopening it resumes the old page and a deploy never shows up unless the
// player force-quits — which nobody knows to do. Whenever the app comes back
// to the foreground (and every 30 minutes while open), compare the live
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
    const html = await (await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })).text();
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
  setInterval(() => void check(), 30 * 60 * 1000);
  void check();
}
