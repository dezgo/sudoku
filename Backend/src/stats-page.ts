// sudokucrew.com/stats — private usage stats. Same origin as the web app, so
// it reuses the web app's sign-in (localStorage `sudoku.identity.v1`): sign
// in at /play in the same browser first. The server only answers for
// accounts listed in ADMIN_USER_IDS; for anyone else the page says so.
//
// Built around "who played when": a row per person, a dot per day. The data
// comes from GET /v1/admin/report (report.ts) and is drawn here in the browser.

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sudoku Crew stats</title>
<link rel="icon" type="image/png" sizes="32x32" href="/play/favicon-32.png">
<style>
  :root {
    --bg: #f2f2f7; --surface: #fff; --text: #111114; --muted: #6e6e78; --line: #e3e3e8;
    --accent: #2f6fde; --accent-soft: #b9cdf3; --empty: #e6e6ec; --warn: #c27c0e; --warn-bg: #fdf3e1;
    --up: #24a148; --down: #e5383b; --bar: #cfdcf6;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000; --surface: #1c1c1e; --text: #f2f2f7; --muted: #98989f; --line: #2c2c2e;
      --accent: #4d8cf5; --accent-soft: #3e68ad; --empty: #35353b; --warn: #f0a63a; --warn-bg: #3a2a10;
      --up: #3ccf6a; --down: #ff5a5f; --bar: #24375a;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 920px; margin: 0 auto; padding: 20px 16px 48px; }
  header { display: flex; align-items: end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .eyebrow { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }
  h1 { font-size: 26px; line-height: 1.15; margin: 2px 0 0; font-weight: 800; letter-spacing: -.01em; }
  .seg { display: inline-flex; background: var(--empty); border-radius: 10px; padding: 3px; }
  .seg button { font: inherit; font-size: 14px; font-weight: 600; border: 0; background: none; color: var(--text);
                padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.15); }

  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .tile { background: var(--surface); border-radius: 14px; padding: 14px 16px; }
  .tile .n { font-size: 32px; font-weight: 800; line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .tile .l { font-size: 13px; color: var(--muted); margin-top: 6px; }
  .tile .d { font-size: 12px; font-weight: 700; margin-top: 2px; min-height: 16px; }
  .tile .d.up { color: var(--up); } .tile .d.down { color: var(--down); } .tile .d.flat { color: var(--muted); font-weight: 600; }
  .tile.warn { background: var(--warn-bg); } .tile.warn .n { color: var(--warn); }

  .card { background: var(--surface); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .card h2 { font-size: 17px; margin: 0 0 12px; font-weight: 700; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .card h2 small { font-size: 12px; font-weight: 500; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .cols .card { margin-bottom: 0; }
  .cols + .cols { margin-top: 14px; }

  /* Who played when */
  .grid { display: grid; align-items: center; column-gap: 0; row-gap: 0; }
  .grid .name { padding: 7px 10px 7px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 14px; }
  .grid .name .sub { display: block; font-size: 11px; font-weight: 500; color: var(--muted); }
  .grid .cell { display: flex; justify-content: center; align-items: center; height: 100%; }
  .grid .dot { width: 18px; height: 18px; border-radius: 50%; background: var(--empty); }
  .grid .dot.daily { background: var(--accent); }
  .grid .dot.played { background: var(--accent-soft); }
  .grid.dense .dot { width: 100%; height: 14px; border-radius: 2px; margin: 0 1px; }
  .grid.vdense .dot { height: 12px; border-radius: 1px; margin: 0 .5px; }
  .grid .end { padding-left: 10px; text-align: right; font-size: 12px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .grid .end b { color: var(--text); font-size: 14px; }
  .grid .hd { font-size: 11px; color: var(--muted); text-align: center; padding-bottom: 4px; font-weight: 600; }
  .grid .bars { display: flex; align-items: end; justify-content: center; height: 28px; padding: 0 2px; }
  .grid .bars i { display: block; width: 100%; max-width: 18px; background: var(--bar); border-radius: 3px 3px 0 0; }
  .grid .sect { grid-column: 1 / -1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
                color: var(--muted); padding: 12px 0 2px; border-top: 1px solid var(--line); margin-top: 6px; }
  .grid .sect.quiet { color: var(--warn); }
  .row-line { grid-column: 1 / -1; height: 1px; background: var(--line); }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 12px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

  /* Bars and lists */
  .hbar { display: grid; grid-template-columns: minmax(0, 1fr) 2fr auto; gap: 10px; align-items: center; margin: 7px 0; font-size: 14px; }
  .hbar .track { height: 8px; background: var(--empty); border-radius: 4px; overflow: hidden; }
  .hbar .fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .hbar .v { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hbar .v b { color: var(--text); }
  .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .split { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin: 6px 0 8px; background: var(--empty); }
  .split i { display: block; height: 100%; }
  .keys { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--muted); }
  .keys b { color: var(--text); }
  .keys i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }
  .quote { border-left: 3px solid var(--accent-soft); padding: 2px 0 2px 10px; margin: 10px 0; font-size: 14px; }
  .quote .who { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .muted { color: var(--muted); font-size: 14px; margin: 0; }
  .note { font-size: 12px; color: var(--muted); text-align: center; margin-top: 18px; }
  .msg { background: var(--surface); border-radius: 14px; padding: 24px; text-align: center; color: var(--muted); }
  a { color: var(--accent); }

  @media (max-width: 640px) {
    h1 { font-size: 22px; }
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .tile .n { font-size: 28px; }
    .cols { grid-template-columns: 1fr; }
    .grid .dot { width: 14px; height: 14px; }
    .grid .name { font-size: 13px; }
    .hide-sm { display: none; }
    /* Label and number on one line, the bar full-width underneath. */
    .hbar { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; margin: 10px 0; }
    .hbar .lbl { grid-column: 1; grid-row: 1; }
    .hbar .v { grid-column: 2; grid-row: 1; }
    .hbar .track { grid-column: 1 / -1; grid-row: 2; }
  }
</style>
</head>
<body>
<main>
  <header>
    <div><div class="eyebrow">Sudoku Crew</div><h1 id="title">Stats</h1></div>
    <div class="seg" role="group" aria-label="Period">
      <button data-days="1">Today</button><button data-days="7">7 days</button><button data-days="30">30 days</button><button data-days="90">90 days</button>
    </div>
  </header>
  <div id="out"><div class="msg">Loading…</div></div>
</main>
<script>
const out = document.getElementById('out');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let token = null;
try { token = JSON.parse(localStorage.getItem('sudoku.identity.v1') || 'null')?.token ?? null; } catch {}
let saved = 7;
try { saved = Number(localStorage.getItem('sudoku.stats.days')) || 7; } catch {}

function fmtDay(d, opts) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', ...opts }); }
function ago(t, tz) {
  if (!t) return '';
  const day = (x) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz });
  const n = Math.round((Date.parse(day(Date.now())) - Date.parse(day(t))) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? n + ' days ago' : new Date(t).toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short' });
}
function delta(now, prev, days) {
  if (!prev) return '<div class="d"></div>';
  const d = now - prev;
  const what = days === 1 ? 'yesterday' : days === 7 ? 'last week' : 'previous ' + days + ' days';
  if (!d) return '<div class="d flat">same as ' + what + '</div>';
  return '<div class="d ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' on ' + what + '</div>';
}
function tile(n, label, extra, cls) { return '<div class="tile ' + (cls || '') + '"><div class="n">' + n + '</div><div class="l">' + label + '</div>' + (extra || '<div class="d"></div>') + '</div>'; }
function hbars(rows, labelOf, max) {
  if (!rows.length) return '<p class="muted">None yet.</p>';
  const top = max || Math.max(...rows.map((r) => r.uses));
  return rows.map((r) => '<div class="hbar"><div class="lbl">' + esc(labelOf(r.name)) + '</div><div class="track"><div class="fill" style="width:' + Math.max(4, (r.uses / top) * 100) + '%"></div></div><div class="v"><b>' + r.uses + '</b>× · ' + r.devices + (r.devices === 1 ? ' device' : ' devices') + '</div></div>').join('');
}

function render(data) {
  const r = data.report, L = data.labels, tz = data.tz;
  const days = r.days, list = r.dayList;
  document.getElementById('title').textContent = days === 1
    ? 'Today, ' + fmtDay(list[0], { weekday: 'short', day: 'numeric', month: 'short' })
    : fmtDay(list[0], { day: 'numeric', month: 'short' }) + ' – ' + fmtDay(list[list.length - 1], { day: 'numeric', month: 'short' });

  const quietCount = r.grid.filter((g) => g.kind === 'quiet').length;
  let html = '<div class="tiles">'
    + tile(r.people.total, r.people.total === 1 ? 'person played' : 'people played', delta(r.people.total, r.people.prev, days))
    + tile(r.dailiesSolved, r.dailiesSolved === 1 ? 'daily solved' : 'dailies solved', delta(r.dailiesSolved, r.dailiesSolvedPrev, days))
    + tile(r.devices.anonymous, 'playing without an account')
    + tile(quietCount, 'gone quiet', '<div class="d"></div>', quietCount ? 'warn' : '')
    + '</div>';

  // --- Who played when ---
  const dense = list.length > 14, vdense = list.length > 45;
  // A week: fixed-width columns so the dots sit together; a month or more: fill the card.
  const tmpl = dense
    ? 'grid-template-columns: minmax(80px, 170px) repeat(' + list.length + ', minmax(0,1fr)) 64px'
    : 'grid-template-columns: minmax(80px, 200px) repeat(' + list.length + ', minmax(0,44px)) 64px';
  const max = Math.max(1, ...r.perDay);
  let g = '<div class="grid' + (dense ? ' dense' : '') + (vdense ? ' vdense' : '') + '" style="' + tmpl + '">';
  g += '<div></div>' + r.perDay.map((n, i) => '<div class="bars" title="' + esc(fmtDay(list[i], { weekday: 'short', day: 'numeric', month: 'short' })) + ': ' + n + '"><i style="height:' + (n ? Math.max(3, (n / max) * 28) : 0) + 'px"></i></div>').join('') + '<div></div>';
  g += '<div></div>' + list.map((d, i) => {
    let t = '';
    if (!dense) t = fmtDay(d, { weekday: 'narrow' });
    else if (new Date(d + 'T12:00:00Z').getUTCDay() === 1) t = fmtDay(d, { day: 'numeric' }) + (vdense ? '' : '');
    return '<div class="hd">' + t + '</div>';
  }).join('') + '<div class="hd" style="text-align:right">Dailies</div>';
  let section = null;
  const sectName = { anon: 'Without an account', quiet: 'Gone quiet — nothing for a week or more' };
  for (const row of r.grid) {
    if (row.kind !== 'player' && row.kind !== section) { section = row.kind; g += '<div class="sect ' + row.kind + '">' + sectName[row.kind] + '</div>'; }
    const last = ago(row.lastActive, tz);
    const sub = row.kind === 'quiet' ? 'last played ' + last : row.otherGames ? row.otherGames + ' other game' + (row.otherGames === 1 ? '' : 's') : '';
    g += '<div class="name" title="' + esc(row.name) + '">' + esc(row.name) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div>';
    g += list.map((d) => '<div class="cell"><div class="dot ' + (row.marks[d] || '') + '" title="' + esc(fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })) + (row.marks[d] === 'daily' ? ': solved a daily' : row.marks[d] ? ': played' : '') + '"></div></div>').join('');
    g += '<div class="end"><b>' + row.dailies + '</b></div>';
  }
  if (!r.grid.length) g += '<p class="muted" style="grid-column:1/-1">Nobody yet.</p>';
  g += '</div><div class="legend"><span><i style="background:var(--accent)"></i>Solved a daily</span><span><i style="background:var(--accent-soft)"></i>Opened the app or played something else</span><span><i style="background:var(--empty)"></i>Nothing</span></div>';
  html += '<section class="card"><h2>Who played when <small>bars = people that day</small></h2>' + g + '</section>';

  // --- Games + features ---
  const byMode = {};
  for (const x of r.games) {
    const m = byMode[x.mode] || (byMode[x.mode] = { started: 0, resumed: 0, finished: 0, levels: {} });
    m.started += x.started; m.resumed += x.resumed; m.finished += x.finished;
    if (x.difficulty) m.levels[x.difficulty] = (m.levels[x.difficulty] || 0) + x.started + x.resumed;
  }
  const modes = Object.entries(byMode);
  const gmax = Math.max(1, ...modes.map(([, m]) => Math.max(m.started, m.finished)));
  const games = modes.length ? modes.map(([k, m]) => {
    const lv = Object.entries(m.levels).map(([l, n]) => l + ' ' + n).join(' · ');
    return '<div class="hbar"><div class="lbl">' + esc(L.mode[k] || k) + '</div><div class="track"><div class="fill" style="width:' + Math.max(4, (m.finished / gmax) * 100) + '%"></div></div><div class="v"><b>' + m.finished + '</b> of ' + m.started + ' finished</div></div>'
      + (lv ? '<div class="keys" style="margin:-4px 0 6px">' + esc(lv) + (m.resumed ? ' · ' + m.resumed + ' picked back up' : '') + '</div>' : '');
  }).join('') : '<p class="muted">None recorded yet.</p>';
  html += '<div class="cols"><section class="card"><h2>Games <small>finished of started</small></h2>' + games + '</section>'
    + '<section class="card"><h2>Features used</h2>' + hbars(r.features, (n) => L.feature[n] || n) + '</section></div>';

  // --- Devices + screens ---
  const plats = Object.entries(r.devices.byPlatform).sort((a, b) => b[1] - a[1]);
  const pcol = ['var(--accent)', '#8fb2ee', '#d4a017', '#24a148', '#98989f'];
  const tot = Math.max(1, r.devices.total);
  const dev = r.devices.total
    ? '<div class="split">' + plats.map(([, n], i) => '<i style="width:' + (n / tot) * 100 + '%;background:' + pcol[i % 5] + '"></i>').join('') + '</div>'
      + '<div class="keys">' + plats.map(([p, n], i) => '<span><i style="background:' + pcol[i % 5] + '"></i>' + esc(L.platform[p] || p) + ' <b>' + n + '</b></span>').join('') + '</div>'
      + '<div class="split" style="margin-top:14px"><i style="width:' + (r.devices.installed / tot) * 100 + '%;background:var(--accent)"></i></div>'
      + '<div class="keys"><span><i style="background:var(--accent)"></i>Home-screen app <b>' + r.devices.installed + '</b></span><span><i style="background:var(--empty)"></i>Browser tab <b>' + r.devices.browser + '</b></span></div>'
      + '<p class="muted" style="margin-top:12px">' + r.devices.avgPerDay + ' devices open it on an average day.</p>'
    : '<p class="muted">None recorded yet.</p>';
  html += '<div class="cols"><section class="card"><h2>Devices <small>' + r.devices.total + ' in all</small></h2>' + dev + '</section>'
    + '<section class="card"><h2>Screens opened</h2>' + hbars(r.screens, (n) => L.screen[n] || n) + '</section></div>';

  // --- Feedback, sign-ups, settings ---
  const fb = r.feedback.length ? r.feedback.map((f) => '<div class="quote">' + esc(f.message) + '<div class="who">' + esc(f.who) + ' · ' + esc(ago(f.at, tz)) + '</div></div>').join('') : '<p class="muted">None.</p>';
  const nu = r.newUsers.length ? r.newUsers.map((u) => '<div class="hbar" style="grid-template-columns:1fr auto"><div class="lbl">' + esc(u.name) + '</div><div class="v">joined ' + esc(ago(u.joined, tz)) + ' · ' + u.dailies + (u.dailies === 1 ? ' daily' : ' dailies') + '</div></div>').join('') : '<p class="muted">None.</p>';
  html += '<div class="cols"><section class="card"><h2>Feedback</h2>' + fb + '</section>'
    + '<section class="card"><h2>New sign-ups</h2>' + nu + (r.settings.length ? '<h2 style="margin-top:18px">Settings changed</h2>' + hbars(r.settings, (n) => n) : '') + '</section></div>';

  if (!r.trackingSince || r.trackingSince > r.from)
    html += '<p class="note">Detailed tracking began ' + (r.trackingSince ? new Date(r.trackingSince).toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'long' }) : 'just now') + '. Before that, only finished dailies were recorded.</p>';
  out.innerHTML = html;
}

async function load(days) {
  try { localStorage.setItem('sudoku.stats.days', String(days)); } catch {}
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.days === String(days)));
  if (!token) { out.innerHTML = '<div class="msg">Sign in to the <a href="/play/">web app</a> in this browser first, then come back here.</div>'; return; }
  try {
    const r = await fetch('/v1/admin/report?days=' + days, { headers: { authorization: 'Bearer ' + token } });
    if (r.status === 401) { out.innerHTML = '<div class="msg">Your sign-in has expired. Sign in again in the <a href="/play/">web app</a>.</div>'; return; }
    if (r.status === 403) { out.innerHTML = '<div class="msg">This account can\\'t see the stats.</div>'; return; }
    if (!r.ok) throw new Error(String(r.status));
    render(await r.json());
  } catch (e) {
    console.error(e);
    out.innerHTML = '<div class="msg">Couldn\\'t load the stats. Check your connection and try again.</div>';
  }
}
for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => load(Number(b.dataset.days)));
load([1, 7, 30, 90].includes(saved) ? saved : 7);
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
