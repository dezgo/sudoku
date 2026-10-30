// Thin client for the Worker API (SPEC.md §17.5). Same origin in production
// (the PWA is served by the same Worker at /play), so no CORS and no base
// URL to configure. Wire shapes stay snake_case — no key conversion layer.

import type { Difficulty, Grid, Puzzle } from '../engine/types';

export type ApiErrorKind = 'offline' | 'http' | 'decode';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    public status = 0,
    public detail?: string,
  ) {
    super(`${kind}${status ? ` ${status}` : ''}${detail ? `: ${detail}` : ''}`);
  }
}

export interface ApiUser {
  id: string;
  display_name: string | null;
}
export interface ApiGroup {
  id: string;
  name: string;
}
export interface GroupListItem {
  group: ApiGroup;
  member_count: number;
  invite_code: string | null;
}
export interface GroupMember {
  user: ApiUser;
  dailies_completed: number;
  last_completed_at: number | null;
}
export interface PuzzleResponse {
  puzzle_id: number;
  date: string;
  difficulty: Difficulty;
  givens: Grid;
  solution: Grid;
}
export interface SharedPuzzleResponse {
  name: string;
  difficulty: Difficulty;
  givens: Grid;
  solution: Grid;
  shared_by: string | null;
  sharer_seconds: number | null;
}
export interface RemoteScore {
  puzzle_id: number;
  elapsed_seconds: number;
  mistakes: number;
  completed_at: number;
  hints_used: number;
  pencil_assists_used: number;
  highlight_mistakes_was_on: boolean;
  highlight_rules_was_on: boolean;
  difficulty: Difficulty;
  date: string;
  givens: Grid;
  solution: Grid;
}
export interface LeaderboardEntry {
  display_name: string | null;
  elapsed_seconds: number;
  effective_seconds?: number;
  completed_at: number;
  rank: number;
  hints_used: number;
  pencil_assists_used: number;
  highlight_mistakes_was_on: boolean;
  highlight_rules_was_on: boolean;
  flawless: boolean;
}
export interface StandingsEntry {
  display_name: string | null;
  rank: number;
  played: number;
  wins: number;
  average_seconds: number;
  best_seconds: number;
}
export interface ScoreSubmission {
  puzzle_id: number;
  elapsed_seconds: number;
  mistakes: number;
  hints_used: number;
  pencil_assists_used: number;
  highlight_mistakes_was_on: boolean;
  highlight_rules_was_on: boolean;
}

export type MultiplayerStatus = 'pending' | 'active' | 'completed' | 'abandoned';
export interface MultiplayerGame {
  id: string;
  puzzle_id: number;
  difficulty: Difficulty;
  status: MultiplayerStatus;
  active_player_id: string | null;
  turn_deadline: number | null;
  turn_duration_seconds: number;
  competitive_mode: boolean;
  created_by: string;
  created_at: number;
  completed_at: number | null;
  winner_id: string | null;
  invite_code: string;
  is_my_turn: boolean;
  time_remaining_seconds: number | null;
}
export interface MultiplayerPlayer {
  user: ApiUser;
  join_order: number;
  status: 'invited' | 'joined' | 'declined' | 'left';
  joined_at: number | null;
}
export interface MultiplayerMove {
  move_index: number;
  player_id: string;
  row: number;
  col: number;
  value: number;
  was_correct: boolean;
  placed_at: number;
}
export interface MultiplayerGameDetail {
  game: MultiplayerGame;
  players: MultiplayerPlayer[];
  moves: MultiplayerMove[];
  board: Grid;
}

export function toPuzzle(p: PuzzleResponse): Puzzle {
  return { id: p.puzzle_id, difficulty: p.difficulty, givens: p.givens, solution: p.solution };
}

/** Fired on any 401 to an authed request — the auth store clears the stale token. */
export const UNAUTHORIZED_EVENT = 'sudoku:unauthorized';

