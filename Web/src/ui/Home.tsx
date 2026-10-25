// Home screen (SPEC §13.1).

import { useStore } from '../app/store';
import { dateFromDailyId, displayLabel, formatTime, weekdayDate } from '../lib/format';
import { addDays, FIRST_DAILY_ID, streakStats } from '../lib/streaks';
import { Icon } from './icons';
import { InstallHint } from './InstallHint';

export function Home() {
  const s = useStore();
  const todayId = s.todayId;
  const done = s.resultFor(todayId);
  const inProgress = s.saves[todayId];
  const recent = s.mostRecent;
  const dateLabel = weekdayDate(dateFromDailyId(todayId));
  const name = s.identity?.user.display_name;
  const doneIds = new Set(s.history.map((r) => r.puzzleID));
  const streak = streakStats(doneIds, todayId).current;
  // Missed days in the last 30 — an invitation, not a guilt trip over months.
  let missed = 0;
  for (let d = addDays(todayId, -1), i = 0; i < 30 && d >= FIRST_DAILY_ID; d = addDays(d, -1), i++) if (!doneIds.has(d)) missed++;

  return (
    <div class="home">
      <div class="home-top">
        {s.identity ? (
          <span class="chip">
            <Icon name="person" size={16} /> {name ?? 'Signed in'}
          </span>
        ) : (
          <button class="chip action" onClick={() => s.open({ kind: 'signIn' })}>
            <Icon name="person" size={16} /> Sign in
          </button>
        )}
        <button class="icon-btn" aria-label="Settings" onClick={() => s.open({ kind: 'settings' })}>
          <Icon name="gear" />
        </button>
      </div>

      <InstallHint />

      <h1 class="home-title">Sudoku Crew</h1>

      <div class="home-buttons">
        {done ? (
          <button class="btn" onClick={() => s.open({ kind: 'completed', result: done, fanfare: true })}>
            <Icon name="seal" size={20} /> Daily Done
          </button>
        ) : inProgress ? (
          <button class="btn primary" onClick={() => void s.startDaily()}>
            <Icon name="play" size={18} filled /> Resume Daily
          </button>
        ) : (
          <button class="btn primary" onClick={() => void s.startDaily()}>
            <Icon name="calendar" size={20} /> Daily Puzzle
          </button>
        )}
        <div class="caption">
          {dateLabel}
          {done ? ' · already played' : inProgress ? ` · ${formatTime(inProgress.elapsedSeconds)}` : ''}
        </div>

        {recent && recent.puzzle.id !== todayId && (
          <>
            <button class="btn" onClick={() => s.resume(recent)}>
              <Icon name="play" size={18} filled /> Continue
            </button>
            <div class="caption">
              {displayLabel(recent.puzzle)} · {formatTime(recent.elapsedSeconds)}
            </div>
          </>
        )}

        <button class="btn" onClick={() => s.open({ kind: 'history' })}>
          <Icon name="calendar" size={20} /> Daily History
        </button>
        {streak > 0 && (
          <div class="caption">
            {streak}-day streak{missed > 0 ? ` · ${missed} to catch up` : ''}
          </div>
        )}
        {streak === 0 && missed > 0 && <div class="caption">{missed} past dailies to catch up</div>}

        <button class="btn" onClick={() => s.open({ kind: 'leaderboard', puzzleId: todayId })}>
          <Icon name="podium" size={20} /> Today's Leaderboard
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'multiplayer' })}>
          <Icon name="users" size={20} /> Multiplayer
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'newGame' })}>
          <Icon name="plus" size={20} /> New Game
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'coach' })}>
          <Icon name="cap" size={20} /> Coach
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'games' })}>
          <Icon name="list" size={20} /> Games
        </button>
      </div>

    </div>
  );
}
