// Coach mode (SPEC.md §13.11a): one lesson per tutor technique. Each has a
// short plain-English explanation, a worked example (the tutor's lettered
// walkthrough on one board), then the player's turn on a second board.
//
// Boards are real mid-game positions (coachBoards.ts). Until 14 Nov 2026
// they were hand-made near-empty grids with almost every number pencilled
// into every cell, only 7 techniques had one, and there was no lesson —
// just the quiz (Derek, 15 Nov 2026).

import { cellsFromGivens, type Cells, type Grid } from './types';
import { ALL_TECHNIQUES, findHint, techniqueLabel, techniqueTier, type TutorHint, type TutorTechnique } from './tutor';
import { COACH_BOARDS, type CoachBoard } from './coachBoards';

export interface CoachScenario {
  id: string; // matches the TutorTechnique raw value
  technique: TutorTechnique;
  title: string; // e.g. "Naked Single"
  /** The idea in plain words, a few short paragraphs, shown before anything else. */
  lesson: string[];
  /** The task shown above the practice board. */
  intro: string;
  /** Worked-example board: the tutor walks through this one. */
  exampleCells: Cells;
  /** Practice board: the player's turn. */
  initialCells: Cells;
}

/** The engine's hint for the practice board — derived, never stored, so it can't go stale. */
export function expectedHint(s: CoachScenario): TutorHint | null {
  return findHint(s.initialCells);
}

/** The engine's walkthrough for the worked example. */
export function exampleHint(s: CoachScenario): TutorHint | null {
  return findHint(s.exampleCells);
}

/** True when both boards lead to the expected technique. */
export function isValid(s: CoachScenario): boolean {
  return expectedHint(s)?.technique === s.technique && exampleHint(s)?.technique === s.technique;
}

const TIER_ORDER = { simple: 0, medium: 1, hard: 2 } as const;

const SHARE = 'shares a row, column or box with';

