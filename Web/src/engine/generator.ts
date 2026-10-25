// Puzzle generator + uniqueness solver — straight port of iOS
// `PuzzleGenerator.swift` (SPEC.md §6). Generation is CPU-heavy (up to 25
// generate-and-classify attempts), so the app runs it in a Web Worker
// (gen.worker.ts) to keep the board responsive.

import { classify } from './tutor';
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

const TARGET_GIVENS: Record<Difficulty, number> = { easy: 48, medium: 32, hard: 26 };
const TIER_RANK = { simple: 0, medium: 1, hard: 2 } as const;
const EXPECTED_TIER = { easy: 'simple', medium: 'medium', hard: 'hard' } as const;

function tierOf(givens: Grid): number | null {
  const t = classify(cellsFromGivens(givens));
  return t === null ? null : TIER_RANK[t];
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
 */
export function generatePuzzle(difficulty: Difficulty, id: number, rng: Rng = Math.random): Puzzle {
  const want = TIER_RANK[EXPECTED_TIER[difficulty]];
  let fallback: Puzzle | null = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const solution = generateSolution(rng);
    const givens = makePuzzle(solution, TARGET_GIVENS[difficulty], rng);
    let tier = tierOf(givens);
    fallback ??= { id, difficulty, givens: givens.map((r) => [...r]), solution };
    if (tier === want) return { id, difficulty, givens, solution };
    if (tier === null || tier > want) continue; // already too hard; start over
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
      tier = tierOf(givens);
      if (tier === want) return { id, difficulty, givens, solution };
      if (tier === null || tier > want) givens[r][c] = saved;
    }
  }
  return fallback!;
}
