// The single-player game state — port of iOS `SudokuGame.swift` (SPEC.md
// §8–§12), minus timers and storage, which the app layer owns. Pure: every
// mutating method updates `this` and the caller re-renders.
//
// One deliberate departure from the apps: speed mode is driven by real
// state (`activeNumber`) instead of being inferred from the selected cell's
// value. The apps' version couldn't arm a digit not yet on the board,
// yanked the selection across the grid when arming, and let arrow keys
// spray digits (docs/TODO.md "Speed mode — rebuild around real state").

import { candidates, cellsFromGivens, cloneCells, type Cells, type Puzzle } from './types';
import type { TutorHint } from './tutor';

export type InputMode = 'normal' | 'pencil';
export type SoundCue = 'place' | 'erase' | 'mistake' | 'unitComplete' | 'solved';

export interface RC {
  row: number;
  col: number;
}

interface PlacementUndo extends RC {
  placedValue: number;
  previousNotes: Set<number>;
  autoClearedPeers: RC[];
}

export interface GameSnapshot {
  cells: Cells;
  elapsedSeconds: number;
  mistakeCount: number;
  hintsUsed: number;
  pencilAssistsUsed: number;
  highlightMistakesEverOn: boolean;
  highlightConstraintsEverOn: boolean;
}

export function peers(row: number, col: number): RC[] {
  const out: RC[] = [];
  for (let c = 0; c < 9; c++) if (c !== col) out.push({ row, col: c });
  for (let r = 0; r < 9; r++) if (r !== row) out.push({ row: r, col });
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++) if (r !== row && c !== col) out.push({ row: r, col: c });
  return out;
}

export class Game {
  puzzle: Puzzle;
  cells: Cells;
  selected: RC | null = null;
  mode: InputMode = 'normal';
  speedMode = false;
  /** The digit armed for speed entry. Only ever non-null while speedMode is on. */
  activeNumber: number | null = null;
  highlightMistakes: boolean;
  highlightConstraints: boolean;
  highlightMistakesEverOn: boolean;
  highlightConstraintsEverOn: boolean;
  elapsedSeconds = 0;
  mistakeCount = 0;
  hintsUsed = 0;
  pencilAssistsUsed = 0;
  private lastPlacement: PlacementUndo | null = null;

  /** Fired for every audible event; the app gates it on the Sound setting. */
  onSound: (cue: SoundCue) => void = () => {};

  constructor(puzzle: Puzzle, opts: { highlightMistakes: boolean; highlightConstraints: boolean }, snap?: GameSnapshot) {
    this.puzzle = puzzle;
    this.highlightMistakes = opts.highlightMistakes;
    this.highlightConstraints = opts.highlightConstraints;
    if (snap) {
      this.cells = cloneCells(snap.cells);
      this.elapsedSeconds = snap.elapsedSeconds;
      this.mistakeCount = snap.mistakeCount;
      this.hintsUsed = snap.hintsUsed;
      this.pencilAssistsUsed = snap.pencilAssistsUsed;
      this.highlightMistakesEverOn = snap.highlightMistakesEverOn;
      this.highlightConstraintsEverOn = snap.highlightConstraintsEverOn;
    } else {
      this.cells = cellsFromGivens(puzzle.givens);
      // Sticky flags start from the current toggles and only ever flip on.
      this.highlightMistakesEverOn = opts.highlightMistakes;
      this.highlightConstraintsEverOn = opts.highlightConstraints;
    }
  }

  snapshot(): GameSnapshot {
    return {
      cells: cloneCells(this.cells),
      elapsedSeconds: this.elapsedSeconds,
      mistakeCount: this.mistakeCount,
      hintsUsed: this.hintsUsed,
      pencilAssistsUsed: this.pencilAssistsUsed,
      highlightMistakesEverOn: this.highlightMistakesEverOn,
      highlightConstraintsEverOn: this.highlightConstraintsEverOn,
    };
  }

  setHighlightMistakes(on: boolean): void {
    this.highlightMistakes = on;
    if (on) this.highlightMistakesEverOn = true;
  }

