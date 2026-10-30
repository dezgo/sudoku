// Puzzle generator + uniqueness solver — straight port of iOS
// `PuzzleGenerator.swift` (SPEC.md §6). Generation is CPU-heavy (up to 25
// generate-and-classify attempts), so the app runs it in a Web Worker
// (gen.worker.ts) to keep the board responsive.

import { grade } from './tutor';
import { cellsFromGivens, type Difficulty, type Grid, type Puzzle } from './types';

export type Rng = () => number; // uniform [0, 1)

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlace(d: number, r: number, c: number, grid: Grid): boolean {
  for (let i = 0; i < 9; i++) if (grid[r][i] === d || grid[i][c] === d) return false;
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) if (grid[rr][cc] === d) return false;
  return true;
}

function fill(grid: Grid, rng: Rng): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
        if (!canPlace(d, r, c, grid)) continue;
        grid[r][c] = d;
        if (fill(grid, rng)) return true;
        grid[r][c] = 0;
      }
      return false;
    }
  return true;
}

export function generateSolution(rng: Rng): Grid {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  fill(grid, rng);
  return grid;
}

function gridCandidates(r: number, c: number, grid: Grid): number[] {
  const used = new Array(10).fill(false);
  for (let i = 0; i < 9; i++) {
    used[grid[r][i]] = true;
    used[grid[i][c]] = true;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used[grid[rr][cc]] = true;
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (!used[d]) out.push(d);
  return out;
}

/** Backtracking with Minimum Remaining Values; stops at `limit` solutions. */
export function countSolutions(input: Grid, limit = 2): number {
  const grid = input.map((row) => [...row]);
  let found = 0;
  const search = (): boolean => {
    let best: { r: number; c: number; cands: number[] } | null = null;
    for (let r = 0; r < 9 && !(best && best.cands.length <= 1); r++)
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = gridCandidates(r, c, grid);
        if (!best || cands.length < best.cands.length) {
          best = { r, c, cands };
          if (cands.length <= 1) break;
        }
      }
    if (!best) {
      found++;
      return found >= limit;
    }
    for (const d of best.cands) {
      grid[best.r][best.c] = d;
      if (search()) return true;
      grid[best.r][best.c] = 0;
    }
    return false;
  };
  search();
  return found;
}

export function makePuzzle(solution: Grid, targetGivens: number, rng: Rng): Grid {
  const grid = solution.map((row) => [...row]);
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng,
  );
  let givens = 81;
  for (const p of positions) {
    if (givens <= targetGivens) break;
    const r = Math.floor(p / 9);
    const c = p % 9;
    const saved = grid[r][c];
    grid[r][c] = 0;
    if (countSolutions(grid, 2) === 1) givens--;
    else grid[r][c] = saved;
  }
  return grid;
}

const TARGET_GIVENS: Record<Difficulty, number> = { easy: 48, medium: 32, hard: 26, expert: 24 };
const TIER_RANK = { simple: 0, medium: 1, hard: 2 } as const;
const EXPECTED_TIER = { easy: 'simple', medium: 'medium', hard: 'hard', expert: 'hard' } as const;
/** Expert = Hard's techniques, but needed again and again rather than once. */
const EXPERT_HARD_STEPS = 3;

/** Tier rank plus hard-step count, or null when the engine can't solve it. */
function scoreOf(givens: Grid): { rank: number; steps: number } | null {
  const g = grade(cellsFromGivens(givens));
  return g && { rank: TIER_RANK[g.tier], steps: g.hardSteps };
}

/**
 * Carve to the tier's clue target, then keep carving (uniqueness-preserving)
 * until the puzzle actually needs that tier's techniques. A removal that
 * overshoots — needs harder techniques than the tier, or more than the
 * engine knows — is put back and the next cell tried.
 *
 * Why not the apps' generate-and-reject at a fixed clue count: measured
 * here, 200 of 200 random 32-clue puzzles were singles-only or beyond the
 * engine, never "medium", and 26-clue never "hard". So every Medium/Hard
 * fell through to the "last candidate" fallback and played like Easy with
 * fewer clues. Carving on until the tier is reached fixes that.
 *
 * Expert is Hard that keeps carving until it needs EXPERT_HARD_STEPS
 * advanced steps; if no attempt gets there, the hardest Hard seen is used.
 */
export function generatePuzzle(difficulty: Difficulty, id: number, rng: Rng = Math.random): Puzzle {
  const want = TIER_RANK[EXPECTED_TIER[difficulty]];
  const minSteps = difficulty === 'expert' ? EXPERT_HARD_STEPS : 0;
  const done = (sc: { rank: number; steps: number } | null) => !!sc && sc.rank === want && sc.steps >= minSteps;
  let fallback: Puzzle | null = null;
  let fallbackSteps = -1;
  const consider = (givens: Grid, solution: Grid, sc: { rank: number; steps: number } | null) => {
    const steps = sc && sc.rank === want ? sc.steps : -1;
    if (!fallback || steps > fallbackSteps) {
      fallback = { id, difficulty, givens: givens.map((r) => [...r]), solution };
      fallbackSteps = steps;
    }
  };
  // Expert succeeds on fewer starting grids, so it gets more of them. It's
  // made ahead of time in a worker (puzzles.ts), so the wait isn't seen.
  const attempts = difficulty === 'expert' ? 120 : 25;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateSolution(rng);
    const givens = makePuzzle(solution, TARGET_GIVENS[difficulty], rng);
    let sc = scoreOf(givens);
    consider(givens, solution, sc);
    if (done(sc)) return { id, difficulty, givens, solution };
    if (sc === null || sc.rank > want) continue; // already too hard; start over
    const filled = shuffle(
      Array.from({ length: 81 }, (_, i) => i).filter((i) => givens[Math.floor(i / 9)][i % 9] !== 0),
      rng,
    );
    for (const p of filled) {
      const r = Math.floor(p / 9);
      const c = p % 9;
      const saved = givens[r][c];
      givens[r][c] = 0;
      if (countSolutions(givens, 2) !== 1) {
        givens[r][c] = saved;
        continue;
      }
      sc = scoreOf(givens);
      if (done(sc)) return { id, difficulty, givens, solution };
      if (sc === null || sc.rank > want) givens[r][c] = saved;
      else consider(givens, solution, sc);
    }
  }
  return fallback!;
}
