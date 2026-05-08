// Multiplayer v3: turn-based async sudoku for 2+ players.
// See ../multiplayer-design.md for the full design + locked decisions.
//
// Server is the source of truth: the live board is reconstructed on every
// state read from puzzle_givens + correct moves, so wrong placements never
// taint the actual board (per the design doc — wrong moves end the turn,
// log a "miss" to history, but don't fill the cell).

import type { Env, Difficulty, Grid } from './types';
import { jsonError, jsonOk, readJson } from './http';
import { requireAuth } from './auth';
import { generateMultiplayerGameId, generateInviteCode } from './crypto';
import { generatePuzzle } from './generator';
import { sendPush, type PushMessage } from './push';

const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const VALID_TURN_DURATIONS = [3600, 21600, 86400, 0]; // 1h, 6h, 24h, unlimited
const DEFAULT_TURN_DURATION = 86400; // 24h
const MAX_ACTIVE_GAMES_PER_USER = 10;
const MAX_INVITE_GENERATION_ATTEMPTS = 8;

// Used to derive a "puzzle id" for multiplayer games. Negative ints stay out
// of the way of daily ids (YYYYMMDD shape) and generator ids (>= 1000).
function newMultiplayerPuzzleId(): number {
  return -Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games
// ---------------------------------------------------------------------------

export async function createMultiplayerGame(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{
    difficulty?: string;
    turn_duration_seconds?: number;
    competitive_mode?: boolean;
    invited_user_ids?: string[];
    group_id?: string;
  }>(req);

  const difficulty = body?.difficulty;
  if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty as Difficulty)) {
    return jsonError(400, 'invalid_difficulty');
  }
  const turnDuration = body?.turn_duration_seconds ?? DEFAULT_TURN_DURATION;
  if (!VALID_TURN_DURATIONS.includes(turnDuration)) {
    return jsonError(400, 'invalid_turn_duration');
  }
  const competitive = body?.competitive_mode === true ? 1 : 0;

  // Cap concurrent active games per user.
  const activeCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM multiplayer_players mp
       JOIN multiplayer_games g ON g.id = mp.game_id
      WHERE mp.user_id = ?
        AND mp.status = 'joined'
        AND g.status IN ('pending', 'active')`,
  )
    .bind(auth.user_id)
    .first<{ n: number }>();
  if ((activeCount?.n ?? 0) >= MAX_ACTIVE_GAMES_PER_USER) {
    return jsonError(409, 'too_many_active_games');
  }

  // Resolve invitee list: explicit user_ids OR all members of a group.
  let inviteeIds: string[] = [];
  if (body?.group_id) {
    const members = await env.DB.prepare(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?',
    )
      .bind(body.group_id, auth.user_id)
      .all<{ user_id: string }>();
    inviteeIds = (members.results ?? []).map((r) => r.user_id);
  } else if (Array.isArray(body?.invited_user_ids)) {
    inviteeIds = body.invited_user_ids.filter((id) => id !== auth.user_id);
  }
  // Deduplicate.
  inviteeIds = Array.from(new Set(inviteeIds));

  // Generate the puzzle. Multiplayer games use a fresh puzzle each time
  // (independent of daily, per design §9.5).
  const puzzleId = newMultiplayerPuzzleId();
  const { givens, solution } = generatePuzzle(puzzleId, difficulty as Difficulty);

  // Mint an invite code.
  let inviteCode: string | null = null;
  for (let i = 0; i < MAX_INVITE_GENERATION_ATTEMPTS; i++) {
    const candidate = generateInviteCode();
    const exists = await env.DB.prepare(
      'SELECT 1 FROM multiplayer_games WHERE invite_code = ?',
    )
      .bind(candidate)
      .first();
    if (!exists) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) return jsonError(500, 'invite_code_collision');

  const gameId = generateMultiplayerGameId();
  const now = Date.now();

  // Insert the game + the host as join_order=0 (joined). Invitees go in as
  // 'invited' with sequential join_order so rotation is deterministic.
  const stmts = [
    env.DB.prepare(
      `INSERT INTO multiplayer_games
         (id, puzzle_id, puzzle_givens, puzzle_solution, difficulty,
          created_by, created_at, status, active_player_id,
          turn_deadline, turn_duration_seconds, competitive_mode, invite_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`,
    ).bind(
      gameId,
      puzzleId,
      JSON.stringify(givens),
      JSON.stringify(solution),
      difficulty,
      auth.user_id,
      now,
      turnDuration,
      competitive,
      inviteCode,
    ),
    env.DB.prepare(
      `INSERT INTO multiplayer_players
         (game_id, user_id, join_order, status, joined_at)
        VALUES (?, ?, 0, 'joined', ?)`,
    ).bind(gameId, auth.user_id, now),
  ];
  inviteeIds.forEach((uid, idx) => {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO multiplayer_players
           (game_id, user_id, join_order, status)
          VALUES (?, ?, ?, 'invited')`,
      ).bind(gameId, uid, idx + 1),
    );
  });
  await env.DB.batch(stmts);

  // Push: invitees see "X invited you to a sudoku game".
  // Fire-and-forget — don't fail the request if push fails.
  if (inviteeIds.length > 0) {
    const hostName = await displayNameOf(env, auth.user_id);
    await Promise.all(
      inviteeIds.map((uid) =>
        sendPush(env, uid, {
          title: 'New sudoku game',
          body: `${hostName ?? 'A friend'} invited you to play.`,
          data: { kind: 'mp_invite', game_id: gameId },
        }).catch((e) => console.error('push failed', e)),
      ),
    );
  }

  const gameRow = await loadGameRow(env, gameId);
  return jsonOk({
    game: serializeGame(gameRow!, auth.user_id),
    invite_code: inviteCode,
  });
}

