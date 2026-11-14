// Every technique must only ever rule out wrong digits. Runs each finder on
// real generated puzzles (full pencil marks, advanced by the normal hint
// sequence) and checks its eliminations against the known solution.
import { describe, it, expect } from 'vitest';
import * as T from './tutor';
import { generateSolution, makePuzzle } from './generator';
import { candidates, cellsFromGivens, type Cells } from './types';

const FINDERS = Object.entries(T).filter(
  ([k, v]) => k.startsWith('find') && k !== 'findHint' && typeof v === 'function',
) as [string, (c: Cells) => T.TutorHint | null][];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('tutor soundness', () => {
  it('no technique ever eliminates the true digit', () => {
    const bad: string[] = [];
    const seen = new Set<string>();
    for (let n = 0; n < 80; n++) {
      const r = rng(n + 1);
      const solution = generateSolution(r);
      const cells = cellsFromGivens(makePuzzle(solution, 24, r));
      for (let rr = 0; rr < 9; rr++)
        for (let c = 0; c < 9; c++) if (cells[rr][c].value === null) cells[rr][c].notes = candidates(rr, c, cells);
      for (let step = 0; step < 200; step++) {
        for (const [name, f] of FINDERS) {
          const h = f(cells);
          if (!h) continue;
          seen.add(name);
          if (h.placement && solution[h.placement.row][h.placement.col] !== h.placement.value) bad.push(`${name} placement`);
          for (const e of h.eliminations)
            if (e.candidates.has(solution[e.row][e.col])) bad.push(`${name} r${e.row + 1}c${e.col + 1} removed ${solution[e.row][e.col]}`);
        }
        // Advance: place one correct digit (keeps the board honest), then
        // apply a sound hint's eliminations so later patterns appear.
        const empty: [number, number][] = [];
        for (let rr = 0; rr < 9; rr++) for (let c = 0; c < 9; c++) if (cells[rr][c].value === null) empty.push([rr, c]);
        if (!empty.length) break;
        const h = T.findHint(cells);
        if (h && !h.placement && h.eliminations.every((e) => !e.candidates.has(solution[e.row][e.col])))
          for (const e of h.eliminations) for (const d of e.candidates) cells[e.row][e.col].notes.delete(d);
        else {
          const [pr, pc] = empty[Math.floor(r() * empty.length)];
          const v = solution[pr][pc];
          cells[pr][pc].value = v;
          cells[pr][pc].notes = new Set();
          for (let i = 0; i < 9; i++) {
            cells[pr][i].notes.delete(v);
            cells[i][pc].notes.delete(v);
            cells[Math.floor(pr / 3) * 3 + Math.floor(i / 3)][Math.floor(pc / 3) * 3 + (i % 3)].notes.delete(v);
          }
        }
      }
    }
    console.log('techniques exercised:', [...seen].sort().join(' '));
    expect([...new Set(bad.map((b) => b.split(' ')[0]))], [...new Map(bad.map((b) => [b.split(' ')[0], b])).values()].join('\n')).toEqual([]);
  }, 120000);
});
