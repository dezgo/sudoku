// The Playing screen (SPEC §13.2): header, board, number pad, controls,
// plus the tutor panel and the auto-pencil cancel banner.

import { useEffect } from 'preact/hooks';
import { store, useStore } from '../app/store';
import { techniqueLabel } from '../engine/tutor';
import { dateFromDailyId, displayLabel, formatTime, shortDate } from '../lib/format';
import { isDaily } from '../engine/types';
import { Board } from './Board';
import { CoopStrip, inviteToCoop } from './Coop';
import { Lifelines } from './Lifelines';
import { Icon } from './icons';

export function Play() {
  const s = useStore();
  const g = s.game!;
  const paused = s.paused;
  const solved = g.isSolved;
  const armed = g.speedMode && g.activeNumber !== null;
  const tutorHighlights = s.tutor?.hint ? s.tutor.hint.steps[s.tutor.step].highlights : null;
  const coop = s.coop;
  // Co-op: numbers another player placed, and squares they're looking at.
  const partnerAt = (i: number) => !!coop && coop.by[i] !== null && coop.by[i] !== coop.me;
  const partnerSel = (i: number) =>
    !!coop && Object.entries(coop.sels).some(([id, at]) => id !== coop.me && at === i && coop.online.includes(id));

  useKeyboard();

  return (
    <div class="play">
      <div class="play-header">
        <div class="play-title">
          {isDaily(g.puzzle) ? (
            // "Daily · 21 Oct" didn't fit beside the timer and four buttons
            // on a phone; the icon says "daily" in a fraction of the width.
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} aria-label={displayLabel(g.puzzle)}>
              <Icon name="calendar" size={18} />
              {shortDate(dateFromDailyId(g.puzzle.id))}
            </span>
          ) : (
            <span>{displayLabel(g.puzzle)}</span>
          )}
          {s.offlineDaily && <span class="badge-offline">Unranked</span>}
          {solved && (
            <span style={{ color: 'var(--success)' }}>
              <Icon name="seal" size={20} />
            </span>
          )}
        </div>
        <div class="spacer" />
        {g.highlightMistakes && (
          <span class={`stat${g.mistakeCount > 0 ? ' bad' : ''}`} aria-label="Mistakes">
            <Icon name="alert" size={17} />
            {g.mistakeCount}
          </span>
        )}
        <span class="stat" aria-label="Time">
          <Icon name="clock" size={17} />
          {formatTime(g.elapsedSeconds)}
        </span>
        <button
          class="icon-btn"
          aria-label="Auto-pencil"
          title="Fill pencil marks"
          disabled={paused || solved || s.autoPencilPending}
          onClick={() => s.tapAutoPencil()}
        >
          <Icon name="wand" size={20} />
        </button>
        <button
          class="icon-btn bulb"
          aria-label="Hint"
          title="Tutor"
          disabled={paused || solved}
          onClick={() => s.openTutor()}
        >
          <Icon name="bulb" size={21} filled />
        </button>
        {!coop && (
          // Co-op can't pause: the clock is shared.
          <button class="icon-btn" aria-label={paused ? 'Resume' : 'Pause'} disabled={solved} onClick={() => s.togglePause()}>
            <Icon name={paused ? 'play' : 'pause'} size={19} filled />
          </button>
        )}
        <button class="icon-btn" aria-label="Settings" onClick={() => s.open({ kind: 'settings' })}>
          <Icon name="gear" size={20} />
        </button>
      </div>

      {coop && <CoopStrip />}
      <Lifelines used={s.lifelines} />

      <Board
        cells={g.cells}
        tutor={tutorHighlights}
        paused={paused}
        onResume={() => s.togglePause()}
        onTap={(r, c) => s.act((game) => game.tapCell(r, c))}
        look={(r, c) => ({
          // With a speed digit armed the selection is just "what Undo would
          // clear", so it's drawn as a faint outline, not the yellow fill.
          sel: g.isSelected(r, c) && !armed,
          ghost: g.isSelected(r, c) && armed,
          match: g.isMatching(r, c),
          // With a digit armed, the tint must mean only "this digit can't go
          // here" — the hint promises dark squares are where it can still go.
          // The selection's row/col/box tint looks identical and hid a legal
          // square, which led Derek to a wrong 7 (25 Oct 2026).
          peer: (!armed && g.isPeerOfSelection(r, c)) || g.isUnavailableForFocus(r, c),
          err: g.highlightMistakes && g.hasConflict(r, c),
          locked: g.isLocked(r, c),
          partner: !g.cells[r][c].isFixed && g.cells[r][c].value !== null && partnerAt(r * 9 + c),
          partnerSel: partnerSel(r * 9 + c),
        })}
      />

      <NumberPad />

      <div class="play-controls">
        <button class="btn primary" onClick={() => s.goHome()}>
          <Icon name="home" size={20} /> Home
        </button>
        {coop ? (
          <button class="btn" onClick={() => inviteToCoop(coop.name, g.puzzle.difficulty)}>
            <Icon name="share" size={20} /> Invite
          </button>
        ) : (
          <>
            {!isDaily(g.puzzle) && (
              <button class="btn" onClick={() => s.open({ kind: 'share', puzzle: g.puzzle })}>
                <Icon name="share" size={20} /> Share
              </button>
            )}
            <button class="btn" onClick={() => s.open({ kind: 'confirmReset' })}>
              Reset
            </button>
          </>
        )}
      </div>

      {s.autoPencilPending && (
        <div class="banner" role="status">
          <span class="bulb">
            <Icon name="wand" size={18} />
          </span>
          <span>Auto-pencilling…</span>
          <button class="btn compact" onClick={() => s.cancelAutoPencil()}>
            Cancel
          </button>
        </div>
      )}

      {s.tutor && <TutorPanel />}
    </div>
  );
}

