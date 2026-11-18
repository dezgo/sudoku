// Personal crew invite links (Nov 2026).
//
//   GET /g/<code>            a tiny page whose link preview (iMessage, WhatsApp…)
//                            says who's inviting and that it's just the two of
//                            you — then it forwards to the web app's invite sheet.
//   GET /v1/invite/<code>    → { name }  who an invite code belongs to (no sign-in
//                            needed), so the invite sheet can say "Derek invited you".

import type { Env } from './types';
import { jsonError, jsonOk } from './http';

async function inviterName(env: Env, code: string): Promise<string | null | undefined> {
  const row =
    (await env.DB.prepare('SELECT display_name FROM users WHERE invite_code = ?').bind(code).first<{ display_name: string | null }>()) ??
    (await env.DB.prepare('SELECT u.display_name FROM groups g JOIN users u ON u.id = g.created_by WHERE g.invite_code = ?')
      .bind(code)
      .first<{ display_name: string | null }>());
  return row ? row.display_name : undefined;
}

export async function getInvite(env: Env, code: string): Promise<Response> {
  const name = await inviterName(env, code.toUpperCase());
  if (name === undefined) return jsonError(404, 'unknown_code');
  return jsonOk({ name: name ?? null });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function crewInvitePage(env: Env, origin: string, code: string): Promise<Response> {
  const c = code.toUpperCase();
  const name = (await inviterName(env, c)) ?? null;
  const who = name ? esc(name) : 'A friend';
  const target = `${origin}/play/?group=${encodeURIComponent(c)}`;
  const title = `${who} invited you to Sudoku Crew`;
  const desc = `Play the free daily sudoku with ${name ? who : 'them'} — you’ll see each other’s games, privately — just the two of you.`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:site_name" content="Sudoku Crew">
<meta property="og:type" content="website">
<meta property="og:url" content="${origin}/g/${esc(c)}">
<meta property="og:image" content="${origin}/play/icon-512.png">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f2f2f7;color:#111;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}a{color:#2f6fde}</style>
</head>
<body>
<p>${title}.<br><a href="${esc(target)}">Open Sudoku Crew</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
