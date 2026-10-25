import { describe, expect, it } from 'vitest';
import { addDays, isCatchUp, perfectMonths, streakStats } from './streaks';

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe('streaks', () => {
  it('counts back from today, or from yesterday when today is not done', () => {
    const done = new Set(range(20261020, 5)); // 20–24 Oct
    expect(streakStats(done, 20261024).current).toBe(5);
    expect(streakStats(done, 20261025).current).toBe(5); // today not done yet
    expect(streakStats(done, 20261026).current).toBe(0); // missed yesterday
  });

  it('a caught-up day repairs the streak', () => {
    const done = new Set([...range(20261015, 5), ...range(20261021, 4)]); // gap on 20 Oct
    expect(streakStats(done, 20261024).current).toBe(4);
    done.add(20261020);
    expect(streakStats(done, 20261024).current).toBe(10);
    expect(streakStats(done, 20261024).best).toBe(10);
  });

  it('crosses month boundaries', () => {
    expect(addDays(20261031, 1)).toBe(20261101);
    expect(addDays(20270101, -1)).toBe(20261231);
  });

  it('awards a perfect month only once it has ended', () => {
    const may = new Set(range(20260501, 31));
    expect(perfectMonths(may, 20260531)).toEqual([]);
    expect(perfectMonths(may, 20260601)).toEqual([{ year: 2026, month: 5 }]);
  });

  it('flags a solve made after its Sydney day as a catch-up', () => {
    // 2026-10-25 23:00 Sydney (AEDT, UTC+11) = 12:00 UTC
    expect(isCatchUp(20261025, Date.UTC(2026, 9, 25, 12))).toBe(false);
    expect(isCatchUp(20261025, Date.UTC(2026, 9, 25, 14))).toBe(true); // 01:00 on the 26th
  });
});