  setHighlightConstraints(on: boolean): void {
    this.highlightConstraints = on;
    if (on) this.highlightConstraintsEverOn = true;
  }

  // --- Queries ---

  get isSolved(): boolean {
    const sol = this.puzzle.solution;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const v = this.cells[r][c].value;
        if (v === null) return false;
        if (sol && sol[r][c] !== v) return false;
      }
    if (sol) return true;
    // No known solution: fall back to the rule check.
    for (let i = 0; i < 9; i++) {
      const row = new Set<number>(), col = new Set<number>(), box = new Set<number>();
      for (let j = 0; j < 9; j++) {
        row.add(this.cells[i][j].value!);
        col.add(this.cells[j][i].value!);
        box.add(this.cells[Math.floor(i / 3) * 3 + Math.floor(j / 3)][(i % 3) * 3 + (j % 3)].value!);
      }
      if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
    }
    return true;
  }

  get hasProgress(): boolean {
    return this.cells.some((row) => row.some((c) => !c.isFixed && (c.value !== null || c.notes.size > 0)));
  }

  get hasAnyPencilMarks(): boolean {
    return this.cells.some((row) => row.some((c) => c.notes.size > 0));
  }

  isLocked(row: number, col: number): boolean {
    const cell = this.cells[row][col];
    if (cell.isFixed) return true;
    const sol = this.puzzle.solution;
    return this.highlightMistakes && sol !== null && cell.value !== null && cell.value === sol[row][col];
  }

  hasConflict(row: number, col: number): boolean {
    const cell = this.cells[row][col];
    const v = cell.value;
    if (v === null || cell.isFixed) return false;
    // Solution-based: catches "wrong but not yet conflicting" placements.
    if (this.puzzle.solution) return v !== this.puzzle.solution[row][col];
    return peers(row, col).some((p) => this.cells[p.row][p.col].value === v);
  }

  isComplete(n: number): boolean {
    let count = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (this.cells[r][c].value !== n) continue;
        if (this.highlightMistakes && this.hasConflict(r, c)) continue;
        count++;
      }
    return count >= 9;
  }

  /** The digit "in focus": the armed speed digit, else the selected cell's value. */
  get focusNumber(): number | null {
    if (this.activeNumber !== null) return this.activeNumber;
    return this.selected ? this.cells[this.selected.row][this.selected.col].value : null;
  }

  isSelected(row: number, col: number): boolean {
    return this.selected?.row === row && this.selected?.col === col;
  }

  /** Same row, column or box as the selection (layer 3a). */
  isPeerOfSelection(row: number, col: number): boolean {
    const s = this.selected;
    if (!s || (s.row === row && s.col === col)) return false;
    if (s.row === row || s.col === col) return true;
    return Math.floor(s.row / 3) === Math.floor(row / 3) && Math.floor(s.col / 3) === Math.floor(col / 3);
  }

  isMatching(row: number, col: number): boolean {
    const n = this.focusNumber;
    if (n === null || this.isSelected(row, col)) return false;
    return this.cells[row][col].value === n;
  }

  /** Layers 3b/3c: cells where the focus digit can't legally go. Gated on Highlight rules. */
  isUnavailableForFocus(row: number, col: number): boolean {
    if (!this.highlightConstraints) return false;
    const v = this.focusNumber;
    if (v === null || this.isSelected(row, col)) return false;
    if (this.cells[row][col].value !== null) return true;
    for (let i = 0; i < 9; i++) if (this.cells[row][i].value === v || this.cells[i][col].value === v) return true;
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) if (this.cells[r][c].value === v) return true;
    return false;
  }

  get canEraseSelected(): boolean {
    const s = this.selected;
    if (!s || this.isLocked(s.row, s.col)) return false;
    const cell = this.cells[s.row][s.col];
    return cell.value !== null || cell.notes.size > 0;
  }

  get eraseLabel(): 'Undo' | 'Erase' {
    const s = this.selected;
    const last = this.lastPlacement;
    if (this.highlightMistakes && s && last && s.row === last.row && s.col === last.col && !this.isLocked(s.row, s.col))
      return 'Undo';
    return 'Erase';
  }

  // --- Input ---

  /**
   * A tap on a board cell. In speed mode with a digit armed, tapping an
   * empty editable cell drops the digit in (or toggles it as a note in
   * pencil mode); anything else is ordinary selection. Keeping this out of
   * select() is what stops arrow keys from placing digits.
   */
  tapCell(row: number, col: number): void {
    const n = this.activeNumber;
    if (this.speedMode && n !== null && this.cells[row][col].value === null && !this.isLocked(row, col)) {
      if (this.lastPlacement && (this.lastPlacement.row !== row || this.lastPlacement.col !== col)) this.lastPlacement = null;
      this.selected = { row, col };
      this.enterDirect(n);
      return;
    }
    if (this.speedMode && n !== null) {
      // With a digit armed, a filled (or locked) cell has nothing to take —
      // selecting it only put a yellow box on the board competing with the
      // armed digit (Derek, 25 Oct 2026).
      this.selected = null;
      this.lastPlacement = null;
      return;
    }
    this.select(row, col);
  }

  select(row: number, col: number): void {
    // Tapping the already-selected cell deselects — "show me the board with no highlights".
    if (this.isSelected(row, col)) {
      this.selected = null;
      this.lastPlacement = null;
      return;
    }
    if (this.lastPlacement && (this.lastPlacement.row !== row || this.lastPlacement.col !== col)) this.lastPlacement = null;
    this.selected = { row, col };
  }

  /** Arrow-key navigation: always just moves, never places. */
  moveSelection(dr: number, dc: number): void {
    const s = this.selected ?? { row: 0, col: 0 };
    const row = Math.max(0, Math.min(8, this.selected ? s.row + dr : 0));
    const col = Math.max(0, Math.min(8, this.selected ? s.col + dc : 0));
    if (this.lastPlacement && (this.lastPlacement.row !== row || this.lastPlacement.col !== col)) this.lastPlacement = null;
    this.selected = { row, col };
  }

  /** A number-pad (or keyboard digit) press. */
  pressNumber(n: number): void {
    if (this.speedMode) {
      // Speed mode: the pad arms a digit rather than placing it. If an empty
      // cell is already selected, fill it too — saves a tap on the first one.
      this.activeNumber = this.activeNumber === n ? null : n;
      const s = this.selected;
      if (this.activeNumber !== null && s && this.cells[s.row][s.col].value === null && !this.isLocked(s.row, s.col)) {
        this.enterDirect(n);
      }
      return;
    }
    const s = this.selected;
    // No selection, or a filled cell selected → jump to the first cell holding n.
    if (!s || this.cells[s.row][s.col].value !== null) {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (this.cells[r][c].value === n) {
            this.select(r, c);
            return;
          }
      return;
    }
    this.enterDirect(n);
  }

  private enterDirect(n: number): void {
    const s = this.selected;
    if (!s || this.isLocked(s.row, s.col)) return;
    // A tenth copy of a finished digit is always a mistake — the pad hides
    // the button, and this guards the speed and keyboard paths too.
    if (this.mode === 'normal' && this.isComplete(n)) return;
    const cell = this.cells[s.row][s.col];
    const previousNotes = new Set(cell.notes);
    let didPlace = false;

    if (this.mode === 'normal') {
      if (cell.value === n) {
        cell.value = null;
      } else {
        cell.value = n;
        cell.notes = new Set();
        didPlace = true;
      }
    } else {
      cell.value = null;
      if (cell.notes.has(n)) cell.notes.delete(n);
      else cell.notes.add(n);
    }

    const autoClearedPeers: RC[] = [];
    if (didPlace) {
      for (const p of peers(s.row, s.col)) {
        const notes = this.cells[p.row][p.col].notes;
        if (notes.delete(n)) autoClearedPeers.push(p);
      }
      this.lastPlacement = { ...s, placedValue: n, previousNotes, autoClearedPeers };
    } else if (this.mode === 'normal' && this.lastPlacement?.row === s.row && this.lastPlacement?.col === s.col) {
      this.lastPlacement = null;
    }

    const sol = this.puzzle.solution;
    // Counted regardless of the Highlight-mistakes toggle: leaderboard
    // fairness shouldn't depend on whether you wanted live feedback.
    if (didPlace && sol && sol[s.row][s.col] !== n) this.mistakeCount++;

    if (this.mode === 'pencil') {
      this.onSound('erase');
      return;
    }
    if (!didPlace) return;

    if (this.activeNumber === n && this.isComplete(n)) this.activeNumber = null;

    if (this.isSolved) this.onSound('solved');
    else if (this.highlightMistakes && this.hasConflict(s.row, s.col)) this.onSound('mistake');
    else {
      const correct = sol ? sol[s.row][s.col] === n : false;
      // Row/column completion is too subtle to chime on; a finished box or
      // all nine of a digit down is a milestone you can feel.
      this.onSound(correct && (this.isBoxCorrect(s.row, s.col) || this.isComplete(n)) ? 'unitComplete' : 'place');
    }
  }

  private isBoxCorrect(row: number, col: number): boolean {
    const sol = this.puzzle.solution;
    if (!sol) return false;
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) if (this.cells[r][c].value !== sol[r][c]) return false;
    return true;
  }

  clearSelected(): void {
    const s = this.selected;
    if (!s || this.isLocked(s.row, s.col)) return;
    const cell = this.cells[s.row][s.col];
    const hadContent = cell.value !== null || cell.notes.size > 0;
    const last = this.lastPlacement;
    if (last && last.row === s.row && last.col === s.col) {
      // Undo: restore the cell's prior notes and the peer notes we auto-cleared.
      cell.value = null;
      cell.notes = new Set(last.previousNotes);
      for (const p of last.autoClearedPeers) this.cells[p.row][p.col].notes.add(last.placedValue);
      this.lastPlacement = null;
    } else {
      cell.value = null;
      cell.notes = new Set();
    }
    if (hadContent) this.onSound('erase');
  }

  toggleMode(): void {
    this.mode = this.mode === 'normal' ? 'pencil' : 'normal';
  }

  toggleSpeedMode(): void {
    this.speedMode = !this.speedMode;
    this.activeNumber = null;
  }

  // --- Assists ---

  noteHintViewed(): void {
    this.hintsUsed++;
  }

  /** Intersect-with-engine fill: empty cells get candidates, existing marks only lose digits. */
  autoPencil(): boolean {
    let changed = false;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const cell = this.cells[r][c];
        if (cell.value !== null) continue;
        const cands = candidates(r, c, this.cells);
        const next = cell.notes.size === 0 ? cands : new Set([...cell.notes].filter((d) => cands.has(d)));
        if (next.size !== cell.notes.size || [...next].some((d) => !cell.notes.has(d))) {
          cell.notes = next;
          changed = true;
        }
      }
    if (changed) this.pencilAssistsUsed++;
    return changed;
  }

  applyTutorHint(hint: TutorHint): void {
    if (hint.placement) {
      const { row, col, value } = hint.placement;
      this.selected = { row, col };
      const prevMode = this.mode;
      this.mode = 'normal';
      this.enterDirect(value);
      this.mode = prevMode === 'pencil' ? 'normal' : prevMode;
    } else {
      for (const e of hint.eliminations) for (const d of e.candidates) this.cells[e.row][e.col].notes.delete(d);
    }
  }

  reset(): void {
    this.cells = cellsFromGivens(this.puzzle.givens);
    this.selected = null;
    this.mode = 'normal';
    this.speedMode = false;
    this.activeNumber = null;
    this.mistakeCount = 0;
    this.hintsUsed = 0;
    this.pencilAssistsUsed = 0;
    this.highlightMistakesEverOn = this.highlightMistakes;
    this.highlightConstraintsEverOn = this.highlightConstraints;
    this.elapsedSeconds = 0;
    this.lastPlacement = null;
  }
}
