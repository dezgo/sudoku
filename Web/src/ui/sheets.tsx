// Small single-player sheets: New Game, Games, Completed board, Solved
// fanfare, Reset confirmation (SPEC §13.3–§13.8).

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { cellsFromGivens, difficultyLabel, DIFFICULTIES, isDaily, type Difficulty, type Puzzle } from '../engine/types';
import { dateTime, displayLabel, formatTime } from '../lib/format';
import { playSound } from '../lib/sound';
import type { PuzzleResult } from '../lib/storage';
import { Board } from './Board';
import { Icon } from './icons';
import { Segmented, Sheet, shareText } from './Sheet';
import { ApiError, api } from '../lib/api';

export function NewGameSheet() {
  const s = useStore();
  const [d, setD] = useState<Difficulty>(s.prefs.difficulty);
  return (
    <Sheet title="New Game" left={<button class="link" onClick={() => s.close()}>Cancel</button>} right={<span />}>
      <div class="stack" style={{ paddingTop: 8 }}>
        <Segmented options={DIFFICULTIES.map((v) => ({ value: v, label: difficultyLabel[v] }))} value={d} onChange={setD} />
        <button
          class="btn primary"
          onClick={() => {
            s.close();
            void s.newGame(d);
          }}
        >
          Start
        </button>
      </div>
    </Sheet>
  );
}

function rowLabel(p: Pick<Puzzle, 'id' | 'difficulty'>): string {
  return isDaily(p) ? displayLabel(p) : `${difficultyLabel[p.difficulty]} puzzle`;
}

