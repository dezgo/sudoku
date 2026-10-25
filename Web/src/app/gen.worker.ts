// Web Worker: runs the CPU-heavy generator off the main thread.
import { generatePuzzle } from '../engine/generator';
import type { Difficulty } from '../engine/types';

self.onmessage = (e: MessageEvent<{ seq: number; difficulty: Difficulty }>) => {
  const { id: _id, ...puzzle } = generatePuzzle(e.data.difficulty, 0);
  self.postMessage({ seq: e.data.seq, puzzle });
};
