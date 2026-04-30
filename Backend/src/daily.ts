import type { Difficulty, Env, PuzzleResponse } from './types';
import { jsonError, jsonOk } from './http';
import { generatePuzzle } from './generator';

const DEFAULT_DAILY_DIFFICULTY: Difficulty = 'medium';

export async function getDailyToday(env: Env): Promise<Response> {
  const today = dateInTimezone(new Date(), env.DAILY_TIMEZONE);
  const tomorrow = addDays(today, 1);

  const todayPuzzle = await ensureDailyForDate(env, today);
  const tomorrowPuzzle = await ensureDailyForDate(env, tomorrow);

  return jsonOk({ today: todayPuzzle, tomorrow: tomorrowPuzzle });
}

export async function getDailyByPuzzleId(env: Env, puzzleId: number): Promise<Response> {
  if (!Number.isInteger(puzzleId) || puzzleId < 19700101 || puzzleId > 99991231) {
    return jsonError(400, 'invalid_puzzle_id');
  }

  // Refuse future puzzles — we don't lazily generate ahead of "today".
  const todayId = dateToPuzzleId(dateInTimezone(new Date(), env.DAILY_TIMEZONE));
  if (puzzleId > todayId) return jsonError(404, 'not_yet_available');

  const date = puzzleIdToDate(puzzleId);
  if (!date) return jsonError(400, 'invalid_puzzle_id');

  const puzzle = await ensureDailyForDate(env, date);
  return jsonOk({ puzzle });
}

// Cron entry — pre-generates today and tomorrow if absent.
export async function ensureUpcomingDailies(env: Env): Promise<void> {
  const today = dateInTimezone(new Date(), env.DAILY_TIMEZONE);
  const tomorrow = addDays(today, 1);
  await ensureDailyForDate(env, today);
  await ensureDailyForDate(env, tomorrow);
}

async function ensureDailyForDate(env: Env, date: string): Promise<PuzzleResponse> {
  const puzzleId = dateToPuzzleId(date);

  const existing = await env.DB.prepare(
    'SELECT puzzle_id, date, difficulty, givens, solution FROM daily_puzzles WHERE puzzle_id = ?',
  )
    .bind(puzzleId)
    .first<{
      puzzle_id: number;
      date: string;
      difficulty: Difficulty;
      givens: string;
      solution: string;
    }>();

  if (existing) {
    return {
      puzzle_id: existing.puzzle_id,
      date: existing.date,
      difficulty: existing.difficulty,
      givens: JSON.parse(existing.givens),
      solution: JSON.parse(existing.solution),
    };
  }

  const { givens, solution } = generatePuzzle(puzzleId, DEFAULT_DAILY_DIFFICULTY);
  const generatedAt = Date.now();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO daily_puzzles
        (puzzle_id, date, difficulty, givens, solution, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      puzzleId,
      date,
      DEFAULT_DAILY_DIFFICULTY,
      JSON.stringify(givens),
      JSON.stringify(solution),
      generatedAt,
    )
    .run();

  return {
    puzzle_id: puzzleId,
    date,
    difficulty: DEFAULT_DAILY_DIFFICULTY,
    givens,
    solution,
  };
}

function dateInTimezone(d: Date, tz: string): string {
  // en-CA produces YYYY-MM-DD, sortable, no locale surprises.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getUTCDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function dateToPuzzleId(date: string): number {
  return parseInt(date.replace(/-/g, ''), 10);
}

function puzzleIdToDate(puzzleId: number): string | null {
  const s = puzzleId.toString();
  if (s.length !== 8) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10);
  const d = parseInt(s.slice(6, 8), 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Round-trip via Date to reject impossible dates (Feb 30 etc.).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
