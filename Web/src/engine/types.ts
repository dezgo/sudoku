// Core data model — mirrors SPEC.md §3 and iOS `SudokuGame.swift` / `SudokuPuzzle.swift`.
//
// `notes` is a Set in memory because the tutor engine leans on set algebra
// throughout. Persistence (storage.ts) converts to/from plain arrays, since
// JSON has no Set.

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const difficultyLabel: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface Cell {
  value: number | null;
  isFixed: boolean;
  notes: Set<number>;
}

export type Grid = number[][]; // 9×9, 0 = blank

export interface Puzzle {
  id: number;
  difficulty: Difficulty;
  givens: Grid;
  solution: Grid | null;
}

export type Cells = Cell[][];

/** True if this puzzle's ID looks like a daily (YYYYMMDD-shaped). */
export function isDaily(p: { id: number }): boolean {
  return p.id >= 19700101 && p.id <= 99991231;
}

export function cellsFromGivens(givens: Grid): Cells {
  return givens.map((row) =>
    row.map((v) =>
      v === 0
        ? { value: null, isFixed: false, notes: new Set<number>() }
        : { value: v, isFixed: true, notes: new Set<number>() },
    ),
  );
}

export function cloneCells(cells: Cells): Cells {
  return cells.map((row) => row.map((c) => ({ value: c.value, isFixed: c.isFixed, notes: new Set(c.notes) })));
}

/** Digits 1–9 minus those placed in the cell's row, column or box. */
export function candidates(row: number, col: number, cells: Cells): Set<number> {
  const cands = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let i = 0; i < 9; i++) {
    const a = cells[row][i].value;
    if (i !== col && a !== null) cands.delete(a);
    const b = cells[i][col].value;
    if (i !== row && b !== null) cands.delete(b);
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++) {
      if (r === row && c === col) continue;
      const v = cells[r][c].value;
      if (v !== null) cands.delete(v);
    }
  return cands;
}
