import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { countSolutions, generatePuzzle } from './generator';
import { classify } from './tutor';
import { cellsFromGivens, type Puzzle } from './types';

const SOLUTION = [
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
const GIVENS = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];
const puzzle: Puzzle = { id: 1000, difficulty: 'medium', givens: GIVENS, solution: SOLUTION };
const newGame = () => new Game(puzzle, { highlightMistakes: true, highlightConstraints: true });

/** Seeded RNG so generator tests are repeatable. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('generator', () => {
  it('produces a unique-solution puzzle on the requested tier', () => {
    for (const d of ['easy', 'medium'] as const) {
      const p = generatePuzzle(d, 1, rng(42));
      expect(countSolutions(p.givens)).toBe(1);
      expect(classify(cellsFromGivens(p.givens))).toBe(d === 'easy' ? 'simple' : 'medium');
      // Every given agrees with the solution.
      p.givens.forEach((row, r) => row.forEach((v, c) => v && expect(v).toBe(p.solution![r][c])));
    }
  });
});

describe('game input', () => {
  it('places, counts mistakes, and undoes with peer notes restored', () => {
    const g = newGame();
    g.cells[0][3].notes = new Set([2, 6]);
    g.select(0, 2);
    g.pressNumber(6); // wrong: solution is 4
    expect(g.mistakeCount).toBe(1);
    expect(g.cells[0][3].notes.has(6)).toBe(false);
    expect(g.eraseLabel).toBe('Undo');
    g.clearSelected();
    expect(g.cells[0][2].value).toBeNull();
    expect(g.cells[0][3].notes.has(6)).toBe(true);
  });

  it('locks correct placements when mistakes are highlighted', () => {
    const g = newGame();
    g.select(0, 2);
    g.pressNumber(4);
    expect(g.isLocked(0, 2)).toBe(true);
    g.clearSelected();
    expect(g.cells[0][2].value).toBe(4);
  });

  it('jumps to the first matching cell when nothing empty is selected', () => {
    const g = newGame();
    g.pressNumber(9);
    expect(g.selected).toEqual({ row: 1, col: 4 });
  });

  it('detects the solve', () => {
    const g = newGame();
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (GIVENS[r][c]) continue;
        g.select(r, c);
        g.pressNumber(SOLUTION[r][c]);
      }
    expect(g.isSolved).toBe(true);
    expect(g.mistakeCount).toBe(0);
  });
});

describe('speed mode', () => {
  it('arms a digit from the pad and places it on each empty tap', () => {
    const g = newGame();
    g.toggleSpeedMode();
    g.pressNumber(4);
    expect(g.activeNumber).toBe(4);
    expect(g.selected).toBeNull(); // arming doesn't move the selection
    g.tapCell(0, 2);
    g.tapCell(1, 7);
    expect(g.cells[0][2].value).toBe(4);
    expect(g.cells[1][7].value).toBe(4);
    expect(g.activeNumber).toBe(4);
  });

  it('can arm a digit that is not yet on the board', () => {
    const g = new Game(
      { ...puzzle, givens: GIVENS.map((row) => row.map((v) => (v === 4 ? 0 : v))) },
      { highlightMistakes: true, highlightConstraints: true },
    );
    g.toggleSpeedMode();
    g.pressNumber(4);
    expect(g.activeNumber).toBe(4);
  });

  it('tapping a filled cell clears the selection without re-arming', () => {
    const g = newGame();
    g.toggleSpeedMode();
    g.pressNumber(4);
    g.tapCell(0, 2);
    g.tapCell(0, 0); // holds 5
    expect(g.selected).toBeNull();
    expect(g.activeNumber).toBe(4);
  });

  it('arrow keys move without placing', () => {
    const g = newGame();
    g.toggleSpeedMode();
    g.pressNumber(4);
    g.select(0, 1);
    g.moveSelection(0, 1); // onto empty (0,2)
    expect(g.cells[0][2].value).toBeNull();
  });

  it('pencil + speed toggles notes', () => {
    const g = newGame();
    g.toggleSpeedMode();
    g.toggleMode();
    g.pressNumber(2);
    g.tapCell(0, 2);
    expect(g.cells[0][2].notes.has(2)).toBe(true);
    expect(g.cells[0][2].value).toBeNull();
    g.tapCell(0, 2);
    expect(g.cells[0][2].notes.has(2)).toBe(false);
  });

  it('pressing the armed digit again disarms; a finished digit disarms itself', () => {
    const g = newGame();
    g.toggleSpeedMode();
    g.pressNumber(4);
    g.pressNumber(4);
    expect(g.activeNumber).toBeNull();
    // Finish every 4.
    g.pressNumber(4);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!GIVENS[r][c] && SOLUTION[r][c] === 4) g.tapCell(r, c);
    expect(g.isComplete(4)).toBe(true);
    expect(g.activeNumber).toBeNull();
  });

  it('refuses a tenth copy of a finished digit', () => {
    const g = newGame();
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!GIVENS[r][c] && SOLUTION[r][c] === 4) {
          g.select(r, c);
          g.pressNumber(4);
        }
    g.select(0, 2 === 2 ? 3 : 0); // an empty non-4 cell
    const before = g.mistakeCount;
    g.pressNumber(4);
    expect(g.cells[0][3].value).toBeNull();
    expect(g.mistakeCount).toBe(before);
  });
});

describe('speed mode — no stale selection', () => {
  it('arming never places into a previously selected cell', () => {
    const g = newGame();
    g.select(0, 2); // empty
    g.toggleSpeedMode();
    g.pressNumber(4);
    expect(g.cells[0][2].value).toBeNull();
    expect(g.selected).toBeNull();
  });
});
