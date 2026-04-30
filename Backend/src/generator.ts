// Sudoku puzzle generator + solver. Port of SPEC §6 (generation) and the MRV
// solver used for the uniqueness check.
//
// Determinism: seeded via splitmix64 from the puzzle_id, multiplied by a
// large odd constant to spread bits. The server is the source of truth, so
// determinism is no longer load-bearing for cross-device identity (D1 stores
// the generated puzzle), but reproducibility is still useful for debugging
// and DR (regenerate-on-loss).

import type { Difficulty, Grid } from './types';

const SPREAD_CONSTANT = 0x9e3779b97f4a7c15n;
const U64_MASK = 0xffffffffffffffffn;

const TIER_TARGETS: Record<Difficulty, number> = {
  easy: 48,
  medium: 32,
  hard: 26,
};

class Rng {
  private state: bigint;
  constructor(seed: bigint) {
    this.state = seed & U64_MASK;
  }
  private next64(): bigint {
    this.state = (this.state + SPREAD_CONSTANT) & U64_MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
    z = z ^ (z >> 31n);
    return z;
  }
  nextInt(max: number): number {
    return Number(this.next64() % BigInt(max));
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = a[i]!;
      a[i] = a[j]!;
      a[j] = tmp;
    }
    return a;
  }
}

function emptyGrid(): Grid {
  return Array.from({ length: 9 }, () => Array<number>(9).fill(0));
}

function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

function isValidPlacement(grid: Grid, row: number, col: number, val: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[row]![i] === val) return false;
    if (grid[i]![col] === val) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r]![c] === val) return false;
    }
  }
  return true;
}

function fillGrid(grid: Grid, rng: Rng): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r]![c] === 0) {
        const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const d of digits) {
          if (isValidPlacement(grid, r, c, d)) {
            grid[r]![c] = d;
            if (fillGrid(grid, rng)) return true;
            grid[r]![c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

interface MrvCell {
  row: number;
  col: number;
  candidates: number[];
}

function findMrvEmpty(grid: Grid): MrvCell | null {
  let best: MrvCell | null = null;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r]![c] !== 0) continue;
      const cands: number[] = [];
      for (let d = 1; d <= 9; d++) {
        if (isValidPlacement(grid, r, c, d)) cands.push(d);
      }
      if (cands.length === 0) return { row: r, col: c, candidates: [] };
      if (!best || cands.length < best.candidates.length) {
        best = { row: r, col: c, candidates: cands };
        if (cands.length === 1) return best;
      }
    }
  }
  return best;
}

// Counts solutions up to `limit`, then short-circuits.
function countSolutions(grid: Grid, limit: number): number {
  const cell = findMrvEmpty(grid);
  if (!cell) return 1;
  if (cell.candidates.length === 0) return 0;
  let count = 0;
  for (const d of cell.candidates) {
    grid[cell.row]![cell.col] = d;
    count += countSolutions(grid, limit - count);
    grid[cell.row]![cell.col] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function carve(solution: Grid, targetGivens: number, rng: Rng): Grid {
  const grid = cloneGrid(solution);
  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c]);
  const order = rng.shuffle(positions);

  let givens = 81;
  for (const [r, c] of order) {
    if (givens <= targetGivens) break;
    const saved = grid[r]![c];
    grid[r]![c] = 0;
    const test = cloneGrid(grid);
    if (countSolutions(test, 2) === 1) {
      givens--;
    } else {
      grid[r]![c] = saved;
    }
  }
  return grid;
}

function seedForPuzzleId(puzzleId: number): bigint {
  return (BigInt(puzzleId) * SPREAD_CONSTANT) & U64_MASK;
}

export function generatePuzzle(
  puzzleId: number,
  difficulty: Difficulty,
): { givens: Grid; solution: Grid } {
  const rng = new Rng(seedForPuzzleId(puzzleId));
  const solution = emptyGrid();
  if (!fillGrid(solution, rng)) {
    throw new Error('generator failed to produce a solved grid');
  }
  const givens = carve(solution, TIER_TARGETS[difficulty], rng);
  return { givens, solution };
}