// ---------------------------------------------------------------------------
// GET /v1/multiplayer/games/:id
// ---------------------------------------------------------------------------

export async function getMultiplayerGame(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const game = await loadGameRow(env, gameId);
  if (!game) return jsonError(404, 'unknown_game');

  // Caller must be a player (any status) OR have the invite code (handled by join).
  const player = await env.DB.prepare(
    'SELECT status FROM multiplayer_players WHERE game_id = ? AND user_id = ?',
  )
    .bind(gameId, auth.user_id)
    .first<{ status: string }>();
  if (!player) return jsonError(403, 'not_a_player');

  const players = await loadPlayers(env, gameId);
  const moves = await loadMoves(env, gameId);
  const board = reconstructBoard(JSON.parse(game.puzzle_givens!), moves);

  return jsonOk({
    game: serializeGame(game, auth.user_id),
    players,
    moves: moves.map(serializeMove),
    board,
  });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games/:id/join
// ---------------------------------------------------------------------------

export async function joinMultiplayerGame(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ invite_code?: string }>(req);
  const code = body?.invite_code?.trim().toUpperCase();

  const game = await loadGameRow(env, gameId);
  if (!game) return jsonError(404, 'unknown_game');
  if (game.status !== 'pending' && game.status !== 'active') {
    return jsonError(409, 'game_not_joinable');
  }

  // If user is already in players (invited or otherwise), accept directly.
  const existing = await env.DB.prepare(
    'SELECT status, join_order FROM multiplayer_players WHERE game_id = ? AND user_id = ?',
  )
    .bind(gameId, auth.user_id)
    .first<{ status: string; join_order: number }>();

  if (existing) {
    if (existing.status === 'joined') return jsonOk({ game: serializeGame(game, auth.user_id) });
    if (existing.status === 'left' || existing.status === 'declined') {
      return jsonError(409, 'cannot_rejoin');
    }
    // 'invited' -> 'joined'
    await env.DB.prepare(
      `UPDATE multiplayer_players SET status = 'joined', joined_at = ?
        WHERE game_id = ? AND user_id = ?`,
    )
      .bind(Date.now(), gameId, auth.user_id)
      .run();
  } else {
    // Not in players list — must have invite code.
    if (!code || code !== game.invite_code) return jsonError(403, 'invalid_invite_code');
    if (game.status !== 'pending') return jsonError(409, 'game_already_started');
    // Append to player list at the end of join_order.
    const max = await env.DB.prepare(
      'SELECT MAX(join_order) AS m FROM multiplayer_players WHERE game_id = ?',
    )
      .bind(gameId)
      .first<{ m: number | null }>();
    const nextOrder = (max?.m ?? -1) + 1;
    await env.DB.prepare(
      `INSERT INTO multiplayer_players
         (game_id, user_id, join_order, status, joined_at)
        VALUES (?, ?, ?, 'joined', ?)`,
    )
      .bind(gameId, auth.user_id, nextOrder, Date.now())
      .run();
  }

  return jsonOk({ game: serializeGame(game, auth.user_id) });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/join-by-code
//
// Used by the universal-link / app-link flow where the user lands on the
// invite page from a shared URL — the URL only carries the 6-char invite
// code, not the game ID. Server looks up the game and joins atomically.
// ---------------------------------------------------------------------------

export async function joinMultiplayerByCode(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ invite_code?: string }>(req);
  const code = body?.invite_code?.trim().toUpperCase();
  if (!code) return jsonError(400, 'missing_invite_code');

  const game = await env.DB.prepare(
    `SELECT id, status FROM multiplayer_games WHERE invite_code = ?`,
  )
    .bind(code)
    .first<{ id: string; status: string }>();
  if (!game) return jsonError(404, 'unknown_invite_code');
  if (game.status !== 'pending' && game.status !== 'active') {
    return jsonError(409, 'game_not_joinable');
  }

  // Reuse the player-by-id join logic by checking existing membership.
  const existing = await env.DB.prepare(
    'SELECT status, join_order FROM multiplayer_players WHERE game_id = ? AND user_id = ?',
  )
    .bind(game.id, auth.user_id)
    .first<{ status: string; join_order: number }>();

  if (existing) {
    if (existing.status === 'joined') {
      const refreshed = await loadGameRow(env, game.id);
      return jsonOk({ game: serializeGame(refreshed!, auth.user_id) });
    }
    if (existing.status === 'left' || existing.status === 'declined') {
      return jsonError(409, 'cannot_rejoin');
    }
    await env.DB.prepare(
      `UPDATE multiplayer_players SET status = 'joined', joined_at = ?
        WHERE game_id = ? AND user_id = ?`,
    )
      .bind(Date.now(), game.id, auth.user_id)
      .run();
  } else {
    if (game.status !== 'pending') return jsonError(409, 'game_already_started');
    const max = await env.DB.prepare(
      'SELECT MAX(join_order) AS m FROM multiplayer_players WHERE game_id = ?',
    )
      .bind(game.id)
      .first<{ m: number | null }>();
    const nextOrder = (max?.m ?? -1) + 1;
    await env.DB.prepare(
      `INSERT INTO multiplayer_players
         (game_id, user_id, join_order, status, joined_at)
        VALUES (?, ?, ?, 'joined', ?)`,
    )
      .bind(game.id, auth.user_id, nextOrder, Date.now())
      .run();
  }

  const refreshed = await loadGameRow(env, game.id);
  return jsonOk({ game: serializeGame(refreshed!, auth.user_id) });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games/:id/decline
// ---------------------------------------------------------------------------

export async function declineMultiplayerGame(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const player = await env.DB.prepare(
    'SELECT status FROM multiplayer_players WHERE game_id = ? AND user_id = ?',
  )
    .bind(gameId, auth.user_id)
    .first<{ status: string }>();
  if (!player) return jsonError(404, 'not_invited');
  if (player.status !== 'invited') return jsonError(409, 'cannot_decline');

  await env.DB.prepare(
    `UPDATE multiplayer_players SET status = 'declined' WHERE game_id = ? AND user_id = ?`,
  )
    .bind(gameId, auth.user_id)
    .run();

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games/:id/leave
// ---------------------------------------------------------------------------

export async function leaveMultiplayerGame(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const game = await loadGameRow(env, gameId);
  if (!game) return jsonError(404, 'unknown_game');

  const player = await env.DB.prepare(
    'SELECT status FROM multiplayer_players WHERE game_id = ? AND user_id = ?',
  )
    .bind(gameId, auth.user_id)
    .first<{ status: string }>();
  if (!player || player.status !== 'joined') return jsonError(403, 'not_a_player');

  await env.DB.prepare(
    `UPDATE multiplayer_players SET status = 'left' WHERE game_id = ? AND user_id = ?`,
  )
    .bind(gameId, auth.user_id)
    .run();

  // If the leaver was the active player, immediately rotate.
  if (game.active_player_id === auth.user_id) {
    await rotateActivePlayer(env, gameId);
  }

  // If only 1 joined player remains, abandon the game.
  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM multiplayer_players
      WHERE game_id = ? AND status = 'joined'`,
  )
    .bind(gameId)
    .first<{ n: number }>();
  if ((remaining?.n ?? 0) < 2 && game.status === 'active') {
    await env.DB.prepare(
      `UPDATE multiplayer_games SET status = 'abandoned', completed_at = ?
        WHERE id = ?`,
    )
      .bind(Date.now(), gameId)
      .run();
    await broadcastGameEnd(env, gameId);
  }

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games/:id/start
// ---------------------------------------------------------------------------

export async function startMultiplayerGame(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const game = await loadGameRow(env, gameId);
  if (!game) return jsonError(404, 'unknown_game');
  if (game.created_by !== auth.user_id) return jsonError(403, 'not_host');
  if (game.status !== 'pending') return jsonError(409, 'already_started');

  // Need ≥2 joined players to start.
  const joined = await env.DB.prepare(
    `SELECT user_id, join_order FROM multiplayer_players
      WHERE game_id = ? AND status = 'joined'
      ORDER BY join_order ASC`,
  )
    .bind(gameId)
    .all<{ user_id: string; join_order: number }>();
  const joinedRows = joined.results ?? [];
  if (joinedRows.length < 2) return jsonError(409, 'need_two_players');

  // Host always goes first.
  const firstPlayer = joinedRows[0]!.user_id;
  const deadline = game.turn_duration_seconds === 0
    ? null
    : Date.now() + game.turn_duration_seconds * 1000;
  await env.DB.prepare(
    `UPDATE multiplayer_games
        SET status = 'active', active_player_id = ?, turn_deadline = ?
      WHERE id = ?`,
  )
    .bind(firstPlayer, deadline, gameId)
    .run();

  // Push the first player.
  await sendPush(env, firstPlayer, {
    title: "It's your turn",
    body: "Place a digit to keep the game moving.",
    data: { kind: 'mp_your_turn', game_id: gameId },
  }).catch((e) => console.error('push failed', e));

  const refreshed = await loadGameRow(env, gameId);
  return jsonOk({ game: serializeGame(refreshed!, auth.user_id) });
}

// ---------------------------------------------------------------------------
// POST /v1/multiplayer/games/:id/moves
// ---------------------------------------------------------------------------

export async function postMultiplayerMove(
  req: Request,
  env: Env,
  gameId: string,
): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{
    row?: number;
    col?: number;
    value?: number;
    idempotency_key?: string;
  }>(req);

  const { row, col, value, idempotency_key } = body ?? {};
  if (
    !Number.isInteger(row) || row! < 0 || row! > 8 ||
    !Number.isInteger(col) || col! < 0 || col! > 8 ||
    !Number.isInteger(value) || value! < 1 || value! > 9 ||
    !idempotency_key
  ) {
    return jsonError(400, 'invalid_move');
  }

  const game = await loadGameRow(env, gameId);
  if (!game) return jsonError(404, 'unknown_game');
  if (game.status !== 'active') return jsonError(409, 'game_not_active');
  if (game.active_player_id !== auth.user_id) return jsonError(403, 'not_your_turn');

  // Idempotency: if we've seen this key for this game, return the prior result.
  const priorMove = await env.DB.prepare(
    `SELECT id, move_index, player_id, row, col, value, was_correct, placed_at
       FROM multiplayer_moves
      WHERE game_id = ? AND idempotency_key = ?`,
  )
    .bind(gameId, idempotency_key)
    .first<MultiplayerMoveRow>();
  if (priorMove) {
    const refreshed = await loadGameRow(env, gameId);
    const board = reconstructBoard(
      JSON.parse(refreshed!.puzzle_givens!),
      await loadMoves(env, gameId),
    );
    return jsonOk({
      move: serializeMove(priorMove),
      game: serializeGame(refreshed!, auth.user_id),
      board,
    });
  }

  // Reconstruct the live board to validate the cell is empty.
  const moves = await loadMoves(env, gameId);
  const givens: Grid = JSON.parse(game.puzzle_givens!);
  const board = reconstructBoard(givens, moves);
  if (board[row!]![col!] !== 0) return jsonError(409, 'cell_not_empty');

  // Was the placement correct?
  const solution: Grid = JSON.parse(game.puzzle_solution!);
  const wasCorrect = solution[row!]![col!] === value ? 1 : 0;

  // Determine move_index.
  const maxIdx = await env.DB.prepare(
    'SELECT MAX(move_index) AS m FROM multiplayer_moves WHERE game_id = ?',
  )
    .bind(gameId)
    .first<{ m: number | null }>();
  const moveIndex = (maxIdx?.m ?? -1) + 1;

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO multiplayer_moves
       (game_id, move_index, player_id, row, col, value, was_correct, placed_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(gameId, moveIndex, auth.user_id, row, col, value, wasCorrect, now, idempotency_key)
    .run();

  // Apply the move to the board (only if correct) and check for solve.
  if (wasCorrect) board[row!]![col!] = value!;
  const isSolved = boardIsFull(board);

  if (isSolved) {
    // Winner = the player who placed the LAST correct digit (matches "Solver"
    // badge). Stats salad still computed at end-of-game by the client.
    await env.DB.prepare(
      `UPDATE multiplayer_games
          SET status = 'completed', winner_id = ?, completed_at = ?,
              active_player_id = NULL, turn_deadline = NULL
        WHERE id = ?`,
    )
      .bind(auth.user_id, now, gameId)
      .run();
    await broadcastGameEnd(env, gameId);
  } else {
    await rotateActivePlayer(env, gameId);
  }

  const refreshed = await loadGameRow(env, gameId);
  const refreshedMoves = await loadMoves(env, gameId);
  const refreshedBoard = reconstructBoard(givens, refreshedMoves);
  const newMove = await env.DB.prepare(
    `SELECT id, move_index, player_id, row, col, value, was_correct, placed_at
       FROM multiplayer_moves
      WHERE game_id = ? AND idempotency_key = ?`,
  )
    .bind(gameId, idempotency_key)
    .first<MultiplayerMoveRow>();

  return jsonOk({
    move: serializeMove(newMove!),
    game: serializeGame(refreshed!, auth.user_id),
    board: refreshedBoard,
  });
}

// ---------------------------------------------------------------------------
// GET /v1/me/multiplayer/games
// ---------------------------------------------------------------------------

export async function listMyMultiplayerGames(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const rows = await env.DB.prepare(
    `SELECT g.id, g.status, g.active_player_id, g.turn_deadline,
            g.turn_duration_seconds, g.competitive_mode, g.created_by,
            g.created_at, g.completed_at, g.winner_id, g.invite_code,
            g.difficulty, g.puzzle_id
       FROM multiplayer_games g
       JOIN multiplayer_players mp ON mp.game_id = g.id
      WHERE mp.user_id = ?
        AND mp.status IN ('joined', 'invited')
      ORDER BY g.created_at DESC
      LIMIT 50`,
  )
    .bind(auth.user_id)
    .all<MultiplayerGameRow>();

  const allGames = rows.results ?? [];
  const inProgress = allGames.filter(
    (g) => g.status === 'pending' || g.status === 'active',
  );
  const completed = allGames.filter(
    (g) => g.status === 'completed' || g.status === 'abandoned',
  );

  return jsonOk({
    in_progress: inProgress.map((g) => serializeGame(g, auth.user_id)),
    completed: completed.map((g) => serializeGame(g, auth.user_id)),
  });
}

// ---------------------------------------------------------------------------
// POST /v1/me/push_token
// DELETE /v1/me/push_token
// ---------------------------------------------------------------------------

export async function registerPushToken(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ platform?: string; token?: string }>(req);
  const platform = body?.platform;
  const token = body?.token?.trim();
  if (!platform || (platform !== 'ios' && platform !== 'android')) {
    return jsonError(400, 'invalid_platform');
  }
  if (!token) return jsonError(400, 'missing_token');

  await env.DB.prepare(
    `INSERT INTO push_tokens (user_id, platform, token, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         platform = excluded.platform,
         updated_at = excluded.updated_at`,
  )
    .bind(auth.user_id, platform, token, Date.now())
    .run();

  return new Response(null, { status: 204 });
}

export async function deletePushToken(req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const body = await readJson<{ token?: string }>(req);
  const token = body?.token?.trim();
  if (!token) return jsonError(400, 'missing_token');

  await env.DB.prepare('DELETE FROM push_tokens WHERE user_id = ? AND token = ?')
    .bind(auth.user_id, token)
    .run();

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Forfeit cron — invoked by index.ts scheduled handler each minute.
// ---------------------------------------------------------------------------

export async function processForfeits(env: Env): Promise<void> {
  const now = Date.now();
  // Find active games whose deadline has passed (and isn't NULL — unlimited).
  const expired = await env.DB.prepare(
    `SELECT id, active_player_id FROM multiplayer_games
      WHERE status = 'active' AND turn_deadline IS NOT NULL AND turn_deadline < ?`,
  )
    .bind(now)
    .all<{ id: string; active_player_id: string }>();
  for (const g of expired.results ?? []) {
    await env.DB.prepare(
      `INSERT INTO multiplayer_forfeits (game_id, player_id, forfeited_at)
        VALUES (?, ?, ?)`,
    )
      .bind(g.id, g.active_player_id, now)
      .run();
    // Notify the forfeiter.
    sendPush(env, g.active_player_id, {
      title: 'Turn forfeited',
      body: 'You ran out of time on a sudoku game.',
      data: { kind: 'mp_forfeit', game_id: g.id },
    }).catch((e) => console.error('push failed', e));
    await rotateActivePlayer(env, g.id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MultiplayerGameRow {
  id: string;
  puzzle_id?: number;
  puzzle_givens?: string;
  puzzle_solution?: string;
  difficulty: string;
  created_by: string;
  created_at: number;
  status: string;
  active_player_id: string | null;
  turn_deadline: number | null;
  turn_duration_seconds: number;
  competitive_mode: number;
  invite_code: string;
  winner_id: string | null;
  completed_at: number | null;
}

interface MultiplayerPlayerRow {
  user_id: string;
  display_name: string | null;
  join_order: number;
  status: string;
  joined_at: number | null;
}

interface MultiplayerMoveRow {
  id: number;
  move_index: number;
  player_id: string;
  row: number;
  col: number;
  value: number;
  was_correct: number;
  placed_at: number;
}

async function loadGameRow(env: Env, gameId: string): Promise<MultiplayerGameRow | null> {
  return await env.DB.prepare(
    `SELECT id, puzzle_id, puzzle_givens, puzzle_solution, difficulty,
            created_by, created_at, status, active_player_id, turn_deadline,
            turn_duration_seconds, competitive_mode, invite_code, winner_id,
            completed_at
       FROM multiplayer_games WHERE id = ?`,
  )
    .bind(gameId)
    .first<MultiplayerGameRow>();
}

async function loadPlayers(env: Env, gameId: string): Promise<unknown[]> {
  const result = await env.DB.prepare(
    `SELECT mp.user_id, u.display_name, mp.join_order, mp.status, mp.joined_at
       FROM multiplayer_players mp
       JOIN users u ON u.id = mp.user_id
      WHERE mp.game_id = ?
      ORDER BY mp.join_order ASC`,
  )
    .bind(gameId)
    .all<MultiplayerPlayerRow>();
  return (result.results ?? []).map((p) => ({
    user: { id: p.user_id, display_name: p.display_name },
    join_order: p.join_order,
    status: p.status,
    joined_at: p.joined_at,
  }));
}

async function loadMoves(env: Env, gameId: string): Promise<MultiplayerMoveRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, move_index, player_id, row, col, value, was_correct, placed_at
       FROM multiplayer_moves
      WHERE game_id = ?
      ORDER BY move_index ASC`,
  )
    .bind(gameId)
    .all<MultiplayerMoveRow>();
  return result.results ?? [];
}

function reconstructBoard(givens: Grid, moves: MultiplayerMoveRow[]): Grid {
  const board: Grid = givens.map((row) => row.slice());
  for (const m of moves) {
    if (m.was_correct === 1) board[m.row]![m.col] = m.value;
  }
  return board;
}

function boardIsFull(board: Grid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r]![c] === 0) return false;
    }
  }
  return true;
}

