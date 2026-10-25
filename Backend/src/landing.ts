/**
 * Public landing page served at https://sudokucrew.com/ and
 * https://sudoku.appfoundry.cc/ — same Worker, both hostnames.
 *
 * Points people at the web app (/play). The store apps are being retired
 * in favour of it (Oct 2026), so the store buttons and the Android beta
 * section are gone. The healthcheck lives at /health for monitoring.
 */

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sudoku Crew</title>
  <style>
    :root {
      --bg: #fafafa;
      --fg: #1a1a1a;
      --muted: #666;
      --accent: #2e7d32;
      --accent-2: #1565c0;
      --rule: #e6e6e6;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #121212; --fg: #ececec; --muted: #9a9a9a; --rule: #2a2a2a; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.55;
    }
    .wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: 4rem 1.5rem 6rem;
    }
    h1 {
      font-size: 2.5rem;
      margin: 0 0 0.5rem;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .tagline {
      font-size: 1.1rem;
      color: var(--muted);
      margin: 0 0 2.5rem;
    }
    h2 {
      font-size: 1.15rem;
      margin: 2.5rem 0 0.75rem;
    }
    p { margin: 0 0 1rem; }
    ul {
      padding-left: 1.25rem;
      margin: 0 0 1.25rem;
    }
    li { margin: 0.25rem 0; }
    .footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--rule);
      font-size: 0.9rem;
      color: var(--muted);
    }
    a { color: var(--accent-2); }
    .pill {
      display: inline-block;
      padding: 0.2em 0.6em;
      border-radius: 999px;
      background: rgba(46, 125, 50, 0.12);
      color: var(--accent);
      font-size: 0.85rem;
      margin-right: 0.5rem;
    }
    .play-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.85rem 1.6rem;
      border-radius: 12px;
      background: var(--accent-2);
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      transition: opacity 0.15s ease;
    }
    .play-btn:hover { opacity: 0.88; }
    .play-btn svg { width: 20px; height: 20px; }
    .sub { color: var(--muted); font-size: 0.95rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Sudoku Crew</h1>
    <p class="tagline">A daily Sudoku puzzle and private leaderboard for your friend group.</p>

    <p>
      <a class="play-btn" href="/play/">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>
        Play now
      </a>
    </p>
    <p class="sub">Free, right in your browser — no download, works on any phone, tablet or computer.</p>

    <p>
      Everyone in your group plays the same puzzle each day. Solve fast,
      solve clean — your time and mistake count appear on a leaderboard
      only your group can see. No public rankings, no strangers, no
      follower counts. Just your people.
    </p>

    <h2>What's in it</h2>
    <ul>
      <li><strong>Daily puzzle</strong> — same puzzle for everyone, refreshed once a day.</li>
      <li><strong>Private friend groups</strong> — share an invite code, that's it.</li>
      <li><strong>Catch up on missed days</strong> — a calendar of every daily, with streaks to keep and monthly trophies to earn.</li>
      <li><strong>A tutor that teaches</strong> — stuck on a hard one? The lightbulb walks you through singles, pairs, triples, pointing pairs, X-Wings, XY-Wings, swordfish and more — step by step, on your actual board.</li>
      <li><strong>Coach mode</strong> — practise one technique at a time.</li>
      <li><strong>Turn-based multiplayer</strong> — take turns on one board with friends.</li>
      <li><strong>Plenty of fresh puzzles</strong> across Easy, Medium, and Hard, plus speed entry and auto-pencil.</li>
    </ul>

    <h2>What's not</h2>
    <p>
      <span class="pill">No ads</span>
      <span class="pill">No trackers</span>
      <span class="pill">No analytics</span>
    </p>
    <p>
      Sudoku Crew collects only what's needed to make groups and
      leaderboards work — your email (for sign-in), display name, and
      scores. See the
      <a href="/privacy">privacy policy</a> for the full breakdown.
    </p>

    <h2>Put it on your home screen</h2>
    <p>It works straight from the browser, but it's nicer as an icon on your phone — it opens full screen, like an app:</p>
    <ul>
      <li><strong>iPhone / iPad:</strong> open it in Safari, tap <em>Share</em>, then <em>Add to Home Screen</em>.</li>
      <li><strong>Android:</strong> open it in Chrome and tap <em>Install</em> (or the ⋮ menu, then <em>Add to Home screen</em>).</li>
    </ul>
    <p>Friend groups are by invite — ask whoever pointed you here for a code.</p>

    <p style="margin-top: 2rem;">
      <a class="play-btn" href="/play/">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>
        Play now
      </a>
    </p>

    <div class="footer">
      <p>
        <a href="/privacy">Privacy</a> ·
        <a href="/delete-account">Delete account</a> ·
        <a href="mailto:hello@sudokucrew.com">hello@sudokucrew.com</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

export function getLandingPage(): Response {
  return new Response(LANDING_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
