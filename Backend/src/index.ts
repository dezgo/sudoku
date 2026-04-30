import type { Env } from './types';
import { jsonError } from './http';
import { authStart, authVerify } from './auth';
import { getMe, getMeGroups, putMe } from './me';
import {
  createGroup,
  getGroupMembers,
  joinGroup,
  leaveGroup,
} from './groups';
import { ensureUpcomingDailies, getDailyByPuzzleId, getDailyToday } from './daily';
import { getGroupScores, postScore } from './scores';

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
      console.error('scheduled task failed', err);
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { pathname: path } = url;
  const method = req.method;

  // Healthcheck — handy for "is the deploy alive?" curls.
  if (path === '/' && method === 'GET') {
    return new Response('sudoku-api ok', { headers: { 'content-type': 'text/plain' } });
  }

  if (path === '/v1/auth/start' && method === 'POST') return authStart(req, env);
  if (path === '/v1/auth/verify' && method === 'POST') return authVerify(req, env);

  if (path === '/v1/me' && method === 'GET') return getMe(req, env);
  if (path === '/v1/me' && method === 'PUT') return putMe(req, env);
  if (path === '/v1/me/groups' && method === 'GET') return getMeGroups(req, env);

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

  return jsonError(404, 'not_found');
}
