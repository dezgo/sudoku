// Port of iOS `TutorTests.swift`: hand-crafted boards verify each
// technique's detection so adding a technique can't silently break others.

import { describe, it, expect } from 'vitest';
import { candidates, cellsFromGivens, cloneCells, type Cells, type Grid } from './types';
import {
  ALL_TECHNIQUES,
  classify,
  findBoxLineReduction,
  findHiddenPair,
  findHiddenTriple,
  findHint,
  findNakedTriple,
  findPointingPair,
  findSwordfish,
  findXWing,
  findXYWing,
  techniqueLabel,
  techniqueTier,
  type TutorHint,
} from './tutor';

const emptyGrid = (): Grid => Array.from({ length: 9 }, () => Array(9).fill(0));

/** Fill every empty cell's notes with its engine candidates (mirrors the test helper on iOS). */
function autoPencil(cells: Cells): Cells {
  const result = cloneCells(cells);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (result[r][c].value === null) result[r][c].notes = candidates(r, c, result);
  return result;
}

const sortedArr = (s: Set<number> | undefined) => (s ? [...s].sort((a, b) => a - b) : undefined);
const elimAt = (h: TutorHint | null, row: number, col: number) =>
  h?.eliminations.find((e) => e.row === row && e.col === col);

describe('technique metadata', () => {
  it('has 22 techniques with tiers and labels', () => {
    expect(ALL_TECHNIQUES).toHaveLength(22);
    expect(techniqueTier('nakedSingle')).toBe('simple');
    expect(techniqueTier('hiddenPair')).toBe('medium');
    expect(techniqueTier('uniqueRectangle')).toBe('hard');
    expect(techniqueLabel('boxLineReduction')).toBe('Box/Line Reduction');
    expect(techniqueLabel('twoStringKite')).toBe('2-String Kite');
  });
});

