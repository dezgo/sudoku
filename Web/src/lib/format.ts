import { difficultyLabel, isDaily, type Puzzle } from '../engine/types';

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** YYYYMMDD for a date in the device's local time. */
export function dailyIdFor(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function localDailyId(): number {
  return dailyIdFor(new Date());
}

export function dateFromDailyId(id: number): Date {
  return new Date(Math.floor(id / 10000), (Math.floor(id / 100) % 100) - 1, id % 100);
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function weekdayDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Daily · Apr 29" for dailies, the bare difficulty for generated puzzles. */
export function displayLabel(p: Pick<Puzzle, 'id' | 'difficulty'>): string {
  if (isDaily(p)) return `Daily · ${shortDate(dateFromDailyId(p.id))}`;
  return difficultyLabel[p.difficulty];
}
