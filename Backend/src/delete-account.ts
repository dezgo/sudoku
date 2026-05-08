/**
 * Account deletion page served at https://sudoku.appfoundry.cc/delete-account.
 *
 * Required by the Google Play Store for any app that allows account
 * creation. Provides a publicly-accessible URL that explains what data
 * gets deleted and how a user initiates the request. Until we ship an
 * in-app delete button, requests go via email.
 */

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sudoku — Delete Your Account</title>
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
    .note {
      background: #fff8e1;
      border-left: 3px solid #ffc107;
      padding: 0.75rem 1rem;
      margin: 1.25rem 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Delete Your Account</h1>
  <p class="meta">Sudoku · Last updated 2 May 2026</p>

  <p>
    You can delete your Sudoku account and all associated data at any
    time. We'll process the request and send a confirmation when it's
    complete.
  </p>

  <h2>What gets deleted</h2>
  <ul>
    <li>Your account (email address and display name).</li>
    <li>Your group memberships.</li>
    <li>Your scores on any group leaderboards.</li>
    <li>Any sessions or verification codes still active.</li>
  </ul>
  <p>
    The app's local data on your device (saved puzzles, settings) is
    deleted by uninstalling the app — that's never sent to our servers.
  </p>

  <h2>How to request deletion</h2>
  <p>
    Email
    <a href="mailto:sudoku@appfoundry.cc?subject=Delete%20my%20account">sudoku@appfoundry.cc</a>
    from the address you signed up with, and include the subject line:
  </p>
  <p><code>Delete my account</code></p>
  <p>That's it. We'll verify the request, delete everything, and confirm
  via reply within 7 days.</p>

  <div class="note">
    <strong>Note:</strong> deletion is permanent. We can't restore
    accounts, scores, or group history once they're gone.
  </div>

  <h2>Questions</h2>
  <p>
    Anything else, send a note to
    <a href="mailto:sudoku@appfoundry.cc">sudoku@appfoundry.cc</a>.
    See also the
    <a href="/privacy">privacy policy</a> for what data we collect and how
    we use it.
  </p>
</body>
</html>
`;

export function getDeleteAccountPage(): Response {
  return new Response(PAGE_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
