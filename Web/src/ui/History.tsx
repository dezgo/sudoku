// Daily history: a month calendar of every daily since launch — solved,
// started, or missed — with streaks and rewards. Tapping a missed day plays
// it; the solve posts to that day's leaderboard (tagged as a catch-up there)
// and repairs the streak.

import { useMemo, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { isDaily } from '../engine/types';
import { formatTime } from '../lib/format';
import { FIRST_DAILY_ID, monthDays, perfectMonths, STREAK_MILESTONES, streakStats } from '../lib/streaks';
import { Icon } from './icons';
import { Sheet } from './Sheet';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function HistorySheet() {
  const s = useStore();
  const todayId = s.todayId;
  const [ym, setYm] = useState({ y: Math.floor(todayId / 10000), m: Math.floor(todayId / 100) % 100 });

  const results = useMemo(() => new Map(s.history.filter((r) => isDaily({ id: r.puzzleID })).map((r) => [r.puzzleID, r])), [s.history]);
  const done = useMemo(() => new Set(results.keys()), [results]);
  const stats = streakStats(done, todayId);
  const perfect = perfectMonths(done, todayId);

  const days = monthDays(ym.y, ym.m, todayId);
  const playable = new Set(days);
  const doneThisMonth = days.filter((d) => done.has(d)).length;
  const lead = (new Date(ym.y, ym.m - 1, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(ym.y, ym.m, 0).getDate();
  const firstYm = { y: Math.floor(FIRST_DAILY_ID / 10000), m: Math.floor(FIRST_DAILY_ID / 100) % 100 };
  const canBack = ym.y > firstYm.y || (ym.y === firstYm.y && ym.m > firstYm.m);
  const canFwd = ym.y < Math.floor(todayId / 10000) || (ym.y === Math.floor(todayId / 10000) && ym.m < Math.floor(todayId / 100) % 100);
  const step = (n: number) => {
    let m = ym.m + n;
    let y = ym.y;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setYm({ y, m });
  };
  const isPerfect = perfect.some((p) => p.year === ym.y && p.month === ym.m);
  const nextMilestone = STREAK_MILESTONES.find((m) => m > stats.current);
  const earned = STREAK_MILESTONES.filter((m) => m <= stats.best);

  const open = (id: number) => {
    const r = results.get(id);
    if (r?.puzzle) return s.open({ kind: 'completed', result: r, fanfare: false });
    s.closeAll();
    if (id === todayId) void s.startDaily();
    else void s.startPastDaily(id);
  };

  return (
    <Sheet title="Daily history">
      <div class="cal-stats">
        <div class="cal-stat">
          <b>{stats.current}</b>
          <span>day streak</span>
        </div>
        <div class="cal-stat">
          <b>{stats.best}</b>
          <span>best streak</span>
        </div>
        <div class="cal-stat">
          <b>{stats.total}</b>
          <span>dailies done</span>
        </div>
      </div>

      <div class="cal-head">
        <button class="icon-btn" aria-label="Previous month" disabled={!canBack} onClick={() => step(-1)}>
          <Icon name="chevronLeft" />
        </button>
        <h3>
          {monthName(ym.y, ym.m)}
          {isPerfect && (
            <span class="b-purist" title="Perfect month" style={{ marginLeft: 6, verticalAlign: 'middle' }}>
              <Icon name="trophy" size={18} />
            </span>
          )}
        </h3>
        <button class="icon-btn" aria-label="Next month" disabled={!canFwd} onClick={() => step(1)}>
          <Icon name="chevronRight" />
        </button>
      </div>

      <div class="cal-grid">
        {DOW.map((d) => (
          <div key={d} class="cal-dow">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const id = ym.y * 10000 + ym.m * 100 + i + 1;
          const r = results.get(id);
          const cls = ['cal-day'];
          if (!playable.has(id)) cls.push(id > todayId ? 'future' : 'before');
          else if (r) cls.push('done');
          else if (s.saves[id]) cls.push('partial');
          if (id === todayId) cls.push('today');
          return (
            <button
              key={id}
              class={cls.join(' ')}
              disabled={!playable.has(id)}
              aria-label={`${i + 1}${r ? ', solved' : s.saves[id] ? ', started' : playable.has(id) ? ', not played' : ''}`}
              onClick={() => open(id)}
            >
              {i + 1}
              {r && <small>{formatTime(r.elapsedSeconds)}</small>}
            </button>
          );
        })}
      </div>

      <p class="footnote center" style={{ marginTop: 10 }}>
        {days.length ? `${doneThisMonth} of ${days.length} done this month. ` : ''}
        Tap a missed day to play it — catching up fills the gap in your streak.
      </p>

      <div class="section-title">Rewards</div>
      <div class="group">
        <div class="row">
          <span class="b-purist">
            <Icon name="trophy" size={20} />
          </span>
          <div class="grow">
            <div>Perfect months</div>
            <div class="sub">
              {perfect.length
                ? perfect.map((p) => monthName(p.year, p.month)).join(', ')
                : 'Solve every daily in a month to earn one.'}
            </div>
          </div>
          <b>{perfect.length}</b>
        </div>
        <div class="row">
          <span style={{ color: '#ff9500' }}>
            <Icon name="bolt" size={20} filled />
          </span>
          <div class="grow">
            <div>Streak milestones</div>
            <div class="sub">
              {earned.length ? `Reached ${earned.map((m) => `${m} days`).join(', ')}. ` : ''}
              {nextMilestone ? `Next: ${nextMilestone} days in a row (${nextMilestone - stats.current} to go).` : 'All milestones reached!'}
            </div>
          </div>
          <b>
            {earned.length}/{STREAK_MILESTONES.length}
          </b>
        </div>
      </div>
      {!s.identity && (
        <p class="footnote center">Sign in to bring in dailies you solved on other devices.</p>
      )}
    </Sheet>
  );
}
