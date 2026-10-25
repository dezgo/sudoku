// Coach mode (SPEC.md §13.11a): short scenarios where the user applies one
// tutor technique on a pre-built board. Port of iOS `CoachMode.swift`.
//
// Boards are lifted from the tutor tests (known to fire), then
// *fast-forwarded* through any simpler moves the global `findHint` would
// catch first, so the target technique is unambiguously the next move.

import { candidates, cellsFromGivens, cloneCells, type Cells, type Grid } from './types';
import { findHint, techniqueLabel, type TutorHint, type TutorTechnique } from './tutor';

export interface CoachScenario {
  id: string; // matches the TutorTechnique raw value
  technique: TutorTechnique;
  title: string; // e.g. "Naked Single"
  intro: string; // one-sentence task shown above the board
  initialCells: Cells;
}

/** The engine's hint for the scenario board — derived, never stored, so it can't go stale. */
export function expectedHint(s: CoachScenario): TutorHint | null {
  return findHint(s.initialCells);
}

/** True when the engine returns a hint of the expected technique. */
export function isValid(s: CoachScenario): boolean {
  return expectedHint(s)?.technique === s.technique;
}

const emptyGrid = (): Grid => Array.from({ length: 9 }, () => Array(9).fill(0));

/** Clone with every empty cell's notes set to its engine candidates. */
function autoPencil(cells: Cells): Cells {
  const result = cloneCells(cells);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (result[r][c].value === null) result[r][c].notes = candidates(r, c, result);
  return result;
}

/**
 * Apply simpler engine moves one at a time until `findHint` returns the
 * target technique. null if the chain dead-ends or loops.
 */
function fastForward(cells: Cells, target: TutorTechnique): Cells | null {
  const current = autoPencil(cells);
  for (let i = 0; i < 200; i++) {
    const hint = findHint(current);
    if (!hint) return null;
    if (hint.technique === target) return current;
    const p = hint.placement;
    if (p) {
      current[p.row][p.col].value = p.value;
      current[p.row][p.col].notes = new Set();
      // Clear the placed digit from peers' notes so the next findHint sees a consistent board.
      const br = Math.floor(p.row / 3) * 3;
      const bc = Math.floor(p.col / 3) * 3;
      for (let c = 0; c < 9; c++) if (c !== p.col) current[p.row][c].notes.delete(p.value);
      for (let r = 0; r < 9; r++) if (r !== p.row) current[r][p.col].notes.delete(p.value);
      for (let r = br; r < br + 3; r++)
        for (let c = bc; c < bc + 3; c++) if (!(r === p.row && c === p.col)) current[r][c].notes.delete(p.value);
    } else {
      for (const e of hint.eliminations) for (const d of e.candidates) current[e.row][e.col].notes.delete(d);
    }
  }
  return null;
}

function scenario(technique: TutorTechnique, intro: string, initialCells: Cells): CoachScenario {
  return { id: technique, technique, title: techniqueLabel(technique), intro, initialCells };
}

function nakedSingle(): CoachScenario {
  const grid = emptyGrid();
  grid[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  return scenario(
    'nakedSingle',
    'One empty cell can only hold one digit — find it and place the value.',
    cellsFromGivens(grid),
  );
}

function hiddenSingle(): CoachScenario {
  const grid = emptyGrid();
  grid[0][0] = 1;
  grid[0][1] = 2;
  grid[0][2] = 3;
  grid[1][0] = 4;
  grid[2][0] = 6;
  grid[2][1] = 7;
  grid[8][2] = 5;
  return scenario(
    'hiddenSingle',
    'In one of the units, a digit can only land in a single cell. Spot it and place the digit.',
    cellsFromGivens(grid),
  );
}

function nakedPair(): CoachScenario {
  const grid = emptyGrid();
  grid[0] = [0, 0, 0, 0, 5, 6, 7, 8, 9];
  grid[3][0] = 3;
  grid[6][1] = 3;
  grid[6][0] = 4;
  grid[3][1] = 4;
  return scenario(
    'nakedPair',
    'Two cells in a unit share the same two candidates. Erase those candidates from every other cell in that unit.',
    autoPencil(cellsFromGivens(grid)),
  );
}

function pointingPair(): CoachScenario {
  const grid = emptyGrid();
  grid[1] = [4, 5, 6, 0, 0, 0, 0, 0, 0];
  grid[2] = [7, 8, 9, 0, 0, 0, 0, 0, 0];
  return scenario(
    'pointingPair',
    'Inside one box, a candidate is restricted to a single row or column. Erase it from the rest of that line outside the box.',
    autoPencil(cellsFromGivens(grid)),
  );
}

function boxLineReduction(): CoachScenario {
  const grid = emptyGrid();
  grid[0] = [0, 0, 0, 4, 5, 6, 7, 8, 9];
  return scenario(
    'boxLineReduction',
    'A digit is restricted to a single box within its row or column. Erase that digit from the rest of the box.',
    autoPencil(cellsFromGivens(grid)),
  );
}

function hiddenPair(): CoachScenario {
  const grid = emptyGrid();
  grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9];
  grid[1][5] = 1;
  grid[1][6] = 2;
  grid[2][0] = 7;
  grid[2][1] = 8;
  grid[2][5] = 2;
  grid[3][2] = 1;
  grid[5][2] = 2;
  return scenario(
    'hiddenPair',
    'Two digits live only in two cells of a unit. Erase every *other* candidate from those two cells.',
    autoPencil(cellsFromGivens(grid)),
  );
}

function nakedTriple(): CoachScenario {
  const grid = emptyGrid();
  grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9];
  grid[3][0] = 4;
  grid[4][1] = 4;
  grid[5][2] = 4;
  grid[6][0] = 5;
  grid[7][1] = 5;
  grid[8][2] = 5;
  const cells = autoPencil(cellsFromGivens(grid));
  const forwarded = fastForward(cells, 'nakedTriple');
  // Fallback mirrors iOS: an un-forwarded board with empty intro, which
  // isValid() then filters out of the visible list.
  if (!forwarded) return scenario('nakedTriple', '', cells);
  return scenario(
    'nakedTriple',
    'Three cells share three candidates between them. Those digits must live in those cells — erase them from the rest of the unit.',
    forwarded,
  );
}

// v1 ships 7 scenarios. The rest (hiddenTriple upward) need hand-crafted
// boards where the target is the *first* useful move under findHint — the
// test boards let simpler patterns fire first.

/** All scenarios in display order (simple → hard). Built once at module load (cheap). */
export const ALL_SCENARIOS: readonly CoachScenario[] = [
  nakedSingle(),
  hiddenSingle(),
  nakedPair(),
  pointingPair(),
  boxLineReduction(),
  hiddenPair(),
  nakedTriple(),
];

/** Scenarios that actually validate — defensive net against engine-ordering regressions. */
export function validScenarios(): CoachScenario[] {
  return ALL_SCENARIOS.filter(isValid);
}
