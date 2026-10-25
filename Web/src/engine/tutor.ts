// In-context tutor: finds the easiest applicable next move and produces a
// step-by-step narration of how to spot it. Straight port of iOS
// `Tutor.swift` (SPEC.md §13.10). Search order, iteration order and
// narration copy match iOS so the same board gives the same hint.
//
// Where Swift iterated a `Set` and the outcome depended on order, this port
// iterates in ascending order instead (flagged "Swift Set order" below).
// Finders never mutate the input cells.

import { candidates, cloneCells, type Cells } from './types';

export type TutorTechnique =
  | 'nakedSingle'
  | 'hiddenSingle'
  | 'nakedPair'
  | 'pointingPair'
  | 'boxLineReduction'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'xyWing'
  | 'swordfish'
  | 'nakedQuad'
  | 'hiddenQuad'
  | 'jellyfish'
  | 'xyzWing'
  | 'wWing'
  | 'skyscraper'
  | 'emptyRectangle'
  | 'twoStringKite'
  | 'finnedXWing'
  | 'finnedSwordfish'
  | 'uniqueRectangle';

/** Swift declaration order (CaseIterable). Note: not quite findHint's order. */
export const ALL_TECHNIQUES: TutorTechnique[] = [
  'nakedSingle',
  'hiddenSingle',
  'nakedPair',
  'pointingPair',
  'boxLineReduction',
  'hiddenPair',
  'nakedTriple',
  'hiddenTriple',
  'xWing',
  'xyWing',
  'swordfish',
  'nakedQuad',
  'hiddenQuad',
  'jellyfish',
  'xyzWing',
  'wWing',
  'skyscraper',
  'emptyRectangle',
  'twoStringKite',
  'finnedXWing',
  'finnedSwordfish',
  'uniqueRectangle',
];

/** Difficulty bands roughly matching how a human solver progresses. Used by
 * the generator to calibrate Easy / Medium / Hard. */
export type TutorTier = 'simple' | 'medium' | 'hard';

export function techniqueTier(t: TutorTechnique): TutorTier {
  switch (t) {
    case 'nakedSingle':
    case 'hiddenSingle':
      return 'simple';
    case 'nakedPair':
    case 'pointingPair':
    case 'boxLineReduction':
    case 'hiddenPair':
      return 'medium';
    default:
      return 'hard';
  }
}

const LABELS: Record<TutorTechnique, string> = {
  nakedSingle: 'Naked Single',
  hiddenSingle: 'Hidden Single',
  nakedPair: 'Naked Pair',
  pointingPair: 'Pointing Pair',
  boxLineReduction: 'Box/Line Reduction',
  hiddenPair: 'Hidden Pair',
  nakedTriple: 'Naked Triple',
  hiddenTriple: 'Hidden Triple',
  xWing: 'X-Wing',
  xyWing: 'XY-Wing',
  swordfish: 'Swordfish',
  nakedQuad: 'Naked Quad',
  hiddenQuad: 'Hidden Quad',
  jellyfish: 'Jellyfish',
  xyzWing: 'XYZ-Wing',
  wWing: 'W-Wing',
  skyscraper: 'Skyscraper',
  emptyRectangle: 'Empty Rectangle',
  twoStringKite: '2-String Kite',
  finnedXWing: 'Finned X-Wing',
  finnedSwordfish: 'Finned Swordfish',
  uniqueRectangle: 'Unique Rectangle',
};

export function techniqueLabel(t: TutorTechnique): string {
  return LABELS[t];
}

/**
 * One cell decorated for the tutor overlay. `candidates` are digits to draw
 * as pencil-style marks while the highlight is on screen (empty for plain
 * background tints like focus / target).
 */
export interface TutorHighlight {
  row: number;
  col: number;
  kind: 'focus' | 'eliminator' | 'target';
  candidates: Set<number>;
}

export interface TutorStep {
  narration: string;
  highlights: TutorHighlight[];
}

/**
 * A hint either *places* a digit (singles) or *eliminates* candidates
 * (everything else). Placement fills the cell; elimination erases the
 * called-out candidates from the user's pencil marks.
 */
export interface TutorHint {
  technique: TutorTechnique;
  placement: { row: number; col: number; value: number } | null;
  eliminations: { row: number; col: number; candidates: Set<number> }[];
  steps: TutorStep[];
}

// MARK: - Small helpers

interface Pos {
  row: number;
  col: number;
}

interface Elim {
  pos: Pos;
  removed: Set<number>;
}

type UnitKind =
  | { kind: 'row'; index: number }
  | { kind: 'column'; index: number }
  | { kind: 'box'; rowBlock: number; colBlock: number };

function unitLabel(k: UnitKind): string {
  return k.kind === 'row' ? 'row' : k.kind === 'column' ? 'column' : '3×3 box';
}

function unitCells(k: UnitKind): Pos[] {
  const out: Pos[] = [];
  if (k.kind === 'row') for (let c = 0; c < 9; c++) out.push({ row: k.index, col: c });
  else if (k.kind === 'column') for (let r = 0; r < 9; r++) out.push({ row: r, col: k.index });
  else
    for (let r = k.rowBlock * 3; r < k.rowBlock * 3 + 3; r++)
      for (let c = k.colBlock * 3; c < k.colBlock * 3 + 3; c++) out.push({ row: r, col: c });
  return out;
}

/** Rows 0–8, then columns 0–8, then boxes in reading order. */
function allUnits(): { kind: UnitKind; cells: Pos[] }[] {
  const kinds: UnitKind[] = [];
  for (let i = 0; i < 9; i++) kinds.push({ kind: 'row', index: i });
  for (let i = 0; i < 9; i++) kinds.push({ kind: 'column', index: i });
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) kinds.push({ kind: 'box', rowBlock: br, colBlock: bc });
  return kinds.map((kind) => ({ kind, cells: unitCells(kind) }));
}

const samePos = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;
const posIdx = (p: Pos) => p.row * 9 + p.col;
const idxPos = (i: number): Pos => ({ row: Math.floor(i / 9), col: i % 9 });
const div3 = (n: number) => Math.floor(n / 3);

function setEq(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function isSubset(a: Set<number>, b: Set<number>): boolean {
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function union(...sets: Set<number>[]): Set<number> {
  const out = new Set<number>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

function subtract(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const v of a) if (!b.has(v)) out.add(v);
  return out;
}

const sorted = (s: Iterable<number>) => [...s].sort((x, y) => x - y);
const only = (s: Set<number>) => s.values().next().value as number;

function hl(row: number, col: number, kind: TutorHighlight['kind'], cands: Iterable<number> = []): TutorHighlight {
  return { row, col, kind, candidates: new Set(cands) };
}

function toElims(list: Elim[]): TutorHint['eliminations'] {
  return list.map((e) => ({ row: e.pos.row, col: e.pos.col, candidates: new Set(e.removed) }));
}

function digitElims(list: Pos[], digit: number): TutorHint['eliminations'] {
  return list.map((p) => ({ row: p.row, col: p.col, candidates: new Set([digit]) }));
}

/** Two cells "see" each other if they share a row, column or box (and aren't the same cell). */
function sees(a: Pos, b: Pos): boolean {
  if (a.row === b.row && a.col === b.col) return false;
  if (a.row === b.row || a.col === b.col) return true;
  return div3(a.row) === div3(b.row) && div3(a.col) === div3(b.col);
}

function peers(row: number, col: number): Pos[] {
  const out: Pos[] = [];
  for (let c = 0; c < 9; c++) if (c !== col) out.push({ row, col: c });
  for (let r = 0; r < 9; r++) if (r !== row) out.push({ row: r, col });
  const br = div3(row) * 3;
  const bc = div3(col) * 3;
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) if (r !== row && c !== col) out.push({ row: r, col: c });
  return out;
}

function peerValues(row: number, col: number, cells: Cells): Set<number> {
  const out = new Set<number>();
  for (const p of peers(row, col)) {
    const v = cells[p.row][p.col].value;
    if (v !== null) out.add(v);
  }
  return out;
}

const isEmpty = (cells: Cells, p: Pos) => cells[p.row][p.col].value === null;
const engineHas = (cells: Cells, p: Pos, d: number) => isEmpty(cells, p) && candidates(p.row, p.col, cells).has(d);
const notesHave = (cells: Cells, p: Pos, d: number) => isEmpty(cells, p) && cells[p.row][p.col].notes.has(d);

function missingDigits(unit: Pos[], cells: Cells): number[] {
  const placed = new Set<number>();
  for (const p of unit) {
    const v = cells[p.row][p.col].value;
    if (v !== null) placed.add(v);
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !placed.has(d));
}

// MARK: - Entry points

/** Easiest applicable hint, or null if no implemented technique fits. */
export function findHint(cells: Cells): TutorHint | null {
  return (
    findNakedSingle(cells) ??
    findHiddenSingle(cells) ??
    findNakedPair(cells) ??
    findPointingPair(cells) ??
    findBoxLineReduction(cells) ??
    findHiddenPair(cells) ??
    findNakedTriple(cells) ??
    findHiddenTriple(cells) ??
    findXWing(cells) ??
    findXYWing(cells) ??
    findSwordfish(cells) ??
    findNakedQuad(cells) ??
    findHiddenQuad(cells) ??
    findJellyfish(cells) ??
    findXYZWing(cells) ??
    findWWing(cells) ??
    findSkyscraper(cells) ??
    findTwoStringKite(cells) ??
    findEmptyRectangle(cells) ??
    findFinnedXWing(cells) ??
    findFinnedSwordfish(cells) ??
    findUniqueRectangle(cells)
  );
}

/**
 * Solve by repeatedly applying engine hints and return the hardest tier
 * required, or null if the implemented techniques can't finish it. Used by
 * the generator to calibrate difficulty against techniques, not clue count.
 */
export function classify(startCells: Cells): TutorTier | null {
  const cells = autoPencil(startCells);
  let maxTier: TutorTier = 'simple';
  // Safety cap against pathological loops; real puzzles need well under 200.
  for (let i = 0; i < 400; i++) {
    if (isSolved(cells)) return maxTier;
    let hint = findHint(cells);
    // The tutor's singles read candidates straight off the placed digits
    // (deliberately — no spoilers from the player's pencil marks), so they
    // can't see eliminations made by pairs, wings and fish. Without this
    // step every puzzle needing a medium/hard technique stalled into null
    // and the generator could never produce Medium or Hard. The single that
    // an elimination unlocks is charged to that elimination's tier.
    if (hint && !hint.placement) {
      const single = noteSingle(cells);
      if (single) {
        applyHint(single, cells);
        continue;
      }
    }
    if (!hint) {
      const single = noteSingle(cells);
      if (!single) return null;
      hint = single;
    }
    maxTier = harder(maxTier, techniqueTier(hint.technique));
    applyHint(hint, cells);
  }
  return null;
}

/** Classify-only: a naked or hidden single read from pencil marks rather than placed digits. */
function noteSingle(cells: Cells): TutorHint | null {
  const place = (row: number, col: number, value: number): TutorHint => ({
    technique: 'nakedSingle',
    placement: { row, col, value },
    eliminations: [],
    steps: [],
  });
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const cell = cells[r][c];
      if (cell.value === null && cell.notes.size === 1) return place(r, c, [...cell.notes][0]);
    }
  const units: [number, number][][] = [];
  for (let i = 0; i < 9; i++) {
    units.push(Array.from({ length: 9 }, (_, j) => [i, j] as [number, number]));
    units.push(Array.from({ length: 9 }, (_, j) => [j, i] as [number, number]));
    units.push(
      Array.from({ length: 9 }, (_, j) => [div3(i) * 3 + div3(j), (i % 3) * 3 + (j % 3)] as [number, number]),
    );
  }
  for (const unit of units)
    for (let d = 1; d <= 9; d++) {
      if (unit.some(([r, c]) => cells[r][c].value === d)) continue;
      const spots = unit.filter(([r, c]) => cells[r][c].value === null && cells[r][c].notes.has(d));
      if (spots.length === 1) return place(spots[0][0], spots[0][1], d);
    }
  return null;
}