async function rotateActivePlayer(env: Env, gameId: string): Promise<void> {
  const game = await loadGameRow(env, gameId);
  if (!game) return;
  const players = await env.DB.prepare(
    `SELECT user_id, join_order FROM multiplayer_players
      WHERE game_id = ? AND status = 'joined'
      ORDER BY join_order ASC`,
  )
    .bind(gameId)
    .all<{ user_id: string; join_order: number }>();
  const joined = players.results ?? [];
  if (joined.length < 2) {
    // Not enough players left — leaveMultiplayerGame handles abandonment;
    // here just clear the active state.
    await env.DB.prepare(
      `UPDATE multiplayer_games
          SET active_player_id = NULL, turn_deadline = NULL
        WHERE id = ?`,
    )
      .bind(gameId)
      .run();
    return;
  }
  // Find current player's index in the rotation; pick the next one.
  const currentIdx = joined.findIndex((p) => p.user_id === game.active_player_id);
  const nextIdx = (currentIdx + 1) % joined.length;
  const next = joined[nextIdx]!;
  const deadline = game.turn_duration_seconds === 0
    ? null
    : Date.now() + game.turn_duration_seconds * 1000;
  await env.DB.prepare(
    `UPDATE multiplayer_games
        SET active_player_id = ?, turn_deadline = ?
      WHERE id = ?`,
  )
    .bind(next.user_id, deadline, gameId)
    .run();
  // Push: it's the next player's turn.
  sendPush(env, next.user_id, {
    title: "It's your turn",
    body: 'Place a digit to keep the sudoku going.',
    data: { kind: 'mp_your_turn', game_id: gameId },
  }).catch((e) => console.error('push failed', e));
}

