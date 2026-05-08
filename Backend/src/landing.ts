/**
 * Public landing page served at https://sudoku.appfoundry.cc/.
 *
 * Replaces the bare "sudoku-api ok" healthcheck so the URL listed on the
 * app's store pages doesn't look like an unfinished server. The
 * healthcheck lives at /health for monitoring.
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
    .stores {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin: 0.5rem 0 0;
    }
    .store-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.7rem 1.1rem;
      border-radius: 10px;
      background: #111;
      color: #fff;
      text-decoration: none;
      font-weight: 500;
      transition: opacity 0.15s ease;
    }
    .store-btn:hover { opacity: 0.85; }
    .store-btn .small { font-size: 0.7rem; opacity: 0.75; line-height: 1; }
    .store-btn .big { font-size: 1.05rem; line-height: 1.1; }
    .store-btn[aria-disabled="true"] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .store-btn svg { width: 22px; height: 22px; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Sudoku Crew</h1>
    <p class="tagline">A daily Sudoku puzzle and private leaderboard for your friend group.</p>

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
      <li><strong>A tutor that teaches</strong> — stuck on a hard one? The lightbulb walks you through naked / hidden singles, pairs, triples, pointing pairs, X-Wing, XY-Wing — step by step, on your actual board.</li>
      <li><strong>Auto-pencil</strong> — fill in candidates with one tap so you can focus on the deductions.</li>
      <li><strong>Plenty of generated puzzles</strong> across Easy, Medium, and Hard.</li>
      <li><strong>Subtle sound effects</strong> and a satisfying solve fanfare.</li>
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

    <h2>Get the app</h2>
    <div class="stores">
      <a class="store-btn" href="https://play.google.com/store/apps/details?id=com.derekgillett.sudoku">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3.6 1.4c-.4.3-.6.7-.6 1.3v18.6c0 .6.2 1 .6 1.3l10.4-10.6L3.6 1.4zM14.5 12l3-3 3.6 2.1c1.1.6 1.1 1.6 0 2.2L17.5 15l-3-3zm-1 1l-9.7 9.9c.4.1.9 0 1.4-.3l11.3-6.5-3-3.1zm-9.7-12c-.5-.3-1-.4-1.4-.3l9.7 9.9 3-3-11.3-6.6z"/>
        </svg>
        <span>
          <span class="small">GET IT ON</span><br>
          <span class="big">Google Play</span>
        </span>
      </a>
      <a class="store-btn" href="#" aria-disabled="true" onclick="return false">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <span>
          <span class="small">COMING SOON</span><br>
          <span class="big">App Store</span>
        </span>
      </a>
    </div>
    <p style="margin-top: 1rem;">
      Friend groups by invite — ask whoever pointed you here for an
      invite code.
    </p>

    <div class="footer">
      <p>
        <a href="/privacy">Privacy</a> ·
        <a href="/delete-account">Delete account</a> ·
        <a href="mailto:sudoku@appfoundry.cc">sudoku@appfoundry.cc</a>
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
