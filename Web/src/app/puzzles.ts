// Puzzle supply for New Game. Generation runs in a Web Worker (it can take a
// couple of seconds on a phone — up to 25 generate-and-classify attempts),
// and one ready puzzle per tier is kept in localStorage so New Game is
// usually instant, even on the first tap after launch.

import type { Difficulty, Puzzle } from '../engine/types';
import { DIFFICULTIES } from '../engine/types';
import { readJSON, writeJSON } from '../lib/storage';

const BUFFER_KEY = 'sudoku.puzzle_buffer.v1';

type Buffer = Partial<Record<Difficulty, Omit<Puzzle, 'id'>>>;

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (p: Omit<Puzzle, 'id'>) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ seq: number; puzzle: Omit<Puzzle, 'id'> }>) => {
    waiting.get(e.data.seq)?.(e.data.puzzle);
    waiting.delete(e.data.seq);
  };
  return worker;
}

function generate(difficulty: Difficulty): Promise<Omit<Puzzle, 'id'>> {
  const n = ++seq;
  return new Promise((resolve) => {
    waiting.set(n, resolve);
    getWorker().postMessage({ seq: n, difficulty });
  });
}

const refilling = new Set<Difficulty>();

async function refill(difficulty: Difficulty): Promise<void> {
  if (refilling.has(difficulty)) return;
  if (readJSON<Buffer>(BUFFER_KEY, {})[difficulty]) return;
  refilling.add(difficulty);
  try {
    const p = await generate(difficulty);
    writeJSON(BUFFER_KEY, { ...readJSON<Buffer>(BUFFER_KEY, {}), [difficulty]: p });
  } finally {
    refilling.delete(difficulty);
  }
}

/** Pop the buffered puzzle for this tier (or generate one now), then top the buffer up. */
export async function requestPuzzle(difficulty: Difficulty, id: number): Promise<Puzzle> {
  const buf = readJSON<Buffer>(BUFFER_KEY, {});
  const ready = buf[difficulty];
  let p: Omit<Puzzle, 'id'>;
  if (ready) {
    delete buf[difficulty];
    writeJSON(BUFFER_KEY, buf);
    p = ready;
  } else {
    p = await generate(difficulty);
  }
  void refill(difficulty);
  return { ...p, id };
}

/** Warm every tier in the background shortly after launch. */
export function warmBuffers(): void {
  setTimeout(() => DIFFICULTIES.forEach((d) => void refill(d)), 1500);
}
