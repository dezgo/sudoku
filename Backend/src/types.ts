export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  DAILY_TIMEZONE: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface User {
  id: string;
  display_name: string | null;
}

export interface Group {
  id: string;
  name: string;
}

export interface PuzzleResponse {
  puzzle_id: number;
  date: string;
  difficulty: Difficulty;
  givens: number[][];
  solution: number[][];
}

export type Grid = number[][];