describe('TutorEngine', () => {
  it('nakedSingle_lastDigitInRow', () => {
    const grid = emptyGrid();
    grid[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const hint = findHint(cellsFromGivens(grid));
    expect(hint?.technique).toBe('nakedSingle');
    expect(hint?.placement).toEqual({ row: 0, col: 8, value: 9 });
    expect(hint?.eliminations).toEqual([]);
    expect(hint?.steps[2].narration).toBe('That leaves only 9. It must go in this cell.');
  });

  it('hiddenSingle_inBox', () => {
    // Box 0 missing 5, 8, 9; a 5 at (8,2) blocks (1,2) and (2,2), leaving
    // (1,1) as the only 5 — not a naked single since it also takes 8, 9.
    const grid = emptyGrid();
    grid[0][0] = 1;
    grid[0][1] = 2;
    grid[0][2] = 3;
    grid[1][0] = 4;
    grid[2][0] = 6;
    grid[2][1] = 7;
    grid[8][2] = 5;
    const hint = findHint(cellsFromGivens(grid));
    expect(hint?.technique).toBe('hiddenSingle');
    expect(hint?.placement).toEqual({ row: 1, col: 1, value: 5 });
  });

  it('nakedPair_inRow', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 5, 6, 7, 8, 9];
    grid[3][0] = 3;
    grid[6][1] = 3;
    grid[6][0] = 4;
    grid[3][1] = 4;
    const cells = autoPencil(cellsFromGivens(grid));

    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2]);
    expect(sortedArr(cells[0][1].notes)).toEqual([1, 2]);
    expect(sortedArr(cells[0][2].notes)).toEqual([1, 2, 3, 4]);
    expect(sortedArr(cells[0][3].notes)).toEqual([1, 2, 3, 4]);

    const hint = findHint(cells);
    expect(hint?.technique).toBe('nakedPair');
    expect(hint?.placement).toBeNull();
    expect(sortedArr(elimAt(hint, 0, 2)?.candidates)).toEqual([1, 2]);
    expect(sortedArr(elimAt(hint, 0, 3)?.candidates)).toEqual([1, 2]);
  });

  it('returnsNil_whenSolved', () => {
    const solved: Grid = [
      [5, 3, 4, 6, 7, 8, 9, 1, 2],
      [6, 7, 2, 1, 9, 5, 3, 4, 8],
      [1, 9, 8, 3, 4, 2, 5, 6, 7],
      [8, 5, 9, 7, 6, 1, 4, 2, 3],
      [4, 2, 6, 8, 5, 3, 7, 9, 1],
      [7, 1, 3, 9, 2, 4, 8, 5, 6],
      [9, 6, 1, 5, 3, 7, 2, 8, 4],
      [2, 8, 7, 4, 1, 9, 6, 3, 5],
      [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ];
    expect(findHint(cellsFromGivens(solved))).toBeNull();
  });

  it('returnsNil_whenEmptyBoard', () => {
    expect(findHint(cellsFromGivens(emptyGrid()))).toBeNull();
  });

  it('pointingPair_inBox', () => {
    const grid = emptyGrid();
    grid[1] = [4, 5, 6, 0, 0, 0, 0, 0, 0];
    grid[2] = [7, 8, 9, 0, 0, 0, 0, 0, 0];
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2, 3]);

    const hint = findPointingPair(cells);
    expect(hint?.technique).toBe('pointingPair');
    expect(hint?.placement).toBeNull();
    expect(hint?.eliminations).toHaveLength(6);
    expect(hint?.eliminations.every((e) => e.row === 0 && e.col >= 3)).toBe(true);
    expect(hint?.eliminations.every((e) => sortedArr(e.candidates)!.join() === '1')).toBe(true);
  });

  it('boxLineReduction_rowToBox', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 4, 5, 6, 7, 8, 9];
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2, 3]);

    const hint = findBoxLineReduction(cells);
    expect(hint?.technique).toBe('boxLineReduction');
    expect(hint?.placement).toBeNull();
    expect(hint?.eliminations).toHaveLength(6);
    expect(hint?.eliminations.every((e) => e.row >= 1 && e.row <= 2 && e.col <= 2)).toBe(true);
    expect(hint?.eliminations.every((e) => sortedArr(e.candidates)!.join() === '1')).toBe(true);
  });

  it('hiddenPair_inRow', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9];
    grid[1][5] = 1;
    grid[1][6] = 2;
    grid[2][0] = 7;
    grid[2][1] = 8;
    grid[2][5] = 2;
    grid[3][2] = 1;
    grid[5][2] = 2;
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2, 3, 4, 5]);
    expect(sortedArr(cells[0][1].notes)).toEqual([1, 2, 3, 4, 5]);

    const hint = findHiddenPair(cells);
    expect(hint?.technique).toBe('hiddenPair');
    expect(hint?.placement).toBeNull();
    expect(sortedArr(elimAt(hint, 0, 0)?.candidates)).toEqual([3, 4, 5]);
    expect(sortedArr(elimAt(hint, 0, 1)?.candidates)).toEqual([3, 4, 5]);
  });

  it('nakedTriple_inRow', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9];
    // (Swift test places then clears a 4 at (3,1); net effect mirrored here.)
    grid[3][0] = 4;
    grid[4][1] = 4;
    grid[5][2] = 4;
    grid[6][0] = 5;
    grid[7][1] = 5;
    grid[8][2] = 5;
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2, 3]);
    expect(sortedArr(cells[0][1].notes)).toEqual([1, 2, 3]);
    expect(sortedArr(cells[0][2].notes)).toEqual([1, 2, 3]);
    for (const c of [3, 4]) for (const d of [1, 2, 3]) expect(cells[0][c].notes.has(d)).toBe(true);

    const hint = findNakedTriple(cells);
    expect(hint?.technique).toBe('nakedTriple');
    expect(hint?.placement).toBeNull();
    expect(sortedArr(elimAt(hint, 0, 3)?.candidates)).toEqual([1, 2, 3]);
    expect(sortedArr(elimAt(hint, 0, 4)?.candidates)).toEqual([1, 2, 3]);
  });

  it('hiddenTriple_inRow', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9];
    grid[1][3] = 1;
    grid[1][4] = 2;
    grid[2][3] = 3;
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2, 3, 4, 5]);
    expect(sortedArr(cells[0][3].notes)).toEqual([4, 5]);
    expect(sortedArr(cells[0][4].notes)).toEqual([4, 5]);

    const hint = findHiddenTriple(cells);
    expect(hint?.technique).toBe('hiddenTriple');
    expect(hint?.placement).toBeNull();
    for (const c of [0, 1, 2]) expect(sortedArr(elimAt(hint, 0, c)?.candidates)).toEqual([4, 5]);
  });

  it('xWing_onRows', () => {
    const grid = emptyGrid();
    grid[0] = [2, 3, 4, 0, 5, 6, 0, 7, 8];
    grid[1] = [3, 4, 5, 0, 6, 7, 0, 8, 2];
    const cells = autoPencil(cellsFromGivens(grid));
    expect(cells[0][3].notes.has(1)).toBe(true);
    expect(cells[0][6].notes.has(1)).toBe(true);
    expect(cells[1][3].notes.has(1)).toBe(true);
    expect(cells[1][6].notes.has(1)).toBe(true);
    for (const c of [0, 1, 2, 4, 5, 7, 8]) {
      expect(cells[0][c].notes.has(1)).toBe(false);
      expect(cells[1][c].notes.has(1)).toBe(false);
    }

    const hint = findXWing(cells);
    expect(hint?.technique).toBe('xWing');
    expect(hint?.placement).toBeNull();
    expect(hint?.eliminations.length ?? 0).toBeGreaterThan(0);
    expect(hint?.eliminations.every((e) => (e.col === 3 || e.col === 6) && e.row >= 2)).toBe(true);
    expect(hint?.eliminations.every((e) => sortedArr(e.candidates)!.join() === '1')).toBe(true);
  });

  // Mirrors the iOS test verbatim, which can't pass: it blocks digit 1 from
  // rows 0–2 by placing a 1 in every one of rows 3–8, so no row ≥3 can hold
  // a 1-candidate and there's nothing for the Swordfish to eliminate
  // (findSwordfish returns nil on iOS too). Kept as `it.fails` so it flips
  // loudly if the behaviour ever changes; the corrected board follows.
  it.fails('swordfish_onRows (iOS board — broken upstream)', () => {
    const grid = emptyGrid();
    grid[3][0] = 1;
    grid[4][1] = 1;
    grid[5][2] = 1;
    grid[6][4] = 1;
    grid[7][6] = 1;
    grid[8][8] = 1;
    grid[0][7] = 9;
    grid[1][3] = 9;
    grid[2][5] = 9;
    const cells = autoPencil(cellsFromGivens(grid));
    const rowCols = (r: number) => [...Array(9).keys()].filter((c) => cells[r][c].notes.has(1));
    expect(rowCols(0)).toEqual([3, 5]);
    expect(rowCols(1)).toEqual([5, 7]);
    expect(rowCols(2)).toEqual([3, 7]);

    const hint = findSwordfish(cells);
    expect(hint?.technique).toBe('swordfish');
    expect(hint?.placement).toBeNull();
    const elims = hint?.eliminations ?? [];
    expect(elims.length).toBeGreaterThan(0);
    expect(elims.every((e) => [3, 5, 7].includes(e.col) && e.row >= 3)).toBe(true);
    expect(elims.every((e) => sortedArr(e.candidates)!.join() === '1')).toBe(true);
  });

  it('swordfish_onRows (corrected board)', () => {
    // Same pattern as above — 1 confined to cols {3,5} / {5,7} / {3,7} in
    // rows 0–2 — but blocked by filling rows 0–2 instead, so rows 3–7 keep
    // 1 as a candidate in those columns. Row 8's 1 blocks (2,2).
    const grid = emptyGrid();
    grid[0] = [2, 3, 4, 0, 5, 0, 7, 8, 9];
    grid[1] = [5, 6, 7, 2, 8, 0, 3, 0, 4];
    grid[2] = [8, 9, 0, 0, 4, 7, 2, 0, 6];
    grid[8][2] = 1;
    const cells = autoPencil(cellsFromGivens(grid));
    const rowCols = (r: number) => [...Array(9).keys()].filter((c) => cells[r][c].notes.has(1));
    expect(rowCols(0)).toEqual([3, 5]);
    expect(rowCols(1)).toEqual([5, 7]);
    expect(rowCols(2)).toEqual([3, 7]);

    const hint = findSwordfish(cells);
    expect(hint?.technique).toBe('swordfish');
    expect(hint?.placement).toBeNull();
    const elims = hint?.eliminations ?? [];
    expect(elims).toHaveLength(15); // rows 3–7 × cols 3, 5, 7
    expect(elims.every((e) => [3, 5, 7].includes(e.col) && e.row >= 3 && e.row <= 7)).toBe(true);
    expect(elims.every((e) => sortedArr(e.candidates)!.join() === '1')).toBe(true);
  });

  it('xyWing_classic', () => {
    // Pivot (0,0) {1,2}; pincers (0,4) {1,3} and (4,0) {2,3}; (4,4) sees both and has 3.
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 0, 4, 5, 6, 7];
    grid[1][0] = 8;
    grid[2][0] = 9;
    grid[1][1] = 3;
    grid[1][4] = 8;
    grid[2][4] = 9;
    grid[3][4] = 2;
    grid[5][1] = 1;
    grid[4][1] = 4;
    grid[4][2] = 5;
    grid[4][3] = 6;
    grid[4][5] = 7;
    const cells = autoPencil(cellsFromGivens(grid));
    expect(sortedArr(cells[0][0].notes)).toEqual([1, 2]);
    expect(sortedArr(cells[0][4].notes)).toEqual([1, 3]);
    expect(sortedArr(cells[4][0].notes)).toEqual([2, 3]);
    expect(cells[4][4].notes.has(3)).toBe(true);

    const hint = findXYWing(cells);
    expect(hint?.technique).toBe('xyWing');
    expect(hint?.placement).toBeNull();
    const e44 = elimAt(hint, 4, 4);
    expect(e44).toBeDefined();
    expect(sortedArr(e44?.candidates)).toEqual([3]);
  });

  it('classify: the classic Wikipedia puzzle needs only singles', () => {
    const givens = [
      '530070000', '600195000', '098000060', '800060003', '400803001',
      '700020006', '060000280', '000419005', '000080079',
    ].map((r) => [...r].map(Number));
    const cells = cellsFromGivens(givens);
    expect(classify(cells)).toBe('simple');
    expect(classify(cellsFromGivens(emptyGrid()))).toBeNull();
    expect(cells[0][2].notes.size).toBe(0); // input untouched
  });

  it('never mutates the input cells', () => {
    const grid = emptyGrid();
    grid[0] = [0, 0, 0, 0, 5, 6, 7, 8, 9];
    grid[3][0] = 3;
    grid[6][1] = 3;
    grid[6][0] = 4;
    grid[3][1] = 4;
    const cells = autoPencil(cellsFromGivens(grid));
    const before = JSON.stringify(cells, (_k, v) => (v instanceof Set ? [...v] : v));
    findHint(cells);
    expect(JSON.stringify(cells, (_k, v) => (v instanceof Set ? [...v] : v))).toBe(before);
  });
});
