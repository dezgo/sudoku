/**
 * Privacy policy page served at https://sudoku.appfoundry.cc/privacy.
 *
 * Required by the Google Play Store and Apple App Store for any app that
 * collects user data. Kept inline as a string template so it deploys with
 * the Worker — no static site / CDN setup needed.
 */

const POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sudoku — Privacy Policy</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 720px;
      margin: 2rem auto;
      padding: 0 1.25rem;
      line-height: 1.55;
      color: #1a1a1a;
    }
    h1 { margin-top: 0; }
    h2 { margin-top: 2rem; }
    code {
      background: #f4f4f4;
      padding: 0.1em 0.35em;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .meta { color: #666; font-size: 0.92em; }
    a { color: #1a73e8; }
    ul { padding-left: 1.25rem; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta">Sudoku · Effective 2 May 2026</p>

  <p>
    This is the privacy policy for the <strong>Sudoku</strong> app and its
    backend at <code>sudoku.appfoundry.cc</code>. The app is designed for
    small private friend groups to share a daily Sudoku puzzle and
    leaderboard. We collect only what's needed to make that work, and we
    don't sell or share your data with anyone.
  </p>

  <h2>What we collect</h2>
  <ul>
    <li>
      <strong>Email address</strong> — used only to send a one-time
      verification code when you sign in. Stored on our servers so we can
      recognise you on future sign-ins.
    </li>
    <li>
      <strong>Display name</strong> — the name shown to other members of
      groups you join. You choose this when you sign in.
    </li>
    <li>
      <strong>Group memberships</strong> — which groups you've joined and
      when.
    </li>
    <li>
      <strong>Scores</strong> — for each daily puzzle you complete: the
      puzzle, your time, mistake count, and completion timestamp. These are
      shown to other members of any groups you've joined.
    </li>
  </ul>

  <p>
    The app itself stores additional data locally on your device — your
    in-progress puzzles, settings, and game history. That data stays on
    your device and is never sent to our servers.
  </p>

  <h2>What we don't collect</h2>
  <ul>
    <li>No advertising identifiers (IDFA / Android Advertising ID).</li>
    <li>No location data.</li>
    <li>No contacts, photos, or files outside the app.</li>
    <li>No third-party analytics.</li>
    <li>No advertising of any kind.</li>
  </ul>

  <h2>How we use your data</h2>
  <p>Your data is used solely to operate the app:</p>
  <ul>
    <li>Verifying you're you when you sign in.</li>
    <li>Showing your name and scores to other members of your groups.</li>
    <li>Generating the daily puzzle and leaderboard you see.</li>
  </ul>
  <p>We don't use your data for marketing, profiling, or any purpose
  outside the app.</p>

  <h2>Who we share data with</h2>
  <p>We use two service providers to deliver the app:</p>
  <ul>
    <li>
      <strong>Cloudflare</strong> — hosts the backend and the database.
      Cloudflare may see metadata about requests (IP, user-agent) for
      security and abuse prevention. See
      <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare's privacy policy</a>.
    </li>
    <li>
      <strong>Resend</strong> — delivers the verification email when you
      sign in. Resend processes your email address only to send that
      message. See
      <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend's privacy policy</a>.
    </li>
  </ul>
  <p>We don't share data with anyone else, and we don't sell your data.</p>

  <h2>Data retention</h2>
  <ul>
    <li>Your account, display name, and groups are kept until you ask us
    to delete them.</li>
    <li>Your scores are kept as part of the leaderboard history.</li>
    <li>One-time verification codes expire automatically and are deleted
    soon after.</li>
  </ul>

  <h2>Your rights and choices</h2>
  <ul>
    <li>You can sign out from the app at any time.</li>
    <li>You can leave any group from the Settings sheet.</li>
    <li>You can request that we delete your account and all associated
    data by emailing the address below.</li>
  </ul>

  <h2>Children</h2>
  <p>
    The app isn't directed at children under 13. If you're a parent and
    believe your child has signed up, contact us and we'll delete the
    account.
  </p>

  <h2>Changes to this policy</h2>
  <p>
    If this policy materially changes we'll update the effective date at
    the top. Continued use of the app after a change means you accept the
    revised policy.
  </p>

  <h2>Contact</h2>
  <p>
    Questions, deletion requests, or anything privacy-related:
    <a href="mailto:sudoku@appfoundry.cc">sudoku@appfoundry.cc</a>.
  </p>
</body>
</html>
`;

export function getPrivacyPolicy(): Response {
  return new Response(POLICY_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