async function broadcastGameEnd(env: Env, gameId: string): Promise<void> {
  const players = await env.DB.prepare(
    `SELECT user_id FROM multiplayer_players WHERE game_id = ? AND status = 'joined'`,
  )
    .bind(gameId)
    .all<{ user_id: string }>();
  const game = await loadGameRow(env, gameId);
  if (!game) return;
  const status = game.status;
  const msg: PushMessage = {
    title: status === 'completed' ? 'Game over — solved!' : 'Game over',
    body: status === 'completed'
      ? 'See who took the win and check your stats.'
      : 'The game was abandoned.',
    data: { kind: 'mp_game_end', game_id: gameId },
  };
  await Promise.all(
    (players.results ?? []).map((p) =>
      sendPush(env, p.user_id, msg).catch((e) => console.error('push failed', e)),
    ),
  );
}

async function displayNameOf(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT display_name FROM users WHERE id = ?')
    .bind(userId)
    .first<{ display_name: string | null }>();
  return row?.display_name ?? null;
}

function serializeGame(g: MultiplayerGameRow, viewerId: string): unknown {
  const isMyTurn = g.active_player_id === viewerId;
  const timeRemaining = g.turn_deadline !== null
    ? Math.max(0, Math.floor((g.turn_deadline - Date.now()) / 1000))
    : null;
  return {
    id: g.id,
    puzzle_id: g.puzzle_id,
    difficulty: g.difficulty,
    status: g.status,
    active_player_id: g.active_player_id,
    turn_deadline: g.turn_deadline,
    turn_duration_seconds: g.turn_duration_seconds,
    competitive_mode: g.competitive_mode === 1,
    created_by: g.created_by,
    created_at: g.created_at,
    completed_at: g.completed_at,
    winner_id: g.winner_id,
    invite_code: g.invite_code,
    is_my_turn: isMyTurn,
    time_remaining_seconds: timeRemaining,
  };
}

function serializeMove(m: MultiplayerMoveRow): unknown {
  return {
    move_index: m.move_index,
    player_id: m.player_id,
    row: m.row,
    col: m.col,
    value: m.value,
    was_correct: m.was_correct === 1,
    placed_at: m.placed_at,
  };
}
