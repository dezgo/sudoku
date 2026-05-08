// Public invite landing page served at /m/<code>. Recipients hit this URL
// from a share, see the invite code prominently, and get pointed at the
// App Store / Play Store. Once Universal Links / App Links land (see
// STATUS.md), this same URL will deep-link directly into the app's
// join-game flow when it's installed; until then it's a friendly fallback.

const APP_STORE_URL =
  'https://apps.apple.com/app/sudoku-crew/id6757345095';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.derekgillett.sudoku';

export function getMultiplayerInvitePage(code: string): Response {
  // Hard-clamp code to the expected 6-char base32 alphabet so we don't echo
  // arbitrary user-supplied content into HTML.
  const safeCode = code.replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/gi, '').slice(0, 6).toUpperCase();
  if (!safeCode) {
    return new Response('Invalid invite code', { status: 400 });
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>You've been invited to a Sudoku game</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f6f7f9;
      color: #111;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 18px;
      padding: 28px 24px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 6px 24px rgba(0,0,0,.08);
      text-align: center;
    }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { color: #555; line-height: 1.45; margin: 0 0 18px; }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 0.08em;
      background: #eef2f7;
      padding: 18px 12px;
      border-radius: 12px;
      margin: 16px 0 24px;
    }
    .stores { display: flex; gap: 12px; flex-direction: column; }
    .stores a {
      display: block;
      padding: 14px 16px;
      border-radius: 10px;
      font-weight: 600;
      text-decoration: none;
      background: #007AFF;
      color: #fff;
    }
    .stores a.secondary { background: #2e2e2e; }
    .footer {
      margin-top: 20px;
      font-size: 13px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>You've been invited to a Sudoku game</h1>
    <p>Open Sudoku Crew on your phone, sign in, then tap "Multiplayer" and "Join with a code". Use this code:</p>
    <div class="code">${safeCode}</div>
    <p>Don't have the app?</p>
    <div class="stores">
      <a href="${APP_STORE_URL}">Get it on the App Store (iOS)</a>
      <a href="${PLAY_STORE_URL}" class="secondary">Get it on Google Play (Android)</a>
    </div>
    <div class="footer">Sudoku Crew · sudoku.appfoundry.cc</div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