/** [lesson paragraphs, practice task]. "Pencil marks" rather than "candidates" throughout. */
const TEXT: Partial<Record<TutorTechnique, [string[], string]>> = {
  nakedSingle: [
    [
      'Every empty cell can only hold numbers that aren’t already in its row, its column or its box.',
      'Sometimes that leaves just one number. That number must go there.',
    ],
    'Find an empty cell where only one number fits, and place it.',
  ],
  hiddenSingle: [
    [
      'Every row, column and box needs each number 1–9 exactly once.',
      'Pick a number that’s missing from a row, column or box, and check each empty cell in it. If only one cell can take that number, it goes there — even if that cell could hold other numbers too.',
    ],
    'Find a row, column or box where a number fits in only one cell, and place it.',
  ],
  nakedPair: [
    [
      'If two cells in the same row, column or box can only be the same two numbers — say 3 or 7 — then those two cells will use up the 3 and the 7 between them.',
      'So no other cell in that row, column or box can be 3 or 7. Cross them off everywhere else in it.',
    ],
    'Find two cells with the same two pencil marks, and cross those numbers off the rest of their row, column or box.',
  ],
  pointingPair: [
    [
      'Look inside one box at where a number can go. If every spot for it is on the same row (or column), the box’s copy of that number must be on that row.',
      'That row can only have one of that number, so it can’t be anywhere else along that row outside the box.',
    ],
    'Find a box where a number can only go along one row or column, and cross it off the rest of that line outside the box.',
  ],
  boxLineReduction: [
    [
      'The reverse of a pointing pair. Look along a row (or column) at where a number can go. If every spot is inside the same box, the row’s copy of that number is in that box.',
      'The box can only have one, so cross that number off the box’s other cells.',
    ],
    'Find a row or column where a number can only go inside one box, and cross it off the rest of that box.',
  ],
  hiddenPair: [
    [
      'In a row, column or box, if two numbers can only go in the same two cells, those two cells must hold those two numbers.',
      'That means those cells can’t be anything else, so their other pencil marks can go.',
    ],
    'Find two numbers that only fit in the same two cells, and cross every other number off those cells.',
  ],
  nakedTriple: [
    [
      'Like a naked pair, but with three cells. If three cells in a row, column or box only have three numbers between them, those three cells will use those numbers up.',
      'Each cell doesn’t need all three — 1/2, 2/3 and 1/3 counts too. Cross those numbers off the rest of the row, column or box.',
    ],
    'Find three cells that only hold three numbers between them, and cross those numbers off the rest of their row, column or box.',
  ],
  nakedQuad: [
    [
      'The same idea with four cells: four cells in a row, column or box that only hold four numbers between them will use all four up.',
      'Cross those four numbers off the rest of that row, column or box.',
    ],
    'Find four cells that only hold four numbers between them, and cross those numbers off the rest.',
  ],
  hiddenTriple: [
    [
      'Like a hidden pair, with three. If three numbers can only go in the same three cells of a row, column or box, those cells must hold those numbers.',
      'Cross every other pencil mark off those three cells.',
    ],
    'Find three numbers that only fit in the same three cells, and cross everything else off those cells.',
  ],
  xWing: [
    [
      'Pick one number. Find two rows where it only has two possible spots each — and the spots are in the same two columns, making a rectangle.',
      'The number must sit in opposite corners of that rectangle: top-left and bottom-right, or top-right and bottom-left. Either way, each of those two columns gets its copy from the rectangle.',
      'So it can be crossed off everywhere else in those two columns. (It also works the other way round, with columns and rows swapped.)',
    ],
    'Find an X-Wing and cross the number off the rest of the two lines it covers.',
  ],
  swordfish: [
    [
      'An X-Wing with three rows instead of two. Find three rows where a number only fits in the same three columns (each row can have two or three spots).',
      'The three rows need three copies, and they must land in those three columns — one each. So cross the number off the rest of those columns.',
    ],
    'Find a Swordfish and cross the number off the rest of the three lines it covers.',
  ],
  xyWing: [
    [
      `Uses three cells that each have just two pencil marks. The middle one (A) can be, say, 1 or 2. One partner (B) ${SHARE} A and can be 1 or 3. The other (C) also ${SHARE} A and can be 2 or 3.`,
      'Whatever A turns out to be, B or C is forced to be 3. So any cell that shares a row, column or box with both B and C can’t be 3.',
    ],
    'Find an XY-Wing and cross the shared number off cells that line up with both outer cells.',
  ],
  xyzWing: [
    [
      'Like an XY-Wing, but the middle cell (A) has three pencil marks — say 1, 2 or 3 — and its partners are 1/3 and 2/3.',
      'Whatever A is, one of the three cells ends up as 3. So a cell that shares a row, column or box with all three can’t be 3.',
    ],
    'Find an XYZ-Wing and cross the shared number off cells that line up with all three.',
  ],
  wWing: [
    [
      'Two cells far apart (A and B) both have the same two pencil marks, say 4 or 9.',
      'Now find a row, column or box where 9 only has two spots, one lined up with A and one lined up with B. One of those two spots is 9 — which stops A or B from being 9, so that one is 4.',
      'So one of A or B is always 4, and any cell lined up with both can’t be 4.',
    ],
    'Find a W-Wing and cross the number off cells that line up with both matching cells.',
  ],
  skyscraper: [
    [
      'Pick a number. Find two rows where it only has two spots each, and one spot in each row is in the same column — like two towers standing on the same base.',
      'Those two base spots can’t both be the number (same column). So at least one of the two tops is.',
      'Any cell that shares a row, column or box with both tops can’t be the number.',
    ],
    'Find a Skyscraper and cross the number off cells that line up with both tops.',
  ],
  twoStringKite: [
    [
      'Pick a number with only two spots in some row and only two spots in some column, where one spot from each sits in the same box.',
      'Those two can’t both be the number (same box), so at least one of the far ends is.',
      'Any cell lined up with both far ends can’t be the number.',
    ],
    'Find a Kite and cross the number off cells that line up with both far ends.',
  ],
  emptyRectangle: [
    [
      'Look at a box where a number’s spots all sit on one row or one column of the box — a cross shape.',
      'Combine it with a column (or row) elsewhere where the number has just two spots, one of them lined up with the cross. If a certain cell were the number, it would block both arms of the cross and leave the box with nowhere for it — so that cell can’t be it.',
    ],
    'Find an Empty Rectangle and cross the number off the cell that would leave the box with nowhere for it.',
  ],
  finnedXWing: [
    [
      'An X-Wing that’s nearly there: one row has an extra spot or two (the “fin”), all in the same box as one corner.',
      'Either the fin holds the number — so nothing else in its box can — or it doesn’t, and the X-Wing works as normal.',
      'Cells that would be ruled out both ways — in the X-Wing’s column and in the fin’s box — can’t be the number.',
    ],
    'Find a Finned X-Wing and cross the number off cells ruled out either way.',
  ],
  finnedSwordfish: [
    [
      'A Swordfish with a fin: one row has extra spots, all in one box.',
      'Either the fin holds the number, or the Swordfish works as normal. Cells in a Swordfish column and inside the fin’s box lose out both ways.',
    ],
    'Find a Finned Swordfish and cross the number off cells ruled out either way.',
  ],
  uniqueRectangle: [
    [
      'A proper puzzle has exactly one answer. Picture four cells in a rectangle across two boxes, all only 1 or 2. You could swap the 1s and 2s round and both versions would work — two answers.',
      'So that can’t happen. If three corners can only be 1 or 2, the fourth must be something else; cross 1 and 2 off it.',
    ],
    'Find a Unique Rectangle and use it to cross a number off.',
  ],
};

function toCells(b: CoachBoard): Cells {
  const grid: Grid = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => Number(b.values[r * 9 + c])),
  );
  const cells = cellsFromGivens(grid);
  b.notes.forEach((n, i) => {
    const cell = cells[Math.floor(i / 9)][i % 9];
    if (cell.value === null) cell.notes = new Set([...n].map(Number));
  });
  return cells;
}

function fromBoards(technique: TutorTechnique): CoachScenario | null {
  const boards = COACH_BOARDS[technique];
  const text = TEXT[technique];
  if (!boards || !text) return null;
  return {
    id: technique,
    technique,
    title: techniqueLabel(technique),
    lesson: text[0],
    intro: text[1],
    exampleCells: toCells(boards[0]),
    initialCells: toCells(boards[1]),
  };
}

/** All scenarios in display order (simple → hard), one per technique that has boards. */
export const ALL_SCENARIOS: readonly CoachScenario[] = ALL_TECHNIQUES.map(fromBoards)
  .filter((s): s is CoachScenario => s !== null)
  .sort((a, b) => TIER_ORDER[techniqueTier(a.technique)] - TIER_ORDER[techniqueTier(b.technique)]);

/** Scenarios that actually validate — defensive net against engine-ordering regressions. */
export function validScenarios(): CoachScenario[] {
  return ALL_SCENARIOS.filter(isValid);
}
