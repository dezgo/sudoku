// Daily-history maths: streaks, perfect months, milestones. A day counts
// when its daily is solved — whenever that happened — so catching up on a
// missed day repairs the streak. That's the point: the catch-up loop is the
// reward for coming back.

import { dailyIdFor, dateFromDailyId } from './format';

/** The first daily the server ever published. Nothing to catch up on before it. */
export const FIRST_DAILY_ID = 20260429;

export const STREAK_MILESTONES = [7, 30, 100, 365];

export function addDays(id: number, n: number): number {
  const d = dateFromDailyId(id);
  d.setDate(d.getDate() + n);
  return dailyIdFor(d);
}

export interface StreakStats {
  current: number;
  best: number;
  total: number;
}

/**
 * `current` counts back from today; if today isn't done yet it counts back
 * from yesterday, so the streak doesn't read 0 every morning.
 */
export function streakStats(done: Set<number>, todayId: number): StreakStats {
  let current = 0;
  let day = done.has(todayId) ? todayId : addDays(todayId, -1);
  while (day >= FIRST_DAILY_ID && done.has(day)) {
    current++;
    day = addDays(day, -1);
  }
  let best = 0;
  let run = 0;
  for (let d = FIRST_DAILY_ID; d <= todayId; d = addDays(d, 1)) {
    run = done.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let total = 0;
  for (const id of done) if (id >= FIRST_DAILY_ID && id <= todayId) total++;
  return { current, best, total };
}

/** Day ids for a month (1-based month), clipped to the playable range. */
export function monthDays(year: number, month: number, todayId: number): number[] {
  const out: number[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const id = year * 10000 + month * 100 + d;
    if (id >= FIRST_DAILY_ID && id <= todayId) out.push(id);
  }
  return out;
}

/**
 * Months where every daily is solved. A month only qualifies once it has
 * ended (or is the launch month and every playable day is done after it
 * ended) — a perfect first week isn't a perfect month.
 */
export function perfectMonths(done: Set<number>, todayId: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Math.floor(FIRST_DAILY_ID / 10000);
  let m = Math.floor(FIRST_DAILY_ID / 100) % 100;
  const ty = Math.floor(todayId / 10000);
  const tm = Math.floor(todayId / 100) % 100;
  while (y < ty || (y === ty && m < tm)) {
    const days = monthDays(y, m, todayId);
    if (days.length && days.every((d) => done.has(d))) out.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** The puzzle's date in Sydney, where the daily rolls over (SPEC §7). */
export function sydneyDayId(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return get('year') * 10000 + get('month') * 100 + get('day');
}

/** True when a daily was solved after its own day had ended — a catch-up. */
export function isCatchUp(puzzleId: number, completedAt: number): boolean {
  return sydneyDayId(completedAt) > puzzleId;
}
