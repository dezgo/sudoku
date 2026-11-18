// Home screen (SPEC §13.1).

import { useStore } from '../app/store';
import { dateFromDailyId, displayLabel, formatTime, weekdayDate } from '../lib/format';
import { addDays, FIRST_DAILY_ID, streakStats } from '../lib/streaks';
import { Icon } from './icons';
import { InstallHint } from './InstallHint';
import { CrewCard, inviteFriend, PulseLine } from './Crew';

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
      <PulseLine />

      <div class="home-buttons">
        {/* Daily not done: it leads. Done: what the crew's playing leads, and the
            daily shrinks to one line under it. */}
        {!done && (
          <>
            <button class="btn primary" onClick={() => void s.startDaily()}>
              {inProgress ? <Icon name="play" size={18} filled /> : <Icon name="calendar" size={20} />}
              {inProgress ? ' Resume Daily' : ' Daily Puzzle'}
            </button>
            <div class="caption">
              {dateLabel}
              {inProgress ? ` · ${formatTime(inProgress.elapsedSeconds)}` : ''}
              {streak > 0 && ` · ${streak}-day streak`}
              {' · '}
              <button class="link inline-caption" onClick={() => s.open({ kind: 'history' })}>
                {missed > 0 ? `${missed} to catch up` : 'History'} ›
              </button>
            </div>
          </>
        )}

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

        <CrewCard />

        {done && (
          <div class="daily-done-line">
            <button class="link inline-caption" onClick={() => s.open({ kind: 'completed', result: done, fanfare: true })}>
              <Icon name="seal" size={16} /> Today’s daily done
            </button>
            {streak > 0 && <span> · {streak}-day streak</span>}
            {' · '}
            <button class="link inline-caption" onClick={() => s.open({ kind: 'history' })}>
              {missed > 0 ? `${missed} to catch up` : 'History'} ›
            </button>
          </div>
        )}

        <button class="btn" onClick={() => s.open({ kind: 'multiplayer' })}>
          <Icon name="users" size={20} /> Multiplayer
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'newGame' })}>
          <Icon name="plus" size={20} /> New Game
        </button>
        <button class="btn" onClick={() => s.open({ kind: 'coach' })}>
          <Icon name="cap" size={20} /> Coach
        </button>
      </div>

      <button class="link quiet-link" onClick={() => inviteFriend()}>
        <Icon name="share" size={15} /> Share Sudoku Crew with a friend
      </button>
      <button class="link quiet-link" style={{ marginTop: 0 }} onClick={() => s.open({ kind: 'feedback' })}>
        <Icon name="chat" size={15} /> Ideas or problems? Tell us
      </button>
      <button class="link quiet-link" style={{ marginTop: 0 }} onClick={() => s.open({ kind: 'whatsNew' })}>
        <Icon name="seal" size={15} /> What’s new
      </button>
    </div>
  );
}
