// localStorage persistence (SPEC.md §4). Keys match the iOS UserDefaults keys
// so the spec's table stays true for every client. Every read/write is
// wrapped: storage can throw (private mode, quota, blocked site data) and the
// game must keep working in memory when it does.

import type { Cell, Cells, Difficulty, Puzzle } from '../engine/types';

export const KEYS = {
  history: 'sudoku.history.v1',
  saves: 'sudoku.saves.v1',
  prefs: 'sudoku.prefs.v1',
  identity: 'sudoku.identity.v1',
  groups: 'sudoku.groups.v1',
  dailyCache: 'sudoku.daily_cache.v1',
  pendingScores: 'sudoku.pending_scores.v1',
  coach: 'sudoku.coach.completed.v1',
  nextId: 'sudoku.next_id.v1',
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* in-memory only this session */
  }
}

// --- Cells <-> JSON (Set has no JSON form) ---

type StoredCell = { v: number | null; f: boolean; n: number[] };

export function encodeCells(cells: Cells): StoredCell[][] {
  return cells.map((row) => row.map((c) => ({ v: c.value, f: c.isFixed, n: [...c.notes].sort() })));
}

export function decodeCells(stored: StoredCell[][]): Cells {
  return stored.map((row) => row.map((c): Cell => ({ value: c.v, isFixed: c.f, notes: new Set(c.n) })));
}

// --- Saves / history ---

export interface GameSave {
  puzzle: Puzzle;
  cells: Cells;
  elapsedSeconds: number;
  mistakeCount: number;
  lastPlayedAt: number; // unix-millis
  hintsUsed: number;
  pencilAssistsUsed: number;
  highlightMistakesEverOn: boolean;
  highlightConstraintsEverOn: boolean;
}

export interface PuzzleResult {
  puzzleID: number;
  completedAt: number; // unix-millis
  elapsedSeconds: number;
  mistakes?: number;
  puzzle: Puzzle | null;
}

type StoredSave = Omit<GameSave, 'cells'> & { cells: StoredCell[][] };

export function loadSaves(): Record<number, GameSave> {
  const raw = readJSON<Record<string, StoredSave>>(KEYS.saves, {});
  const out: Record<number, GameSave> = {};
  for (const [id, s] of Object.entries(raw)) {
    try {
      out[Number(id)] = { ...s, cells: decodeCells(s.cells) };
    } catch {
      /* drop a corrupt save rather than break launch */
    }
  }
  return out;
}

export function persistSaves(saves: Record<number, GameSave>): void {
  const raw: Record<string, StoredSave> = {};
  for (const [id, s] of Object.entries(saves)) raw[id] = { ...s, cells: encodeCells(s.cells) };
  writeJSON(KEYS.saves, raw);
}

export function loadHistory(): PuzzleResult[] {
  return readJSON<PuzzleResult[]>(KEYS.history, []);
}

export function persistHistory(h: PuzzleResult[]): void {
  writeJSON(KEYS.history, h);
}

// --- Preferences ---

export type Appearance = 'system' | 'light' | 'dark';

/** Colours a player can choose in Settings; unset keys keep the theme's own. */
export type ColorKey = 'accent' | 'done' | 'select' | 'match';

export interface Prefs {
  difficulty: Difficulty;
  appearance: Appearance;
  highlightMistakes: boolean;
  highlightConstraints: boolean;
  sound: boolean;
  colors: Partial<Record<ColorKey, string>>;
}

export const DEFAULT_PREFS: Prefs = {
  difficulty: 'medium',
  appearance: 'system',
  highlightMistakes: true,
  highlightConstraints: true,
  sound: true,
  colors: {},
};

export function loadPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...readJSON<Partial<Prefs>>(KEYS.prefs, {}) };
}

/** Generated puzzles use ids ≥ 1000; the counter survives reloads so ids stay unique per device. */
export function nextPuzzleId(): number {
  const id = readJSON<number>(KEYS.nextId, 1000);
  writeJSON(KEYS.nextId, id + 1);
  return id;
}