async function send<T>(path: string, method: string, token?: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let resp: Response;
  try {
    resp = await fetch(`/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when no answer came back at all — no network, DNS
    // failure, refused connection. The apps lumped those into a generic
    // "something went wrong", which made the Aug 2026 outage look like a bug.
    throw new ApiError('offline');
  }
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      detail = (await resp.json()).error;
    } catch {
      /* non-JSON error body */
    }
    if (resp.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError('http', resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  try {
    return (await resp.json()) as T;
  } catch {
    throw new ApiError('decode');
  }
}

type MpCreateBody = {
  difficulty: Difficulty;
  turn_duration_seconds: number;
  competitive_mode: boolean;
  invited_user_ids?: string[];
  group_id?: string;
};

export const api = {
  authStart: (email: string) => send<void>('auth/start', 'POST', null, { email }),
  authVerify: (email: string, code: string) =>
    send<{ token: string; user: ApiUser; needs_display_name: boolean }>('auth/verify', 'POST', null, { email, code }),
  me: (t: string) => send<{ user: ApiUser }>('me', 'GET', t).then((r) => r.user),
  putMe: (t: string, display_name: string) =>
    send<{ user: ApiUser }>('me', 'PUT', t, { display_name }).then((r) => r.user),
  deleteMe: (t: string) => send<void>('me', 'DELETE', t),
  meGroups: (t: string) => send<GroupListItem[]>('me/groups', 'GET', t),
  meScores: (t: string) => send<{ scores: RemoteScore[] }>('me/scores', 'GET', t).then((r) => r.scores),
  createGroup: (t: string, name: string) =>
    send<{ group: ApiGroup; invite_code: string }>('groups', 'POST', t, { name }),
  joinGroup: (t: string, invite_code: string) =>
    send<{ group: ApiGroup }>('groups/join', 'POST', t, { invite_code }).then((r) => r.group),
  leaveGroup: (t: string, id: string) => send<void>(`groups/${id}/members/me`, 'DELETE', t),
  groupMembers: (t: string, id: string) => send<GroupMember[]>(`groups/${id}/members`, 'GET', t),
  dailyToday: () => send<{ today: PuzzleResponse; tomorrow: PuzzleResponse }>('daily/today', 'GET'),
  daily: (puzzleId: number) => send<{ puzzle: PuzzleResponse }>(`daily/${puzzleId}`, 'GET').then((r) => r.puzzle),
  shareCreate: (t: string, givens: Grid, difficulty: Difficulty, elapsed_seconds?: number) =>
    send<{ name: string }>('shared', 'POST', t, { givens, difficulty, elapsed_seconds }).then((r) => r.name),
  shared: (name: string) => send<SharedPuzzleResponse>(`shared/${name}`, 'GET'),
  postScore: (t: string, s: ScoreSubmission) => send<{ rank: number }>('scores', 'POST', t, s).then((r) => r.rank),
  groupScores: (t: string, groupId: string, puzzleId: number) =>
    send<LeaderboardEntry[]>(`groups/${groupId}/scores/${puzzleId}`, 'GET', t),
  groupStandings: (t: string, groupId: string, from: number, to: number) =>
    send<StandingsEntry[]>(`groups/${groupId}/standings?from=${from}&to=${to}`, 'GET', t),

  mpCreate: (t: string, body: MpCreateBody) =>
    send<{ game: MultiplayerGame; invite_code: string }>('multiplayer/games', 'POST', t, body),
  mpGame: (t: string, id: string) => send<MultiplayerGameDetail>(`multiplayer/games/${id}`, 'GET', t),
  mpJoin: (t: string, id: string, invite_code?: string) =>
    send<{ game: MultiplayerGame }>(`multiplayer/games/${id}/join`, 'POST', t, invite_code ? { invite_code } : {}).then(
      (r) => r.game,
    ),
  mpJoinByCode: (t: string, invite_code: string) =>
    send<{ game: MultiplayerGame }>('multiplayer/join-by-code', 'POST', t, { invite_code }).then((r) => r.game),
  mpDecline: (t: string, id: string) => send<void>(`multiplayer/games/${id}/decline`, 'POST', t),
  mpLeave: (t: string, id: string) => send<void>(`multiplayer/games/${id}/leave`, 'POST', t),
  mpStart: (t: string, id: string) =>
    send<{ game: MultiplayerGame }>(`multiplayer/games/${id}/start`, 'POST', t).then((r) => r.game),
  mpMove: (t: string, id: string, row: number, col: number, value: number, idempotency_key: string) =>
    send<{ move: MultiplayerMove; game: MultiplayerGame; board: Grid }>(`multiplayer/games/${id}/moves`, 'POST', t, {
      row,
      col,
      value,
      idempotency_key,
    }),
  mpMine: (t: string) =>
    send<{ in_progress: MultiplayerGame[]; completed: MultiplayerGame[] }>('me/multiplayer/games', 'GET', t),
};
