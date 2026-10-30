import { describe, it, expect } from 'vitest';
import { countSolutions, generatePuzzle } from './generator';
import { grade } from './tutor';
import { cellsFromGivens } from './types';

describe('generatePuzzle', () => {
  it('Expert needs a hard technique at least three times, and has one solution', () => {
    for (let i = 0; i < 3; i++) {
      const p = generatePuzzle('expert', 0);
      const g = grade(cellsFromGivens(p.givens));
      expect(g?.tier).toBe('hard');
      expect(g!.hardSteps).toBeGreaterThanOrEqual(3);
      expect(countSolutions(p.givens.map((r) => [...r]), 2)).toBe(1);
    }
  }, 30_000);
});
