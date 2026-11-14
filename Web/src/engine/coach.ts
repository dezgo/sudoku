// Coach mode (SPEC.md §13.11a): short scenarios where the user applies one
// tutor technique on a pre-built board. Port of iOS `CoachMode.swift`.
//
// Boards are real mid-game positions (coachBoards.ts). Until 14 Nov 2026
// they were hand-made near-empty grids with almost every number pencilled
// into every cell, and only 7 techniques had one.

import { cellsFromGivens, type Cells, type Grid } from './types';
import { ALL_TECHNIQUES, findHint, techniqueLabel, techniqueTier, type TutorHint, type TutorTechnique } from './tutor';
import { COACH_BOARDS } from './coachBoards';

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

function scenario(technique: TutorTechnique, intro: string, initialCells: Cells): CoachScenario {
  return { id: technique, technique, title: techniqueLabel(technique), intro, initialCells };
}

const TIER_ORDER = { simple: 0, medium: 1, hard: 2 } as const;

const INTROS: Partial<Record<TutorTechnique, string>> = {
  nakedSingle: 'One empty cell has only one number left that fits. Find it and place it.',
  hiddenSingle: 'In one row, column or box, a number fits in only one cell. Find it and place it.',
  nakedPair:
    'Two cells in a row, column or box can only be the same two numbers. Cross those numbers off the rest of that row, column or box.',
  pointingPair:
    'Inside one box, a number can only go in one row or column. Cross it off the rest of that row or column, outside the box.',
  boxLineReduction: 'In one row or column, a number can only go inside one box. Cross it off the rest of that box.',
  hiddenPair:
    'Two numbers can only go in the same two cells of a row, column or box. Cross every other number off those two cells.',
  nakedTriple:
    'Three cells in a row, column or box only hold three numbers between them. Cross those numbers off the rest of it.',
  nakedQuad:
    'Four cells in a row, column or box only hold four numbers between them. Cross those numbers off the rest of it.',
  hiddenTriple:
    'Three numbers can only go in the same three cells of a row, column or box. Cross every other number off those cells.',
  xWing:
    'In two rows (or columns), a number only fits in the same two places. Cross it off the rest of those columns (or rows).',
  swordfish: 'Like an X-Wing, but over three rows or columns. Find it and cross the number off where it can’t go.',
  xyWing:
    'Three cells with two choices each link up so a number must be in one of two cells. Cross it off cells that share a row, column or box with both.',
  xyzWing:
    'A three-choice cell and two two-choice cells guarantee a number among them. Cross it off cells that share a row, column or box with all three.',
  wWing:
    'Two cells with the same two choices, linked by a number with only two spots. Cross the other number off cells that line up with both.',
  skyscraper:
    'A number has two spots in each of two rows (or columns), lined up at one end. Cross it off cells that line up with both loose ends.',
  twoStringKite:
    'A number has two spots in a row and two in a column, joined through a box. Cross it off the cell that lines up with both ends.',
  emptyRectangle:
    'In one box, a number is stuck to one row and one column. Combine that with a line where it has two spots to cross it off somewhere.',
  finnedXWing: 'Almost an X-Wing, with an extra spot or two in one box. Cross the number off where both cases agree.',
  finnedSwordfish: 'Almost a Swordfish, with extra spots in one box. Cross the number off where both cases agree.',
  uniqueRectangle:
    'Four cells in a rectangle would allow two solutions — which a proper puzzle never has. Use that to cross a number off.',
};

function fromBoard(technique: TutorTechnique): CoachScenario | null {
  const b = COACH_BOARDS[technique];
  if (!b) return null;
  const grid: Grid = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => Number(b.values[r * 9 + c])),
  );
  const cells = cellsFromGivens(grid);
  b.notes.forEach((n, i) => {
    const cell = cells[Math.floor(i / 9)][i % 9];
    if (cell.value === null) cell.notes = new Set([...n].map(Number));
  });
  return scenario(technique, INTROS[technique] ?? '', cells);
}

/** All scenarios in display order (simple → hard), one per technique that has a board. */
export const ALL_SCENARIOS: readonly CoachScenario[] = ALL_TECHNIQUES.map(fromBoard)
  .filter((s): s is CoachScenario => s !== null)
  .sort((a, b) => TIER_ORDER[techniqueTier(a.technique)] - TIER_ORDER[techniqueTier(b.technique)]);

/** Scenarios that actually validate — defensive net against engine-ordering regressions. */
export function validScenarios(): CoachScenario[] {
  return ALL_SCENARIOS.filter(isValid);
}