function NumberPad() {
  const s = useStore();
  const g = s.game!;
  const gated = s.paused || g.isSolved;
  const selValue = g.selected ? g.cells[g.selected.row][g.selected.col].value : null;
  const erase = g.eraseLabel;
  return (
    <div class="pad">
      <div class="pad-digits">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const done = g.isComplete(n);
          const armed = g.speedMode && g.activeNumber === n;
          const on = !g.speedMode && selValue === n;
          return (
            <button
              key={n}
              class={`pad-digit${armed ? ' armed' : on ? ' on' : ''}${done ? ' done' : ''}`}
              disabled={gated || done}
              aria-pressed={armed}
              onPointerDown={(e) => {
                e.preventDefault();
                s.act((game) => game.pressNumber(n));
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div class="pad-tools">
        <button
          class={`tool${g.mode === 'pencil' ? ' on' : ''}`}
          disabled={gated}
          aria-pressed={g.mode === 'pencil'}
          onClick={() => s.act((game) => game.toggleMode())}
        >
          <Icon name="pencil" size={17} /> Pencil
        </button>
        <button
          class={`tool${g.speedMode ? ' on' : ''}`}
          disabled={gated}
          aria-pressed={g.speedMode}
          onClick={() => s.act((game) => game.toggleSpeedMode())}
        >
          <Icon name="bolt" size={17} filled={g.speedMode} /> Speed
        </button>
        <button class="tool" disabled={gated || !g.canEraseSelected} onClick={() => s.act((game) => game.clearSelected())}>
          <Icon name={erase === 'Undo' ? 'undo' : 'erase'} size={17} /> {erase}
        </button>
      </div>
      <p class="speed-hint">
        {g.speedMode
          ? g.activeNumber === null
            ? 'Speed: pick a number, then tap squares to fill them.'
            : `Tap empty squares to place ${g.activeNumber}${g.mode === 'pencil' ? ' as a note' : ''}.${
                g.highlightConstraints ? ` Dark squares are where ${g.activeNumber} can still go.` : ''
              }`
          : ''}
      </p>
    </div>
  );
}

function TutorPanel() {
  const s = useStore();
  const t = s.tutor!;
  const g = s.game!;
  const hint = t.hint;
  if (!hint) {
    const pencilled = g.hasAnyPencilMarks;
    return (
      <div class="scrim clear">
        <div class="sheet short" role="dialog" aria-label="Tutor">
          <div class="sheet-body" style={{ paddingTop: 16 }}>
            <div class="tutor-head">{pencilled ? 'Stuck on this one' : 'No simple move spotted'}</div>
            <p class="tutor-narr">
              {pencilled
                ? 'I checked everything I know — singles, pairs/triples/quads (naked + hidden), pointing pair, box-line, X-wing (incl. finned), XY-wing, XYZ-wing, W-wing, swordfish (incl. finned), jellyfish, skyscraper, 2-string kite, empty rectangle. Nothing fits. This board likely needs chain reasoning (forcing chains, simple coloring) or some plain old guess-and-check.'
                : 'Tap the wand to auto-fill pencil marks first — the pair and pointing techniques need them to work.'}
            </p>
            <button class="btn primary" onClick={() => s.closeTutor()}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }
  const last = t.step === hint.steps.length - 1;
  return (
    <div class="scrim clear">
      <div class="sheet short" role="dialog" aria-label="Tutor">
        <div class="sheet-head">
          <span class="left" />
          <h2>
            {techniqueLabel(hint.technique)} · Step {t.step + 1} of {hint.steps.length}
          </h2>
          <button class="icon-btn right" aria-label="Close" onClick={() => s.closeTutor()}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div class="sheet-body">
          <p class="tutor-narr" aria-live="polite">
            {hint.steps[t.step].narration}
          </p>
          <div class="tutor-ctrls">
            <button class="btn" disabled={t.step === 0} onClick={() => s.tutorStep(-1)}>
              Back
            </button>
            {last ? (
              <button class="btn primary" onClick={() => s.applyTutor()}>
                {hint.placement ? 'Apply' : 'Got it'}
              </button>
            ) : (
              <button class="btn primary" onClick={() => s.tutorStep(1)}>
                Next
              </button>
            )}
          </div>
          <div class="legend">
            <span>
              <i style={{ background: 'var(--t-focus)' }} /> Looking here
            </span>
            <span>
              <i style={{ background: 'var(--t-elim)' }} /> Rules it out
            </span>
            <span>
              <i style={{ background: 'var(--t-target)' }} /> The answer
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hardware keyboard (SPEC §13.11b): digits, 0/Backspace/Delete, P/Space, arrows. */
function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store;
      const g = s.game;
      if (!g || s.phase !== 'playing' || s.sheets.length || s.tutor || s.paused || g.isSolved) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k >= '1' && k <= '9') s.act((game) => game.pressNumber(Number(k)));
      else if (k === '0' || k === 'Backspace' || k === 'Delete') s.act((game) => game.clearSelected());
      else if (k === 'p' || k === 'P' || k === ' ') s.act((game) => game.toggleMode());
      else if (k === 's' || k === 'S') s.act((game) => game.toggleSpeedMode());
      else if (k === 'Enter' && g.speedMode && g.selected) s.act((game) => game.tapCell(game.selected!.row, game.selected!.col));
      else if (k === 'ArrowUp') s.act((game) => game.moveSelection(-1, 0));
      else if (k === 'ArrowDown') s.act((game) => game.moveSelection(1, 0));
      else if (k === 'ArrowLeft') s.act((game) => game.moveSelection(0, -1));
      else if (k === 'ArrowRight') s.act((game) => game.moveSelection(0, 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
