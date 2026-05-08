export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  DAILY_TIMEZONE: string;
  // Reviewer bypass: when set, signing in with REVIEWER_EMAIL skips the
  // Resend round-trip (so Play Store / App Store reviewers don't need to
  // be able to read the email inbox), and authVerify accepts the literal
  // REVIEWER_OTP_CODE for that email. The reviewer still gets a normal
  // user account + session — just shortcuts the OTP delivery.
  REVIEWER_EMAIL?: string;
  REVIEWER_OTP_CODE?: string;
  // Per-platform version pins — bump in wrangler.toml on every release.
  // Clients fetch /v1/version on launch and prompt or block accordingly.
  IOS_CURRENT_VERSION?: string;
  IOS_MIN_REQUIRED_VERSION?: string;
  ANDROID_CURRENT_VERSION?: string;
  ANDROID_MIN_REQUIRED_VERSION?: string;
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