function isSolved(cells: Cells): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (cells[r][c].value === null) return false;
  return true;
}

function harder(a: TutorTier, b: TutorTier): TutorTier {
  if (a === 'hard' || b === 'hard') return 'hard';
  if (a === 'medium' || b === 'medium') return 'medium';
  return 'simple';
}

/** Mutates `cells` (a private working copy). Placement also clears the digit from peers' notes. */
function applyHint(hint: TutorHint, cells: Cells): void {
  const p = hint.placement;
  if (p) {
    cells[p.row][p.col].value = p.value;
    cells[p.row][p.col].notes = new Set();
    for (let c = 0; c < 9; c++) if (c !== p.col) cells[p.row][c].notes.delete(p.value);
    for (let r = 0; r < 9; r++) if (r !== p.row) cells[r][p.col].notes.delete(p.value);
    const br = div3(p.row) * 3;
    const bc = div3(p.col) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++) if (!(r === p.row && c === p.col)) cells[r][c].notes.delete(p.value);
  } else {
    for (const e of hint.eliminations) for (const d of e.candidates) cells[e.row][e.col].notes.delete(d);
  }
}

/** Returns a clone with every empty cell's notes set to its engine candidates. */
function autoPencil(cells: Cells): Cells {
  const result = cloneCells(cells);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (result[r][c].value === null) result[r][c].notes = candidates(r, c, result);
  return result;
}

// MARK: - Naked single

export function findNakedSingle(cells: Cells): TutorHint | null {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      if (cells[r][c].value !== null) continue;
      const cands = candidates(r, c, cells);
      if (cands.size === 1) return buildNakedSingle(r, c, only(cands), cells);
    }
  return null;
}

function buildNakedSingle(row: number, col: number, value: number, cells: Cells): TutorHint {
  const usedList = sorted(peerValues(row, col, cells)).join(', ');
  const target = hl(row, col, 'target');
  const eliminators = peers(row, col)
    .filter((p) => cells[p.row][p.col].value !== null)
    .map((p) => hl(p.row, p.col, 'eliminator'));
  return {
    technique: 'nakedSingle',
    placement: { row, col, value },
    eliminations: [],
    steps: [
      {
        narration: "Take a look at this empty cell. We're going to figure out what number can go here.",
        highlights: [target],
      },
      {
        narration: `Its row, column, and 3×3 box already use ${usedList}. Each of those is ruled out for this cell.`,
        highlights: [target, ...eliminators],
      },
      { narration: `That leaves only ${value}. It must go in this cell.`, highlights: [target] },
    ],
  };
}

// MARK: - Hidden single

export function findHiddenSingle(cells: Cells): TutorHint | null {
  for (let r = 0; r < 9; r++) {
    const kind: UnitKind = { kind: 'row', index: r };
    const h = hiddenSingleInUnit(unitCells(kind), kind, cells);
    if (h) return h;
  }
  for (let c = 0; c < 9; c++) {
    const kind: UnitKind = { kind: 'column', index: c };
    const h = hiddenSingleInUnit(unitCells(kind), kind, cells);
    if (h) return h;
  }
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const kind: UnitKind = { kind: 'box', rowBlock: br, colBlock: bc };
      const h = hiddenSingleInUnit(unitCells(kind), kind, cells);
      if (h) return h;
    }
  return null;
}

function hiddenSingleInUnit(unit: Pos[], kind: UnitKind, cells: Cells): TutorHint | null {
  const label = unitLabel(kind);
  for (const v of missingDigits(unit, cells)) {
    const spots = unit.filter((p) => engineHas(cells, p, v));
    if (spots.length !== 1) continue;
    const target = spots[0];

    // Swift dedupes via Array(Set(...)), which scrambles order; we dedupe
    // keeping first-seen order instead (highlight order only, no behaviour change).
    const eliminators: TutorHighlight[] = [];
    const seen = new Set<number>();
    for (const cell of unit) {
      if (!isEmpty(cells, cell) || samePos(cell, target)) continue;
      for (const peer of peers(cell.row, cell.col)) {
        if (unit.some((u) => samePos(u, peer)) || cells[peer.row][peer.col].value !== v) continue;
        if (seen.has(posIdx(peer))) continue;
        seen.add(posIdx(peer));
        eliminators.push(hl(peer.row, peer.col, 'eliminator'));
      }
    }

    const focus = unit.map((p) => hl(p.row, p.col, 'focus'));
    const targetHL = hl(target.row, target.col, 'target');
    return {
      technique: 'hiddenSingle',
      placement: { row: target.row, col: target.col, value: v },
      eliminations: [],
      steps: [
        { narration: `Look at this ${label}. It's missing the digit ${v}.`, highlights: focus },
        {
          narration: `${v} already appears in the rows, columns, or boxes of every other empty cell in this ${label} — so ${v} can't go in any of them.`,
          highlights: [...focus, ...eliminators],
        },
        { narration: `Only this cell is left. ${v} must go here.`, highlights: [...focus, targetHL] },
      ],
    };
  }
  return null;
}

// MARK: - Naked pair
//
// Two empty cells in a unit each have exactly the same two candidates
// {a, b}, so a and b are eliminated from every other cell of the unit.

export function findNakedPair(cells: Cells): TutorHint | null {
  for (const { kind, cells: unit } of allUnits()) {
    const empties = unit.filter((p) => isEmpty(cells, p));
    // Pencil-mark technique: exactly two user marks, a subset of the engine's
    // view (no invented digits). Prior eliminations may have narrowed notes
    // below the engine baseline — trust them.
    const pairCandidates = empties.filter((p) => {
      const marks = cells[p.row][p.col].notes;
      return marks.size === 2 && isSubset(marks, candidates(p.row, p.col, cells));
    });
    for (let i = 0; i < pairCandidates.length; i++) {
      const a = pairCandidates[i];
      const aMarks = cells[a.row][a.col].notes;
      for (let j = i + 1; j < pairCandidates.length; j++) {
        const b = pairCandidates[j];
        if (!setEq(aMarks, cells[b.row][b.col].notes)) continue;
        const pairCands = aMarks;
        const eliminations: Elim[] = [];
        for (const other of empties) {
          if (samePos(other, a) || samePos(other, b)) continue;
          const removed = intersect(cells[other.row][other.col].notes, pairCands);
          if (removed.size > 0) eliminations.push({ pos: other, removed });
        }
        if (eliminations.length === 0) continue;
        return buildNakedPair(unit, kind, [a, b], pairCands, eliminations);
      }
    }
  }
  return null;
}

