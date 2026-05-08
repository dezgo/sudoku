import type { Env } from './types';
import { jsonError } from './http';
import { authStart, authVerify } from './auth';
import { deleteMe, getMe, getMeGroups, getMeScores, putMe } from './me';
import {
  createGroup,
  getGroupMembers,
  joinGroup,
  leaveGroup,
} from './groups';
import { ensureUpcomingDailies, getDailyByPuzzleId, getDailyToday } from './daily';
import { getGroupScores, postScore } from './scores';
import { getPrivacyPolicy } from './privacy';
import { getDeleteAccountPage } from './delete-account';
import { getLandingPage } from './landing';
import { getVersion } from './version';
import { getMultiplayerInvitePage } from './multiplayer-invite';
import { getAndroidAssetLinks, getAppleAppSiteAssociation } from './well-known';
import {
  createMultiplayerGame,
  declineMultiplayerGame,
  deletePushToken,
  getMultiplayerGame,
  joinMultiplayerByCode,
  joinMultiplayerGame,
  leaveMultiplayerGame,
  listMyMultiplayerGames,
  postMultiplayerMove,
  processForfeits,
  registerPushToken,
  startMultiplayerGame,
} from './multiplayer';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (err) {
      console.error('unhandled error', err);
      return jsonError(500, 'internal_error');
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    try {
      await ensureUpcomingDailies(env);
    } catch (err) {
      console.error('scheduled task: dailies failed', err);
    }
    try {
      await processForfeits(env);
    } catch (err) {
      console.error('scheduled task: forfeits failed', err);
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { pathname: path } = url;
  const method = req.method;

  // Public landing page at the root — what users see if they hit the URL
  // listed on the app's store page.
  if (path === '/' && method === 'GET') return getLandingPage();

  // Healthcheck — handy for "is the deploy alive?" curls and uptime probes.
  if (path === '/health' && method === 'GET') {
    return new Response('sudoku-api ok', { headers: { 'content-type': 'text/plain' } });
  }

  // Universal Links / App Links well-known files. iOS + Android verify
  // these to allow https://sudoku.appfoundry.cc/m/* to deep-link straight
  // into the app's join-game flow.
  if (path === '/.well-known/apple-app-site-association' && method === 'GET') {
    return getAppleAppSiteAssociation();
  }
  if (path === '/.well-known/assetlinks.json' && method === 'GET') {
    return getAndroidAssetLinks();
  }

  // Version endpoint — clients check on launch to drive the in-app update
  // prompt. Anonymous; bumped via wrangler.toml [vars] on each release.
  if (path === '/v1/version' && method === 'GET') return getVersion(env);

  // Privacy policy — public-facing page required by Play Store / App Store.
  if (path === '/privacy' && method === 'GET') return getPrivacyPolicy();

  // Account deletion landing page — required by Play Store for apps that
  // allow account creation.
  if (path === '/delete-account' && method === 'GET') return getDeleteAccountPage();

  // Multiplayer invite landing page. Recipients see the code + store links;
  // once Universal Links land, this'll deep-link straight into the join
  // flow when the app's installed.
  const inviteMatch = path.match(/^\/m\/([A-Za-z0-9]+)$/);
  if (inviteMatch && method === 'GET') return getMultiplayerInvitePage(inviteMatch[1]!);

  if (path === '/v1/auth/start' && method === 'POST') return authStart(req, env);
  if (path === '/v1/auth/verify' && method === 'POST') return authVerify(req, env);

  if (path === '/v1/me' && method === 'GET') return getMe(req, env);
  if (path === '/v1/me' && method === 'PUT') return putMe(req, env);
  if (path === '/v1/me' && method === 'DELETE') return deleteMe(req, env);
  if (path === '/v1/me/groups' && method === 'GET') return getMeGroups(req, env);
  if (path === '/v1/me/scores' && method === 'GET') return getMeScores(req, env);

  if (path === '/v1/groups' && method === 'POST') return createGroup(req, env);
  if (path === '/v1/groups/join' && method === 'POST') return joinGroup(req, env);

  const membersMatch = path.match(/^\/v1\/groups\/([^/]+)\/members$/);
  if (membersMatch && method === 'GET') return getGroupMembers(req, env, membersMatch[1]!);

  const leaveMatch = path.match(/^\/v1\/groups\/([^/]+)\/members\/me$/);
  if (leaveMatch && method === 'DELETE') return leaveGroup(req, env, leaveMatch[1]!);

  if (path === '/v1/daily/today' && method === 'GET') return getDailyToday(env);
  const dailyMatch = path.match(/^\/v1\/daily\/(\d+)$/);
  if (dailyMatch && method === 'GET') {
    return getDailyByPuzzleId(env, parseInt(dailyMatch[1]!, 10));
  }

  if (path === '/v1/scores' && method === 'POST') return postScore(req, env);
  const groupScoresMatch = path.match(/^\/v1\/groups\/([^/]+)\/scores\/(\d+)$/);
  if (groupScoresMatch && method === 'GET') {
    return getGroupScores(req, env, groupScoresMatch[1]!, parseInt(groupScoresMatch[2]!, 10));
  }

  // ---- Multiplayer (v3) ---------------------------------------------------
  if (path === '/v1/multiplayer/games' && method === 'POST') {
    return createMultiplayerGame(req, env);
  }
  if (path === '/v1/multiplayer/join-by-code' && method === 'POST') {
    return joinMultiplayerByCode(req, env);
  }
  if (path === '/v1/me/multiplayer/games' && method === 'GET') {
    return listMyMultiplayerGames(req, env);
  }
  const mpJoinMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)\/join$/);
  if (mpJoinMatch && method === 'POST') return joinMultiplayerGame(req, env, mpJoinMatch[1]!);
  const mpDeclineMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)\/decline$/);
  if (mpDeclineMatch && method === 'POST') return declineMultiplayerGame(req, env, mpDeclineMatch[1]!);
  const mpLeaveMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)\/leave$/);
  if (mpLeaveMatch && method === 'POST') return leaveMultiplayerGame(req, env, mpLeaveMatch[1]!);
  const mpStartMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)\/start$/);
  if (mpStartMatch && method === 'POST') return startMultiplayerGame(req, env, mpStartMatch[1]!);
  const mpMovesMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)\/moves$/);
  if (mpMovesMatch && method === 'POST') return postMultiplayerMove(req, env, mpMovesMatch[1]!);
  const mpGameMatch = path.match(/^\/v1\/multiplayer\/games\/([^/]+)$/);
  if (mpGameMatch && method === 'GET') return getMultiplayerGame(req, env, mpGameMatch[1]!);

  // Push token registration — not multiplayer-specific but the same infra.
  if (path === '/v1/me/push_token' && method === 'POST') return registerPushToken(req, env);
  if (path === '/v1/me/push_token' && method === 'DELETE') return deletePushToken(req, env);

  return jsonError(404, 'not_found');
}
