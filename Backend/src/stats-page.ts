// sudokucrew.com/stats — private usage stats. Same origin as the web app, so
// it reuses the web app's sign-in (localStorage `sudoku.identity.v1`): sign
// in at /play in the same browser first. The server only answers for
// accounts listed in ADMIN_USER_IDS; for anyone else the page says so.
// The report itself is rendered server-side (report.ts) — the same HTML as
// the Monday email.

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sudoku Crew stats</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fafafa; color: #222; font: 14px -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 16px; }
  nav { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  nav button { font: inherit; padding: 6px 12px; border: 1px solid #ccc; border-radius: 16px; background: #fff; cursor: pointer; }
  nav button[aria-pressed="true"] { background: #222; color: #fff; border-color: #222; }
  #out { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; overflow-x: auto; }
  .msg { color: #666; }
  a { color: #2563eb; }
</style>
</head>
<body>
<main>
  <nav>
    <button data-days="1">Today</button>
    <button data-days="7">7 days</button>
    <button data-days="30">30 days</button>
    <button data-days="90">90 days</button>
  </nav>
  <div id="out"><p class="msg">Loading…</p></div>
</main>
<script>
  const out = document.getElementById('out');
  let token = null;
  try { token = JSON.parse(localStorage.getItem('sudoku.identity.v1') || 'null')?.token ?? null; } catch {}
  async function load(days) {
    for (const b of document.querySelectorAll('nav button')) b.setAttribute('aria-pressed', String(b.dataset.days === String(days)));
    if (!token) {
      out.innerHTML = '<p class="msg">Sign in to the <a href="/play/">web app</a> in this browser first, then come back here.</p>';
      return;
    }
    out.innerHTML = '<p class="msg">Loading…</p>';
    try {
      const r = await fetch('/v1/admin/report?days=' + days, { headers: { authorization: 'Bearer ' + token } });
      if (r.status === 401) { out.innerHTML = '<p class="msg">Your sign-in has expired. Sign in again in the <a href="/play/">web app</a>.</p>'; return; }
      if (r.status === 403) { out.innerHTML = '<p class="msg">This account can\\'t see the stats.</p>'; return; }
      if (!r.ok) throw new Error(String(r.status));
      out.innerHTML = (await r.json()).html;
    } catch {
      out.innerHTML = '<p class="msg">Couldn\\'t load the stats. Check your connection and try again.</p>';
    }
  }
  for (const b of document.querySelectorAll('nav button')) b.addEventListener('click', () => load(Number(b.dataset.days)));
  load(7);
</script>
</body>
</html>`;

export function getStatsPage(): Response {
  return new Response(PAGE, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