function buildNakedPair(unit: Pos[], kind: UnitKind, pair: [Pos, Pos], pairCands: Set<number>, eliminations: Elim[]): TutorHint {
  const pairList = sorted(pairCands).join(' and ');
  const label = unitLabel(kind);
  const focus = unit.map((p) => hl(p.row, p.col, 'focus'));
  const pairHLs = pair.map((p) => hl(p.row, p.col, 'target', pairCands));
  const elimHLs = eliminations.map((e) => hl(e.pos.row, e.pos.col, 'eliminator', e.removed));
  return {
    technique: 'nakedPair',
    placement: null,
    eliminations: toElims(eliminations),
    steps: [
      {
        narration: `Look at this ${label}. These two cells can each only hold ${pairList}.`,
        highlights: [...focus, ...pairHLs],
      },
      {
        narration: `Together they must take ${pairList} in some order — so ${pairList} can be ruled out everywhere else in this ${label}.`,
        highlights: [...focus, ...pairHLs, ...elimHLs],
      },
      { narration: 'Tap Got it to erase those candidates from these cells.', highlights: elimHLs },
    ],
  };
}

// MARK: - Pointing pair
//
// Within a box, every cell that could hold a digit lies in one row or
// column, so the digit is ruled out of that line outside the box.

export function findPointingPair(cells: Cells): TutorHint | null {
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const box = unitCells({ kind: 'box', rowBlock: br, colBlock: bc });
      for (const d of missingDigits(box, cells)) {
        const engineCands = box.filter((p) => engineHas(cells, p, d));
        if (engineCands.length < 2) continue;
        // The user must have pencilled d in every one of those cells, or the
        // hint would be a spoiler / could mislead.
        if (!engineCands.every((p) => cells[p.row][p.col].notes.has(d))) continue;

        const rows = new Set(engineCands.map((p) => p.row));
        const cols = new Set(engineCands.map((p) => p.col));
        if (rows.size === 1) {
          const r = only(rows);
          const eliminators: Pos[] = [];
          for (let c = 0; c < 9; c++) {
            if (c >= bc * 3 && c < bc * 3 + 3) continue;
            if (notesHave(cells, { row: r, col: c }, d)) eliminators.push({ row: r, col: c });
          }
          if (eliminators.length > 0) return buildPointingPair(box, engineCands, 'row', d, eliminators);
        } else if (cols.size === 1) {
          const c = only(cols);
          const eliminators: Pos[] = [];
          for (let r = 0; r < 9; r++) {
            if (r >= br * 3 && r < br * 3 + 3) continue;
            if (notesHave(cells, { row: r, col: c }, d)) eliminators.push({ row: r, col: c });
          }
          if (eliminators.length > 0) return buildPointingPair(box, engineCands, 'column', d, eliminators);
        }
      }
    }
  return null;
}