export function GamesSheet() {
  const s = useStore();
  const [confirm, setConfirm] = useState(false);
  const saves = s.inProgress;
  const results = s.history;
  return (
    <Sheet
      title="Games"
      left={
        results.length > 0 ? (
          <button class="link danger" style={{ color: 'var(--error)' }} onClick={() => setConfirm(true)}>
            Clear
          </button>
        ) : undefined
      }
    >
      {confirm && (
        <div class="group" style={{ padding: 14, marginBottom: 12 }}>
          <b>Clear completed history?</b>
          <p class="muted small">In-progress games are kept.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button class="btn compact" style={{ flex: 1 }} onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              class="btn compact danger"
              style={{ flex: 1 }}
              onClick={() => {
                s.clearHistory();
                setConfirm(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {!saves.length && !results.length && <p class="empty">No games yet — start a puzzle to see it here.</p>}
      {saves.length > 0 && (
        <>
          <div class="section-title">In Progress</div>
          <div class="group">
            {saves.map((sv) => (
              <button
                key={sv.puzzle.id}
                class="row"
                onClick={() => {
                  s.close();
                  s.resume(sv);
                }}
              >
                <div class="grow">
                  <div>{rowLabel(sv.puzzle)}</div>
                  <div class="sub">{dateTime(sv.lastPlayedAt)}</div>
                </div>
                <span class="muted">{formatTime(sv.elapsedSeconds)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {results.length > 0 && (
        <>
          <div class="section-title">Completed</div>
          <div class="group">
            {results.map((r) => (
              <button
                key={r.puzzleID}
                class="row"
                disabled={!r.puzzle}
                onClick={() => s.open({ kind: 'completed', result: r, fanfare: false })}
              >
                <div class="grow">
                  <div>{r.puzzle ? rowLabel(r.puzzle) : `Puzzle #${r.puzzleID}`}</div>
                  <div class="sub">{dateTime(r.completedAt)}</div>
                </div>
                <span class="muted">{formatTime(r.elapsedSeconds)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.2 + Math.random() * 1.8,
        color: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#2f6fde', '#af52de'][i % 6],
        rot: Math.random() * 360,
      })),
    [],
  );
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function Fanfare({ small = false }: { small?: boolean }) {
  const side = small ? 40 : 48;
  const mid = small ? 64 : 80;
  return (
    <>
      <Confetti />
      <div class="flourish">
        <span class="side l">
          <Icon name="party" size={side} />
        </span>
        <span class="mid">
          <Icon name="seal" size={mid} />
        </span>
        <span class="side r">
          <Icon name="party" size={side} />
        </span>
      </div>
      <div class="solved-title" style={small ? { fontSize: '2.3rem' } : undefined}>
        Solved!
      </div>
    </>
  );
}

export function SolvedSheet({ rank, wasRanked }: { rank: number | null; wasRanked: boolean }) {
  const s = useStore();
  const g = s.game!;
  const signedIn = !!s.identity;
  const done = () => {
    s.closeAll();
    s.goHome();
  };
  return (
    <Sheet onClose={done}>
      <div class="fanfare">
        <Fanfare />
        <div class="muted">
          {displayLabel(g.puzzle)} · {difficultyLabel[g.puzzle.difficulty]}
        </div>
        <div class="stats-line">
          <span class="stat">
            <Icon name="clock" size={17} /> {formatTime(g.elapsedSeconds)}
          </span>
          <span class={`stat${g.mistakeCount ? ' bad' : ''}`}>
            <Icon name="alert" size={17} /> {g.mistakeCount}
          </span>
        </div>
        {rank !== null && <div style={{ fontWeight: 700, margin: '6px 0' }}>Rank #{rank}</div>}
      </div>
      <div class="stack">
        {wasRanked && signedIn && s.groups.length > 0 && (
          <button class="btn" onClick={() => s.open({ kind: 'leaderboard', puzzleId: g.puzzle.id })}>
            <Icon name="podium" size={20} /> View leaderboard
          </button>
        )}
        {wasRanked && !signedIn && (
          <button class="btn" onClick={() => s.open({ kind: 'signIn' })}>
            <Icon name="person" size={20} /> Sign in to put this on the board
          </button>
        )}
        {!isDaily(g.puzzle) && (
          <button class="btn" onClick={() => s.open({ kind: 'share', puzzle: g.puzzle, seconds: g.elapsedSeconds })}>
            <Icon name="share" size={20} /> Share this puzzle
          </button>
        )}
        <button class="btn primary" onClick={done}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

export function CompletedSheet({ result, fanfare }: { result: PuzzleResult; fanfare: boolean }) {
  const s = useStore();
  const p = result.puzzle!;
  useEffect(() => {
    if (fanfare && s.prefs.sound) playSound('solved');
  }, []);
  const cells = useMemo(() => {
    const c = cellsFromGivens(p.givens);
    if (p.solution) for (let r = 0; r < 9; r++) for (let k = 0; k < 9; k++) c[r][k].value = p.solution[r][k];
    return c;
  }, [p]);
  return (
    <Sheet title={displayLabel(p)}>
      <div class="fanfare">
        {fanfare && <Fanfare small />}
        <div class="muted small">
          {dateTime(result.completedAt)} · {formatTime(result.elapsedSeconds)}
        </div>
      </div>
      <Board mini cells={cells} look={(r, c) => ({ locked: p.givens[r][c] !== 0 })} />
      {isDaily(p) && (
        <button class="btn" onClick={() => s.open({ kind: 'leaderboard', puzzleId: p.id })}>
          <Icon name="podium" size={20} /> Leaderboard for this day
        </button>
      )}
      {!isDaily(p) && (
        <button class="btn" onClick={() => s.open({ kind: 'share', puzzle: p, seconds: result.elapsedSeconds })}>
          <Icon name="share" size={20} /> Share this puzzle
        </button>
      )}
    </Sheet>
  );
}

/**
 * Share a puzzle's starting position under a three-word name. Two steps on
 * purpose: the name comes from the server first, and only the "Send link"
 * tap opens the share menu — iPhones refuse a share menu that opens after
 * waiting on the network rather than straight from a tap.
 */
export function ShareSheet({ puzzle, seconds }: { puzzle: Puzzle; seconds?: number }) {
  const s = useStore();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = s.token;
  useEffect(() => {
    if (!token) return;
    setError(null);
    api
      .shareCreate(token, puzzle.givens, puzzle.difficulty, seconds)
      .then(setName)
      .catch((e) =>
        setError(e instanceof ApiError && e.kind === 'offline' ? "You're offline. Try again when you're connected." : "Couldn't share this puzzle. Try again."),
      );
  }, [token]);
  const label = difficultyLabel[puzzle.difficulty];
  const url = name ? `${location.origin}/p/${name}` : '';
  const message = seconds
    ? `Try this ${label} sudoku. I did it in ${formatTime(seconds)}!`
    : `Try this ${label} sudoku!`;
  return (
    <Sheet title="Share puzzle">
      <div class="stack" style={{ paddingTop: 6 }}>
        <p class="muted" style={{ margin: 0 }}>
          Your friend gets the same starting board, with nothing filled in{seconds ? ', and sees your time to beat' : ''}.
        </p>
        {!token ? (
          <button class="btn primary" onClick={() => s.open({ kind: 'signIn' })}>
            <Icon name="person" size={20} /> Sign in to share
          </button>
        ) : error ? (
          <div class="error">{error}</div>
        ) : !name ? (
          <div class="muted" style={{ textAlign: 'center', padding: '12px 0' }}>
            Getting a link…
          </div>
        ) : (
          <>
            <div class="share-name">{name.split('-').join(' · ')}</div>
            <div class="muted small" style={{ textAlign: 'center', marginTop: -6 }}>
              {location.host}/p/{name}
            </div>
            <button class="btn primary" onClick={() => void shareText(message, url)}>
              <Icon name="share" size={20} /> Send link
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function ConfirmResetSheet() {
  const s = useStore();
  return (
    <Sheet title="Reset puzzle?" right={<span />}>
      <div class="stack">
        <p class="muted center" style={{ margin: 0 }}>
          This will clear your progress on this puzzle.
        </p>
        <button
          class="btn danger"
          onClick={() => {
            s.close();
            s.confirmReset();
          }}
        >
          Reset
        </button>
        <button class="btn" onClick={() => s.close()}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