function buildPointingPair(box: Pos[], candidateCells: Pos[], lineLabel: string, digit: number, eliminators: Pos[]): TutorHint {
  const boxFocus = box.map((p) => hl(p.row, p.col, 'focus'));
  const candHLs = candidateCells.map((p) => hl(p.row, p.col, 'target', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'pointingPair',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      { narration: `Look at this 3×3 box — where can the digit ${digit} go inside it?`, highlights: boxFocus },
      {
        narration: `Inside the box, ${digit} can only land in this ${lineLabel}. It has to be one of these cells.`,
        highlights: [...boxFocus, ...candHLs],
      },
      {
        narration: `Since ${digit} must take one of those positions, it can't appear anywhere else in this ${lineLabel} outside the box.`,
        highlights: [...candHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off the candidates of these outside cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Box-line reduction
//
// Inverse of pointing pair: within a row/column, every cell that could hold
// a digit lies inside one box, so the digit is ruled out of the box's other cells.

export function findBoxLineReduction(cells: Cells): TutorHint | null {
  for (let r = 0; r < 9; r++) {
    const h = boxLineFromLine(unitCells({ kind: 'row', index: r }), 'row', r, cells);
    if (h) return h;
  }
  for (let c = 0; c < 9; c++) {
    const h = boxLineFromLine(unitCells({ kind: 'column', index: c }), 'column', c, cells);
    if (h) return h;
  }
  return null;
}

function boxLineFromLine(line: Pos[], lineKind: 'row' | 'column', index: number, cells: Cells): TutorHint | null {
  for (const d of missingDigits(line, cells)) {
    const engineCands = line.filter((p) => engineHas(cells, p, d));
    if (engineCands.length < 2) continue;
    const boxRows = new Set(engineCands.map((p) => div3(p.row)));
    const boxCols = new Set(engineCands.map((p) => div3(p.col)));
    if (boxRows.size !== 1 || boxCols.size !== 1) continue;
    // User must have pencilled d in every line-candidate cell.
    if (!engineCands.every((p) => cells[p.row][p.col].notes.has(d))) continue;

    const box = unitCells({ kind: 'box', rowBlock: only(boxRows), colBlock: only(boxCols) });
    // Box cells off the line that still have d pencilled.
    const eliminators = box.filter(
      (p) => notesHave(cells, p, d) && (lineKind === 'row' ? p.row !== index : p.col !== index),
    );
    if (eliminators.length === 0) continue;
    return buildBoxLineReduction(line, lineKind, engineCands, d, eliminators);
  }
  return null;
}

function buildBoxLineReduction(line: Pos[], lineLabel: string, candidateCells: Pos[], digit: number, eliminators: Pos[]): TutorHint {
  const lineFocus = line.map((p) => hl(p.row, p.col, 'focus'));
  const candHLs = candidateCells.map((p) => hl(p.row, p.col, 'target', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'boxLineReduction',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      { narration: `Look at this ${lineLabel} — where can the digit ${digit} go in it?`, highlights: lineFocus },
      {
        narration: `Every spot for ${digit} in this ${lineLabel} lands inside the same 3×3 box.`,
        highlights: [...lineFocus, ...candHLs],
      },
      {
        narration: `Since ${digit} has to take one of those line cells, it can't go in any *other* cell of that box.`,
        highlights: [...candHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these box cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Hidden pair
//
// Two missing digits in a unit can each only land in the same two cells, so
// every *other* candidate in those cells can be eliminated.

export function findHiddenPair(cells: Cells): TutorHint | null {
  for (const { kind, cells: unit } of allUnits()) {
    const missing = missingDigits(unit, cells);
    if (missing.length < 2) continue;
    for (let i = 0; i < missing.length; i++)
      for (let j = i + 1; j < missing.length; j++) {
        const a = missing[i];
        const b = missing[j];
        const aCells = unit.filter((p) => engineHas(cells, p, a));
        const bCells = unit.filter((p) => engineHas(cells, p, b));
        if (aCells.length !== 2 || bCells.length !== 2) continue;
        // Must be the *same* two cells.
        if (!setEq(new Set(aCells.map(posIdx)), new Set(bCells.map(posIdx)))) continue;

        // User has pencilled both a and b in both pair cells.
        const pairCells = aCells;
        if (!pairCells.every((p) => cells[p.row][p.col].notes.has(a) && cells[p.row][p.col].notes.has(b))) continue;

        // Extras in the pair cells' notes. None at all = naked pair (caught earlier).
        const pairDigits = new Set([a, b]);
        const eliminations: Elim[] = [];
        for (const p of pairCells) {
          const extras = subtract(cells[p.row][p.col].notes, pairDigits);
          if (extras.size > 0) eliminations.push({ pos: p, removed: extras });
        }
        if (eliminations.length === 0) continue;
        return buildHiddenPair(unit, kind, pairCells, pairDigits, eliminations);
      }
  }
  return null;
}

function buildHiddenPair(unit: Pos[], kind: UnitKind, pairCells: Pos[], pairDigits: Set<number>, eliminations: Elim[]): TutorHint {
  const pairList = sorted(pairDigits).join(' and ');
  const focus = unit.map((p) => hl(p.row, p.col, 'focus'));
  const targetHLs = pairCells.map((p) => hl(p.row, p.col, 'target', pairDigits));
  // Eliminator highlights sit on the same cells as the targets — per-digit
  // tinting keeps {a, b} green and the rest red.
  const elimHLs = eliminations.map((e) => hl(e.pos.row, e.pos.col, 'eliminator', e.removed));
  return {
    technique: 'hiddenPair',
    placement: null,
    eliminations: toElims(eliminations),
    steps: [
      {
        narration: `Look at this ${unitLabel(kind)}. Both ${pairList} can only land in the same two cells.`,
        highlights: focus,
      },
      {
        narration: `Since these two cells must hold ${pairList} (in some order), no other digit can go in either of them.`,
        highlights: [...focus, ...targetHLs],
      },
      {
        narration: `The other candidates in those cells can be eliminated — only ${pairList} remains.`,
        highlights: [...targetHLs, ...elimHLs],
      },
      { narration: 'Tap Got it to clear those candidates.', highlights: [...targetHLs, ...elimHLs] },
    ],
  };
}

// MARK: - Naked subsets (triple / quad)
//
// N empty cells in a unit whose combined user-pencilled candidates total
// exactly N digits (each cell may hold only some of them). Those digits must
// occupy these cells, so they're eliminated from the rest of the unit.

export function findNakedTriple(cells: Cells): TutorHint | null {
  for (const { kind, cells: unit } of allUnits()) {
    const empties = unit.filter((p) => isEmpty(cells, p));
    // Size 2–3 user marks, a valid subset of engine candidates.
    const eligible = empties.filter((p) => {
      const n = cells[p.row][p.col].notes;
      return (n.size === 2 || n.size === 3) && isSubset(n, candidates(p.row, p.col, cells));
    });
    for (let i = 0; i < eligible.length; i++)
      for (let j = i + 1; j < eligible.length; j++)
        for (let k = j + 1; k < eligible.length; k++) {
          const group = [eligible[i], eligible[j], eligible[k]];
          const h = nakedSubsetHint(cells, unit, kind, empties, group, 'nakedTriple');
          if (h) return h;
        }
  }
  return null;
}

export function findNakedQuad(cells: Cells): TutorHint | null {
  for (const { kind, cells: unit } of allUnits()) {
    const empties = unit.filter((p) => isEmpty(cells, p));
    // Size 2–4 user marks, a valid subset of engine candidates.
    const eligible = empties.filter((p) => {
      const n = cells[p.row][p.col].notes;
      return n.size >= 2 && n.size <= 4 && isSubset(n, candidates(p.row, p.col, cells));
    });
    if (eligible.length < 4) continue;
    for (let i = 0; i < eligible.length; i++)
      for (let j = i + 1; j < eligible.length; j++)
        for (let k = j + 1; k < eligible.length; k++)
          for (let l = k + 1; l < eligible.length; l++) {
            const group = [eligible[i], eligible[j], eligible[k], eligible[l]];
            const h = nakedSubsetHint(cells, unit, kind, empties, group, 'nakedQuad');
            if (h) return h;
          }
  }
  return null;
}

function nakedSubsetHint(
  cells: Cells,
  unit: Pos[],
  kind: UnitKind,
  empties: Pos[],
  group: Pos[],
  technique: 'nakedTriple' | 'nakedQuad',
): TutorHint | null {
  const digits = union(...group.map((p) => cells[p.row][p.col].notes));
  if (digits.size !== group.length) return null;
  const eliminations: Elim[] = [];
  for (const other of empties) {
    if (group.some((g) => samePos(g, other))) continue;
    const removed = intersect(cells[other.row][other.col].notes, digits);
    if (removed.size > 0) eliminations.push({ pos: other, removed });
  }
  if (eliminations.length === 0) return null;

  const digitList = sorted(digits).join(', ');
  const label = unitLabel(kind);
  const count = technique === 'nakedTriple' ? 'three' : 'four';
  const focus = unit.map((p) => hl(p.row, p.col, 'focus'));
  const groupHLs = group.map((p) => hl(p.row, p.col, 'target', digits));
  const elimHLs = eliminations.map((e) => hl(e.pos.row, e.pos.col, 'eliminator', e.removed));
  return {
    technique,
    placement: null,
    eliminations: toElims(eliminations),
    steps: [
      {
        narration: `Look at this ${label}. These ${count} cells together can only hold ${digitList}.`,
        highlights: [...focus, ...groupHLs],
      },
      {
        narration: `Together they must take ${digitList} in some order — so those digits can be ruled out everywhere else in this ${label}.`,
        highlights: [...focus, ...groupHLs, ...elimHLs],
      },
      { narration: 'Tap Got it to erase those candidates from these cells.', highlights: elimHLs },
    ],
  };
}

// MARK: - Hidden subsets (triple / quad)
//
// N missing digits in a unit can each only land in (a subset of) the same N
// cells, so every other candidate in those cells can be eliminated.
// Validation: for each of the N digits, the user's pencilled cells in the
// unit must exactly equal the engine's candidate cells — keeps the tutor
// honest and the user un-spoiled.

export function findHiddenTriple(cells: Cells): TutorHint | null {
  return findHiddenSubset(cells, 3);
}

export function findHiddenQuad(cells: Cells): TutorHint | null {
  return findHiddenSubset(cells, 4);
}

function findHiddenSubset(cells: Cells, n: 3 | 4): TutorHint | null {
  for (const { kind, cells: unit } of allUnits()) {
    const missing = missingDigits(unit, cells);
    if (missing.length < n) continue;

    // Engine view of where each missing digit can go (cell indices). Only
    // digits with 2..n candidate cells can participate.
    const digitCells = new Map<number, Set<number>>();
    for (const d of missing) {
      const spots = unit.filter((p) => engineHas(cells, p, d));
      if (spots.length >= 2 && spots.length <= n) digitCells.set(d, new Set(spots.map(posIdx)));
    }
    const eligible = sorted(digitCells.keys());
    if (eligible.length < n) continue;

    for (const combo of combinations(eligible, n)) {
      const cellSet = union(...combo.map((d) => digitCells.get(d)!));
      if (cellSet.size !== n) continue;

      const valid = combo.every((d) => {
        const userCells = new Set(unit.filter((p) => cells[p.row][p.col].notes.has(d)).map(posIdx));
        return setEq(userCells, digitCells.get(d)!);
      });
      if (!valid) continue;

      const subsetDigits = new Set(combo);
      const subsetCells = sorted(cellSet).map(idxPos); // (row, col) order
      const eliminations: Elim[] = [];
      for (const p of subsetCells) {
        const extras = subtract(cells[p.row][p.col].notes, subsetDigits);
        if (extras.size > 0) eliminations.push({ pos: p, removed: extras });
      }
      if (eliminations.length === 0) continue;
      return buildHiddenSubset(unit, kind, subsetCells, subsetDigits, eliminations, n);
    }
  }
  return null;
}

/** k-combinations of `items` in lexicographic index order (matches nested i<j<k loops). */
function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

function buildHiddenSubset(
  unit: Pos[],
  kind: UnitKind,
  subsetCells: Pos[],
  digits: Set<number>,
  eliminations: Elim[],
  n: 3 | 4,
): TutorHint {
  const digitList = sorted(digits).join(', ');
  const count = n === 3 ? 'three' : 'four';
  const focus = unit.map((p) => hl(p.row, p.col, 'focus'));
  const targetHLs = subsetCells.map((p) => hl(p.row, p.col, 'target', digits));
  const elimHLs = eliminations.map((e) => hl(e.pos.row, e.pos.col, 'eliminator', e.removed));
  return {
    technique: n === 3 ? 'hiddenTriple' : 'hiddenQuad',
    placement: null,
    eliminations: toElims(eliminations),
    steps: [
      {
        narration: `Look at this ${unitLabel(kind)}. The digits ${digitList} can only land in the same ${count} cells.`,
        highlights: focus,
      },
      {
        narration: `Since these ${count} cells must hold ${digitList} in some order, no other digit can go in any of them.`,
        highlights: [...focus, ...targetHLs],
      },
      {
        narration: `The other candidates in those cells can be eliminated — only ${digitList} remains.`,
        highlights: [...targetHLs, ...elimHLs],
      },
      { narration: 'Tap Got it to clear those candidates.', highlights: [...targetHLs, ...elimHLs] },
    ],
  };
}

// MARK: - Fish (X-Wing / Swordfish / Jellyfish)
//
// A digit d is confined, across N rows, to the same N columns (or vice
// versa). It must take one cell per row and per column inside that grid, so
// d is eliminated from those columns in every other row.
// Validation: in each line, the user's pencilled d-cells must equal the
// engine's, so the user can actually see the pattern.

type Orientation = 'rows' | 'columns';

/** Lines where d isn't placed and has `minCount..maxCount` engine candidates matching the user's marks. */
function fishLines(d: number, orientation: Orientation, cells: Cells, maxCount: number): Map<number, Set<number>> {
  const at = (primary: number, other: number): Pos =>
    orientation === 'rows' ? { row: primary, col: other } : { row: other, col: primary };
  const lineCross = new Map<number, Set<number>>();
  for (let primary = 0; primary < 9; primary++) {
    let placed = false;
    for (let o = 0; o < 9; o++) {
      const p = at(primary, o);
      if (cells[p.row][p.col].value === d) placed = true;
    }
    if (placed) continue;
    const engineCross: number[] = [];
    const userCross: number[] = [];
    for (let o = 0; o < 9; o++) {
      const p = at(primary, o);
      if (engineHas(cells, p, d)) engineCross.push(o);
      if (notesHave(cells, p, d)) userCross.push(o);
    }
    if (engineCross.length >= 2 && engineCross.length <= maxCount && setEq(new Set(engineCross), new Set(userCross)))
      lineCross.set(primary, new Set(engineCross));
  }
  return lineCross;
}

function fishEliminators(d: number, orientation: Orientation, cells: Cells, lines: number[], cross: number[]): Pos[] {
  const out: Pos[] = [];
  for (let primary = 0; primary < 9; primary++) {
    if (lines.includes(primary)) continue;
    for (const x of cross) {
      const p = orientation === 'rows' ? { row: primary, col: x } : { row: x, col: primary };
      if (notesHave(cells, p, d)) out.push(p);
    }
  }
  return out;
}

export function findXWing(cells: Cells): TutorHint | null {
  for (let d = 1; d <= 9; d++) {
    const h = xWingFor(d, 'rows', cells) ?? xWingFor(d, 'columns', cells);
    if (h) return h;
  }
  return null;
}

function xWingFor(d: number, orientation: Orientation, cells: Cells): TutorHint | null {
  const lineCross = fishLines(d, orientation, cells, 2);
  const lines = sorted(lineCross.keys());
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i];
      const l2 = lines[j];
      const cross = lineCross.get(l1)!;
      if (!setEq(cross, lineCross.get(l2)!)) continue;
      const [x1, x2] = sorted(cross);
      const eliminators = fishEliminators(d, orientation, cells, [l1, l2], [x1, x2]);
      if (eliminators.length === 0) continue;
      return buildXWing(orientation, [l1, l2], [x1, x2], d, eliminators);
    }
  return null;
}

function buildXWing(orientation: Orientation, lines: [number, number], cross: [number, number], digit: number, eliminators: Pos[]): TutorHint {
  const lineLabel = orientation === 'rows' ? 'rows' : 'columns';
  const crossLabel = orientation === 'rows' ? 'columns' : 'rows';
  const corners: Pos[] =
    orientation === 'rows'
      ? [
          { row: lines[0], col: cross[0] },
          { row: lines[0], col: cross[1] },
          { row: lines[1], col: cross[0] },
          { row: lines[1], col: cross[1] },
        ]
      : [
          { row: cross[0], col: lines[0] },
          { row: cross[0], col: lines[1] },
          { row: cross[1], col: lines[0] },
          { row: cross[1], col: lines[1] },
        ];
  const lineFocus: TutorHighlight[] = [];
  for (let i = 0; i < 9; i++) {
    if (orientation === 'rows') lineFocus.push(hl(lines[0], i, 'focus'), hl(lines[1], i, 'focus'));
    else lineFocus.push(hl(i, lines[0], 'focus'), hl(i, lines[1], 'focus'));
  }
  const cornerHLs = corners.map((p) => hl(p.row, p.col, 'target', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'xWing',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `Look at these two ${lineLabel}. The digit ${digit} can only land in two cells in each — and they share the same two ${crossLabel}.`,
        highlights: [...lineFocus, ...cornerHLs],
      },
      {
        narration: `${digit} must take exactly one cell in each ${lineLabel.slice(0, -1)} — one per ${crossLabel.slice(0, -1)}. So ${digit} can't appear in those ${crossLabel} anywhere else.`,
        highlights: [...cornerHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

export function findSwordfish(cells: Cells): TutorHint | null {
  for (let d = 1; d <= 9; d++) {
    const h = bigFishFor(d, 'rows', cells, 3) ?? bigFishFor(d, 'columns', cells, 3);
    if (h) return h;
  }
  return null;
}

export function findJellyfish(cells: Cells): TutorHint | null {
  for (let d = 1; d <= 9; d++) {
    const h = bigFishFor(d, 'rows', cells, 4) ?? bigFishFor(d, 'columns', cells, 4);
    if (h) return h;
  }
  return null;
}

/** Swordfish (n = 3) and Jellyfish (n = 4): lines with 2..n candidates, n lines spanning exactly n cross-lines. */
function bigFishFor(d: number, orientation: Orientation, cells: Cells, n: 3 | 4): TutorHint | null {
  const lineCross = fishLines(d, orientation, cells, n);
  const lines = sorted(lineCross.keys());
  if (lines.length < n) return null;
  for (const combo of combinations(lines, n)) {
    const crossSet = union(...combo.map((l) => lineCross.get(l)!));
    if (crossSet.size !== n) continue;
    const crossArr = sorted(crossSet);
    const eliminators = fishEliminators(d, orientation, cells, combo, crossArr);
    if (eliminators.length === 0) continue;

    // The actual candidate cells, line by line. Swift Set order: each line's
    // cross positions are iterated ascending here (highlight order only).
    const candidateCells: Pos[] = [];
    for (const l of combo)
      for (const x of sorted(lineCross.get(l)!))
        candidateCells.push(orientation === 'rows' ? { row: l, col: x } : { row: x, col: l });
    return buildBigFish(orientation, combo, crossArr, d, candidateCells, eliminators, n);
  }
  return null;
}

function buildBigFish(
  orientation: Orientation,
  lines: number[],
  cross: number[],
  digit: number,
  candidateCells: Pos[],
  eliminators: Pos[],
  n: 3 | 4,
): TutorHint {
  const lineLabel = orientation === 'rows' ? 'rows' : 'columns';
  const crossLabel = orientation === 'rows' ? 'columns' : 'rows';
  const count = n === 3 ? 'three' : 'four';
  // All line × cross intersections get the focus tint.
  const lineFocus: TutorHighlight[] = [];
  for (const l of lines)
    for (const x of cross) lineFocus.push(orientation === 'rows' ? hl(l, x, 'focus') : hl(x, l, 'focus'));
  const candHLs = candidateCells.map((p) => hl(p.row, p.col, 'target', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: n === 3 ? 'swordfish' : 'jellyfish',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `Look at these ${count} ${lineLabel}. The digit ${digit} can only land in the same ${count} ${crossLabel} across all of them.`,
        highlights: [...lineFocus, ...candHLs],
      },
      {
        narration: `${digit} must take one cell in each ${lineLabel.slice(0, -1)} — and within those ${count} ${crossLabel}. So ${digit} can't appear in those ${crossLabel} anywhere else.`,
        highlights: [...candHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - XY-Wing
//
// Pivot {a, b}; two pincers that see it, {a, c} and {b, c}. Whatever the
// pivot is, one pincer becomes c, so any cell seeing both pincers can't be c.

interface Valued {
  pos: Pos;
  notes: Set<number>;
}

/** Empty cells whose user marks have `size` digits, all engine-valid (prior eliminations trusted). */
function cellsWithMarks(cells: Cells, size: number): Valued[] {
  const out: Valued[] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const cell = cells[r][c];
      if (cell.value !== null || cell.notes.size !== size) continue;
      if (!isSubset(cell.notes, candidates(r, c, cells))) continue;
      out.push({ pos: { row: r, col: c }, notes: cell.notes });
    }
  return out;
}

/** Empty cells (reading order) that have `digit` pencilled, aren't excluded, and see every cell in `mustSee`. */
function cellsSeeingAll(cells: Cells, digit: number, exclude: Pos[], mustSee: Pos[]): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = { row: r, col: c };
      if (exclude.some((e) => samePos(e, p))) continue;
      if (!notesHave(cells, p, digit)) continue;
      if (!mustSee.every((m) => sees(p, m))) continue;
      out.push(p);
    }
  return out;
}

export function findXYWing(cells: Cells): TutorHint | null {
  const bivalue = cellsWithMarks(cells, 2);
  for (const pivot of bivalue) {
    const [a, b] = sorted(pivot.notes);
    const pincers = bivalue.filter((v) => !samePos(v.pos, pivot.pos) && sees(v.pos, pivot.pos));
    for (let i = 0; i < pincers.length; i++)
      for (let j = i + 1; j < pincers.length; j++) {
        const p1 = pincers[i];
        const p2 = pincers[j];
        // Pincers share exactly one digit (the wing tip c), not in the pivot.
        const shared = intersect(p1.notes, p2.notes);
        if (shared.size !== 1) continue;
        const c = only(shared);
        if (pivot.notes.has(c)) continue;
        const p1IsAC = p1.notes.has(a) && !p1.notes.has(b);
        const p1IsBC = !p1.notes.has(a) && p1.notes.has(b);
        const p2IsAC = p2.notes.has(a) && !p2.notes.has(b);
        const p2IsBC = !p2.notes.has(a) && p2.notes.has(b);
        if (!((p1IsAC && p2IsBC) || (p1IsBC && p2IsAC))) continue;

        const eliminators = cellsSeeingAll(cells, c, [pivot.pos, p1.pos, p2.pos], [p1.pos, p2.pos]);
        if (eliminators.length === 0) continue;
        return buildXYWing(pivot.pos, p1.pos, p2.pos, a, b, c, p1IsAC, eliminators);
      }
  }
  return null;
}

function buildXYWing(pivot: Pos, pincer1: Pos, pincer2: Pos, a: number, b: number, c: number, p1IsAC: boolean, eliminators: Pos[]): TutorHint {
  const [ac, bc] = p1IsAC ? [pincer1, pincer2] : [pincer2, pincer1];
  const pivotHL = hl(pivot.row, pivot.col, 'target', [a, b]);
  const acHL = hl(ac.row, ac.col, 'target', [a, c]);
  const bcHL = hl(bc.row, bc.col, 'target', [b, c]);
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [c]));
  return {
    technique: 'xyWing',
    placement: null,
    eliminations: digitElims(eliminators, c),
    steps: [
      { narration: `Look at this 'pivot' cell — it can only be ${a} or ${b}.`, highlights: [pivotHL] },
      {
        narration: `These two neighbors both see the pivot. One has candidates ${a} and ${c}; the other has ${b} and ${c}.`,
        highlights: [pivotHL, acHL, bcHL],
      },
      {
        narration: `If the pivot is ${a}, the first neighbor must be ${c}. If it's ${b}, the other neighbor must be ${c}. Either way, one of them is ${c} — so any cell that sees both can't be ${c}.`,
        highlights: [pivotHL, acHL, bcHL, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${c} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - XYZ-Wing
//
// Trivalue pivot {a,b,c}; bivalue pincers {a,c} and {b,c} both seeing it.
// c is eliminated from cells that see the pivot AND both pincers.

export function findXYZWing(cells: Cells): TutorHint | null {
  const trivalue = cellsWithMarks(cells, 3);
  const bivalue = cellsWithMarks(cells, 2);
  for (const pivot of trivalue) {
    const pincers = bivalue.filter((v) => sees(v.pos, pivot.pos) && isSubset(v.notes, pivot.notes));
    for (let i = 0; i < pincers.length; i++)
      for (let j = i + 1; j < pincers.length; j++) {
        const p1 = pincers[i];
        const p2 = pincers[j];
        const shared = intersect(p1.notes, p2.notes);
        if (shared.size !== 1) continue;
        const c = only(shared);
        if (!setEq(union(p1.notes, p2.notes), pivot.notes)) continue;
        // Must see all three — pivot and both pincers.
        const eliminators = cellsSeeingAll(cells, c, [pivot.pos, p1.pos, p2.pos], [pivot.pos, p1.pos, p2.pos]);
        if (eliminators.length === 0) continue;
        return buildXYZWing(pivot.pos, p1.pos, p2.pos, c, eliminators);
      }
  }
  return null;
}

function buildXYZWing(pivot: Pos, p1: Pos, p2: Pos, c: number, eliminators: Pos[]): TutorHint {
  const pivotHL = hl(pivot.row, pivot.col, 'target', [c]);
  const p1HL = hl(p1.row, p1.col, 'target', [c]);
  const p2HL = hl(p2.row, p2.col, 'target', [c]);
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [c]));
  return {
    technique: 'xyzWing',
    placement: null,
    eliminations: digitElims(eliminators, c),
    steps: [
      {
        narration: `This trivalue cell is the pivot. The two neighbours each share two of its candidates and both have ${c}.`,
        highlights: [pivotHL, p1HL, p2HL],
      },
      {
        narration: `Whatever the pivot ends up being, one of these three cells must hold ${c}. So any cell that sees all three can't be ${c}.`,
        highlights: [pivotHL, p1HL, p2HL, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${c} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - W-Wing
//
// Two bivalue {a,b} cells that don't see each other, joined by a strong
// link on `a` (a unit where `a` has exactly two candidate cells, one seeing
// each). Exactly one bivalue cell is `b`, so cells seeing both can't be `b`.

export function findWWing(cells: Cells): TutorHint | null {
  const bivalue = cellsWithMarks(cells, 2);
  for (let i = 0; i < bivalue.length; i++)
    for (let j = i + 1; j < bivalue.length; j++) {
      const a = bivalue[i];
      const b = bivalue[j];
      if (!setEq(a.notes, b.notes)) continue;
      if (sees(a.pos, b.pos)) continue; // that'd be a naked pair
      const candArr = sorted(a.notes);
      // Try eliminating each digit via a strong link on the other.
      for (const elimDigit of candArr) {
        const linkDigit = candArr.find((d) => d !== elimDigit)!;
        const link = findStrongLink(linkDigit, a.pos, b.pos, cells);
        if (!link) continue;
        const eliminators = cellsSeeingAll(cells, elimDigit, [a.pos, b.pos], [a.pos, b.pos]);
        if (eliminators.length === 0) continue;
        return buildWWing(a.pos, b.pos, elimDigit, linkDigit, link, eliminators);
      }
    }
  return null;
}

/** Two cells in one unit holding the only `linkDigit` marks there, one seeing `a` and the other `b`. */
function findStrongLink(linkDigit: number, a: Pos, b: Pos, cells: Cells): [Pos, Pos] | null {
  for (const { cells: unit } of allUnits()) {
    const inUnit = unit.filter((p) => notesHave(cells, p, linkDigit));
    if (inUnit.length !== 2) continue;
    const [l1, l2] = inUnit;
    // A link containing a or b itself degenerates to a different pattern.
    if (samePos(l1, a) || samePos(l1, b) || samePos(l2, a) || samePos(l2, b)) continue;
    if (sees(l1, a) && sees(l2, b)) return [l1, l2];
    if (sees(l2, a) && sees(l1, b)) return [l2, l1];
  }
  return null;
}

function buildWWing(biA: Pos, biB: Pos, elimDigit: number, linkDigit: number, link: [Pos, Pos], eliminators: Pos[]): TutorHint {
  const aHL = hl(biA.row, biA.col, 'target', [linkDigit, elimDigit]);
  const bHL = hl(biB.row, biB.col, 'target', [linkDigit, elimDigit]);
  const l1HL = hl(link[0].row, link[0].col, 'focus', [linkDigit]);
  const l2HL = hl(link[1].row, link[1].col, 'focus', [linkDigit]);
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [elimDigit]));
  return {
    technique: 'wWing',
    placement: null,
    eliminations: digitElims(eliminators, elimDigit),
    steps: [
      {
        narration: `These two cells each have only ${linkDigit} and ${elimDigit} as candidates.`,
        highlights: [aHL, bHL],
      },
      {
        narration: `In a unit between them, ${linkDigit} can only land in two cells — one seeing each. So whichever of those is ${linkDigit}, the matching bivalue cell must be ${elimDigit}.`,
        highlights: [aHL, bHL, l1HL, l2HL],
      },
      {
        narration: `Either way, exactly one of the two bivalue cells is ${elimDigit}. Any cell that sees both can't be ${elimDigit}.`,
        highlights: [aHL, bHL, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${elimDigit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Skyscraper
//
// Two rows where d has exactly 2 candidate cells, sharing one column (the
// base). The other two cells (the tops) are a strong-link pair, so cells
// seeing both tops can't be d. Symmetric for columns.

export function findSkyscraper(cells: Cells): TutorHint | null {
  for (let digit = 1; digit <= 9; digit++) {
    for (const rowForm of [true, false]) {
      // Lines (rows, then columns) where digit has exactly 2 pencilled cells.
      const pairs: { line: number; xs: number[] }[] = [];
      for (let line = 0; line < 9; line++) {
        const xs: number[] = [];
        for (let x = 0; x < 9; x++) {
          const p = rowForm ? { row: line, col: x } : { row: x, col: line };
          if (notesHave(cells, p, digit)) xs.push(x);
        }
        if (xs.length === 2) pairs.push({ line, xs });
      }
      const at = (line: number, x: number): Pos => (rowForm ? { row: line, col: x } : { row: x, col: line });
      for (let i = 0; i < pairs.length; i++)
        for (let j = i + 1; j < pairs.length; j++) {
          const a = pairs[i];
          const b = pairs[j];
          const shared = a.xs.filter((x) => b.xs.includes(x));
          if (shared.length !== 1) continue;
          const base = shared[0];
          const top1 = at(a.line, a.xs.find((x) => x !== base)!);
          const top2 = at(b.line, b.xs.find((x) => x !== base)!);
          const eliminators = cellsSeeingAll(cells, digit, [top1, top2], [top1, top2]);
          if (eliminators.length === 0) continue;
          return buildSkyscraper(digit, at(a.line, base), at(b.line, base), top1, top2, eliminators, rowForm);
        }
    }
  }
  return null;
}

function buildSkyscraper(digit: number, base1: Pos, base2: Pos, top1: Pos, top2: Pos, eliminators: Pos[], rowForm: boolean): TutorHint {
  const lineLabel = rowForm ? 'row' : 'column';
  const baseLabel = rowForm ? 'column' : 'row';
  const b1 = hl(base1.row, base1.col, 'focus', [digit]);
  const b2 = hl(base2.row, base2.col, 'focus', [digit]);
  const t1 = hl(top1.row, top1.col, 'target', [digit]);
  const t2 = hl(top2.row, top2.col, 'target', [digit]);
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'skyscraper',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `In two ${lineLabel}s, ${digit} can only go in two cells each, sharing one ${baseLabel} (the 'base').`,
        highlights: [b1, b2, t1, t2],
      },
      {
        narration: `Whichever of the two base cells is ${digit}, the other ${lineLabel}'s 'top' must be ${digit}. So one of the two tops is ${digit} — any cell seeing both can't be.`,
        highlights: [t1, t2, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Empty Rectangle
//
// In box B, d's candidates lie in pivot row R plus a single column C. If
// some column outside the box has exactly two d candidates, one on row R,
// then the cell at (other end's row, C) can't be d.

export function findEmptyRectangle(cells: Cells): TutorHint | null {
  for (let digit = 1; digit <= 9; digit++)
    for (let br = 0; br < 3; br++)
      for (let bc = 0; bc < 3; bc++) {
        const boxCands = unitCells({ kind: 'box', rowBlock: br, colBlock: bc }).filter((p) => notesHave(cells, p, digit));
        if (boxCands.length < 2) continue;
        for (let pivotRow = br * 3; pivotRow < br * 3 + 3; pivotRow++) {
          const inPivot = boxCands.filter((p) => p.row === pivotRow);
          const outside = boxCands.filter((p) => p.row !== pivotRow);
          if (inPivot.length === 0 || outside.length === 0) continue;
          const outsideCols = new Set(outside.map((p) => p.col));
          if (outsideCols.size !== 1) continue;
          const pivotCol = only(outsideCols);
          for (let extCol = 0; extCol < 9; extCol++) {
            if (extCol >= bc * 3 && extCol < bc * 3 + 3) continue;
            const colCands: number[] = [];
            for (let r = 0; r < 9; r++) if (notesHave(cells, { row: r, col: extCol }, digit)) colCands.push(r);
            if (colCands.length !== 2 || !colCands.includes(pivotRow)) continue;
            const otherRow = colCands.find((r) => r !== pivotRow)!;
            if (otherRow >= br * 3 && otherRow < br * 3 + 3) continue; // inside the box
            const elim = { row: otherRow, col: pivotCol };
            if (!notesHave(cells, elim, digit)) continue;
            return buildEmptyRectangle(digit, br, bc, pivotRow, pivotCol, extCol, otherRow, elim);
          }
        }
      }
  return null;
}

function buildEmptyRectangle(
  digit: number,
  boxRow: number,
  boxCol: number,
  pivotRow: number,
  pivotCol: number,
  linkCol: number,
  linkOtherRow: number,
  eliminator: Pos,
): TutorHint {
  const boxHLs = unitCells({ kind: 'box', rowBlock: boxRow, colBlock: boxCol }).map((p) => hl(p.row, p.col, 'focus', [digit]));
  const pivotHL = hl(pivotRow, pivotCol, 'target', [digit]);
  const l1HL = hl(pivotRow, linkCol, 'target', [digit]);
  const l2HL = hl(linkOtherRow, linkCol, 'target', [digit]);
  const elimHL = hl(eliminator.row, eliminator.col, 'eliminator', [digit]);
  return {
    technique: 'emptyRectangle',
    placement: null,
    eliminations: digitElims([eliminator], digit),
    steps: [
      {
        narration: `In this 3×3 box, ${digit} is restricted such that it must land in the highlighted row or column inside the box.`,
        highlights: [...boxHLs, pivotHL],
      },
      {
        narration: `In another column, ${digit} has only two candidate cells — one on the same row as the pivot. So one end of the link is ${digit}, forcing a placement either at the box's pivot or at the link's far cell.`,
        highlights: [pivotHL, l1HL, l2HL],
      },
      {
        narration: `Whichever way it resolves, the marked cell can't be ${digit} — it'd violate the chain.`,
        highlights: [pivotHL, l1HL, l2HL, elimHL],
      },
      { narration: `Tap Got it to cross ${digit} off this cell.`, highlights: [elimHL] },
    ],
  };
}

// MARK: - 2-String Kite
//
// d has 2 candidate cells in some row and 2 in some column; one of each
// shares a box (the joint). The unjoined tips form a strong-link pair, so
// cells seeing both tips can't be d.

export function findTwoStringKite(cells: Cells): TutorHint | null {
  for (let digit = 1; digit <= 9; digit++) {
    const rowPairs: Pos[][] = [];
    for (let r = 0; r < 9; r++) {
      const cs: Pos[] = [];
      for (let c = 0; c < 9; c++) if (notesHave(cells, { row: r, col: c }, digit)) cs.push({ row: r, col: c });
      if (cs.length === 2) rowPairs.push(cs);
    }
    const colPairs: Pos[][] = [];
    for (let c = 0; c < 9; c++) {
      const cs: Pos[] = [];
      for (let r = 0; r < 9; r++) if (notesHave(cells, { row: r, col: c }, digit)) cs.push({ row: r, col: c });
      if (cs.length === 2) colPairs.push(cs);
    }
    for (const rp of rowPairs)
      for (const cp of colPairs)
        for (const jointR of rp)
          for (const jointC of cp) {
            // The joint is two *different* cells sharing a box.
            if (samePos(jointR, jointC)) continue;
            if (div3(jointR.row) !== div3(jointC.row) || div3(jointR.col) !== div3(jointC.col)) continue;
            const tipR = rp.find((p) => !samePos(p, jointR))!;
            const tipC = cp.find((p) => !samePos(p, jointC))!;
            if (samePos(tipR, tipC)) continue;
            // Tips seeing each other is still a valid elimination; accepted.
            const eliminators = cellsSeeingAll(cells, digit, [tipR, tipC, jointR, jointC], [tipR, tipC]);
            if (eliminators.length === 0) continue;
            return buildTwoStringKite(digit, jointR, jointC, tipR, tipC, eliminators);
          }
  }
  return null;
}

function buildTwoStringKite(digit: number, jointR: Pos, jointC: Pos, tipR: Pos, tipC: Pos, eliminators: Pos[]): TutorHint {
  const jr = hl(jointR.row, jointR.col, 'focus', [digit]);
  const jc = hl(jointC.row, jointC.col, 'focus', [digit]);
  const tr = hl(tipR.row, tipR.col, 'target', [digit]);
  const tc = hl(tipC.row, tipC.col, 'target', [digit]);
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'twoStringKite',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `${digit} is restricted to two cells in this row and two cells in this column. The 'joint' cells share a 3×3 box.`,
        highlights: [jr, jc, tr, tc],
      },
      {
        narration: `Whichever joint cell is ${digit} forces the other to not be — and the other tip must take ${digit} instead. Either way one of the two tips is ${digit}, so cells seeing both can't be.`,
        highlights: [tr, tc, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Finned X-Wing
//
// An X-Wing on d where one row has extra candidate cells (the fin), all in
// the same box as one corner. Eliminations are restricted to the other
// column, inside the fin's box. Row form only (as on iOS).

function rowCandidateCols(cells: Cells, digit: number, min: number, max: number): { row: number; cols: number[] }[] {
  const out: { row: number; cols: number[] }[] = [];
  for (let r = 0; r < 9; r++) {
    const cols: number[] = [];
    for (let c = 0; c < 9; c++) if (notesHave(cells, { row: r, col: c }, digit)) cols.push(c);
    if (cols.length >= min && cols.length <= max) out.push({ row: r, cols });
  }
  return out;
}

export function findFinnedXWing(cells: Cells): TutorHint | null {
  for (let digit = 1; digit <= 9; digit++) {
    const rowCands = rowCandidateCols(cells, digit, 2, 9);
    for (let i = 0; i < rowCands.length; i++)
      for (let j = 0; j < rowCands.length; j++) {
        if (i === j) continue;
        const clean = rowCands[i]; // exactly 2 candidate cells
        const finned = rowCands[j]; // 2 corners + fin
        if (clean.cols.length !== 2 || finned.cols.length <= 2) continue;
        if (!clean.cols.every((c) => finned.cols.includes(c))) continue;
        const xCols = clean.cols;
        const fin: Pos[] = finned.cols.filter((c) => !xCols.includes(c)).map((c) => ({ row: finned.row, col: c }));
        if (fin.length === 0) continue;
        // All fin cells in the same box as ONE of the corners.
        const finCol = xCols.find((cc) => fin.every((f) => div3(f.col) === div3(cc)));
        if (finCol === undefined) continue;
        const elimCol = xCols.find((c) => c !== finCol)!;
        // Cells in elimCol inside the fin's box band, off both X-Wing rows.
        const finBoxRow = div3(finned.row);
        const eliminators: Pos[] = [];
        for (let r = finBoxRow * 3; r < finBoxRow * 3 + 3; r++) {
          if (r === clean.row || r === finned.row) continue;
          if (notesHave(cells, { row: r, col: elimCol }, digit)) eliminators.push({ row: r, col: elimCol });
        }
        if (eliminators.length === 0) continue;
        return buildFinnedXWing(digit, clean.row, finned.row, finCol, elimCol, fin, eliminators);
      }
  }
  return null;
}

function buildFinnedXWing(digit: number, cleanRow: number, finnedRow: number, finCol: number, elimCol: number, fin: Pos[], eliminators: Pos[]): TutorHint {
  const cleanFin = hl(cleanRow, finCol, 'target', [digit]);
  const cleanElim = hl(cleanRow, elimCol, 'target', [digit]);
  const finnedFin = hl(finnedRow, finCol, 'target', [digit]);
  const finnedElim = hl(finnedRow, elimCol, 'target', [digit]);
  const finHLs = fin.map((p) => hl(p.row, p.col, 'focus', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'finnedXWing',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `Almost an X-Wing on ${digit} — but one row has extra candidate cells (the 'fin'), all in the same box as one corner.`,
        highlights: [cleanFin, cleanElim, finnedFin, finnedElim, ...finHLs],
      },
      {
        narration: `Either the X-Wing fires (eliminating ${digit} from the other column elsewhere), or the fin holds ${digit}. Either way, cells in the other column that share the fin's box can't be ${digit}.`,
        highlights: [finnedFin, finnedElim, ...finHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Finned Swordfish
//
// Two clean rows with ≤3 candidates spanning exactly three columns; a third
// row has those corners plus fin cells confined to one box aligned with one
// of the columns. Eliminations: the other two columns, inside the fin's box.

export function findFinnedSwordfish(cells: Cells): TutorHint | null {
  for (let digit = 1; digit <= 9; digit++) {
    const rowCands = rowCandidateCols(cells, digit, 2, 6);
    for (let f = 0; f < rowCands.length; f++)
      for (let i = 0; i < rowCands.length; i++) {
        if (i === f) continue;
        for (let j = i + 1; j < rowCands.length; j++) {
          if (j === f) continue;
          const finned = rowCands[f];
          const r1 = rowCands[i];
          const r2 = rowCands[j];
          if (r1.cols.length > 3 || r2.cols.length > 3) continue;
          const cleanCols = new Set([...r1.cols, ...r2.cols]);
          if (cleanCols.size !== 3) continue;
          if (![...cleanCols].every((c) => finned.cols.includes(c))) continue;
          const fin: Pos[] = finned.cols.filter((c) => !cleanCols.has(c)).map((c) => ({ row: finned.row, col: c }));
          if (fin.length === 0) continue;
          // Fin confined to one box, aligned with one of the swordfish columns.
          const finBoxCols = new Set(fin.map((p) => div3(p.col)));
          if (finBoxCols.size !== 1) continue;
          const finBoxCol = only(finBoxCols);
          // Swift Set order: Swift took `cleanCols.first { … }`, which is
          // arbitrary when two columns share the fin's box; we take the lowest.
          const cleanSorted = sorted(cleanCols);
          const finCornerCol = cleanSorted.find((c) => div3(c) === finBoxCol);
          if (finCornerCol === undefined) continue;
          // Swift Set order: elimination columns iterated ascending.
          const elimCols = cleanSorted.filter((c) => c !== finCornerCol);
          const finBoxRow = div3(finned.row);
          const swordfishRows = [finned.row, r1.row, r2.row];
          const eliminators: Pos[] = [];
          for (const elimCol of elimCols)
            for (let r = finBoxRow * 3; r < finBoxRow * 3 + 3; r++) {
              if (swordfishRows.includes(r)) continue;
              if (notesHave(cells, { row: r, col: elimCol }, digit)) eliminators.push({ row: r, col: elimCol });
            }
          if (eliminators.length === 0) continue;
          return buildFinnedSwordfish(digit, [r1.row, r2.row, finned.row], cleanSorted, fin, eliminators);
        }
      }
  }
  return null;
}

function buildFinnedSwordfish(digit: number, rows: number[], cols: number[], fin: Pos[], eliminators: Pos[]): TutorHint {
  const cornerHLs: TutorHighlight[] = [];
  for (const r of rows) for (const c of cols) cornerHLs.push(hl(r, c, 'target', [digit]));
  const finHLs = fin.map((p) => hl(p.row, p.col, 'focus', [digit]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [digit]));
  return {
    technique: 'finnedSwordfish',
    placement: null,
    eliminations: digitElims(eliminators, digit),
    steps: [
      {
        narration: `Almost a Swordfish on ${digit} across three rows — but one row has extra candidate cells (the 'fin'), confined to one box.`,
        highlights: [...cornerHLs, ...finHLs],
      },
      {
        narration: `Either the Swordfish fires, eliminating ${digit} from the three columns elsewhere, or the fin takes ${digit}. Either way, cells that share the fin's box and sit in the unfinned columns can't be ${digit}.`,
        highlights: [...cornerHLs, ...finHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${digit} off these cells.`, highlights: elimHLs },
    ],
  };
}

// MARK: - Unique Rectangle
//
// A 2×2 rectangle of empty cells spanning two boxes whose corners all hold
// {X, Y} would allow two solutions (swap X↔Y), so the puzzle's uniqueness
// rules it out.
//   Type 1: three bivalue corners → remove X/Y from the fourth (roof).
//   Type 2: two bivalue corners, two roofs each with the same single extra Z
//           → cells seeing both roofs can't be Z.
//   Type 4: two bivalue floors; in the roofs' shared line one of X/Y is
//           locked to the roofs → the other is removed from both roofs.

export function findUniqueRectangle(cells: Cells): TutorHint | null {
  for (let r1 = 0; r1 < 8; r1++)
    for (let r2 = r1 + 1; r2 < 9; r2++)
      for (let c1 = 0; c1 < 8; c1++)
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          if (div3(r1) === div3(r2) && div3(c1) === div3(c2)) continue; // must span two boxes
          const corners: Pos[] = [
            { row: r1, col: c1 },
            { row: r1, col: c2 },
            { row: r2, col: c1 },
            { row: r2, col: c2 },
          ];
          if (corners.some((p) => !isEmpty(cells, p))) continue;

          const engineCands = corners.map((p) => candidates(p.row, p.col, cells));
          const common = engineCands.slice(1).reduce((acc, s) => intersect(acc, s), engineCands[0]);
          if (common.size < 2) continue;

          const commonArr = sorted(common);
          for (let xi = 0; xi < commonArr.length; xi++)
            for (let yi = xi + 1; yi < commonArr.length; yi++) {
              const x = commonArr[xi];
              const y = commonArr[yi];
              const xy = new Set([x, y]);

              const bivCorners: Pos[] = [];
              const roofCorners: Pos[] = [];
              let allVisible = true;
              for (const p of corners) {
                const notes = cells[p.row][p.col].notes;
                if (!isSubset(xy, notes)) {
                  allVisible = false;
                  break;
                }
                if (setEq(notes, xy)) bivCorners.push(p);
                else roofCorners.push(p);
              }
              if (!allVisible) continue;

              if (bivCorners.length === 3 && roofCorners.length === 1) {
                const roof = roofCorners[0];
                const removed = intersect(cells[roof.row][roof.col].notes, xy);
                if (removed.size === 0) continue;
                return buildURType1(x, y, bivCorners, roof, cells[roof.row][roof.col].notes, removed);
              }

              if (bivCorners.length !== 2 || roofCorners.length !== 2) continue;

              // Type 2
              const extras0 = subtract(cells[roofCorners[0].row][roofCorners[0].col].notes, xy);
              const extras1 = subtract(cells[roofCorners[1].row][roofCorners[1].col].notes, xy);
              if (extras0.size === 1 && extras1.size === 1 && setEq(extras0, extras1)) {
                const z = only(extras0);
                const eliminators = cellsSeeingAll(cells, z, roofCorners, roofCorners);
                if (eliminators.length > 0) return buildURType2(x, y, z, bivCorners, roofCorners, eliminators);
              }

              // Type 4
              const t4 = findURType4(x, y, bivCorners, roofCorners, cells);
              if (t4) return t4;
            }
        }
  return null;
}

function findURType4(x: number, y: number, bivalue: Pos[], roofs: Pos[], cells: Cells): TutorHint | null {
  const [roof0, roof1] = roofs;
  let sharedRow: boolean;
  if (roof0.row === roof1.row) sharedRow = true;
  else if (roof0.col === roof1.col) sharedRow = false;
  else return null;

  for (const [locked, eliminated] of [
    [x, y],
    [y, x],
  ]) {
    const lockedPositions = new Set<number>();
    for (let idx = 0; idx < 9; idx++) {
      const p = sharedRow ? { row: roof0.row, col: idx } : { row: idx, col: roof0.col };
      if (engineHas(cells, p, locked)) lockedPositions.add(idx);
    }
    const roofIndices = new Set(sharedRow ? [roof0.col, roof1.col] : [roof0.row, roof1.row]);
    if (!setEq(lockedPositions, roofIndices)) continue;

    const elimRoofs = roofs.filter((p) => cells[p.row][p.col].notes.has(eliminated));
    if (elimRoofs.length === 0) continue;
    return buildURType4(x, y, locked, eliminated, bivalue, roofs, sharedRow ? 'row' : 'column', elimRoofs);
  }
  return null;
}

const xyString = (x: number, y: number) => sorted([x, y]).join(' and ');

function buildURType1(x: number, y: number, bivalue: Pos[], roof: Pos, roofNotes: Set<number>, removed: Set<number>): TutorHint {
  const xyStr = xyString(x, y);
  const bivHLs = bivalue.map((p) => hl(p.row, p.col, 'focus', [x, y]));
  const roofHL = hl(roof.row, roof.col, 'target', roofNotes);
  const elimHL = hl(roof.row, roof.col, 'eliminator', removed);
  return {
    technique: 'uniqueRectangle',
    placement: null,
    eliminations: [{ row: roof.row, col: roof.col, candidates: new Set(removed) }],
    steps: [
      {
        narration: `These four cells form a rectangle spanning two boxes. Three corners hold only ${xyStr}.`,
        highlights: [...bivHLs, roofHL],
      },
      {
        narration: `If the fourth also held only ${xyStr}, the rectangle could swap them — creating two solutions. Since this puzzle has a unique solution, ${xyStr} must be ruled out from the fourth cell.`,
        highlights: [...bivHLs, roofHL, elimHL],
      },
      { narration: `Tap Got it to remove ${xyStr} from that cell.`, highlights: [elimHL] },
    ],
  };
}

function buildURType2(x: number, y: number, z: number, bivalue: Pos[], roofs: Pos[], eliminators: Pos[]): TutorHint {
  const xyStr = xyString(x, y);
  const bivHLs = bivalue.map((p) => hl(p.row, p.col, 'focus', [x, y]));
  const roofHLs = roofs.map((p) => hl(p.row, p.col, 'target', [x, y, z]));
  const elimHLs = eliminators.map((p) => hl(p.row, p.col, 'eliminator', [z]));
  return {
    technique: 'uniqueRectangle',
    placement: null,
    eliminations: digitElims(eliminators, z),
    steps: [
      {
        narration: `Two corners of this rectangle hold only ${xyStr}. The other two each carry one extra candidate: ${z}.`,
        highlights: [...bivHLs, ...roofHLs],
      },
      {
        narration: `One of those two cells must take ${z} to break the deadly rectangle. Any cell that sees both of them can't be ${z}.`,
        highlights: [...bivHLs, ...roofHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${z} off those cells.`, highlights: elimHLs },
    ],
  };
}

function buildURType4(
  x: number,
  y: number,
  locked: number,
  eliminated: number,
  bivalue: Pos[],
  roofs: Pos[],
  roofLineKind: string,
  elimRoofs: Pos[],
): TutorHint {
  const xyStr = xyString(x, y);
  const bivHLs = bivalue.map((p) => hl(p.row, p.col, 'focus', [x, y]));
  const roofHLs = roofs.map((p) => hl(p.row, p.col, 'target', [locked, eliminated]));
  const elimHLs = elimRoofs.map((p) => hl(p.row, p.col, 'eliminator', [eliminated]));
  return {
    technique: 'uniqueRectangle',
    placement: null,
    eliminations: digitElims(elimRoofs, eliminated),
    steps: [
      {
        narration: `Two corners of this rectangle hold only ${xyStr}. In the ${roofLineKind} containing the other two, ${locked} can only go in those two cells.`,
        highlights: [...bivHLs, ...roofHLs],
      },
      {
        narration: `Since ${locked} is locked into those cells, placing ${eliminated} in either of them would recreate the deadly swappable pattern. So ${eliminated} is ruled out from both.`,
        highlights: [...bivHLs, ...roofHLs, ...elimHLs],
      },
      { narration: `Tap Got it to cross ${eliminated} off those cells.`, highlights: elimHLs },
    ],
  };
}
