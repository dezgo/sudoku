// Coach mode (SPEC §13.11a): one lesson per technique, in three stages —
// the idea in plain words, a worked example (the tutor's lettered
// walkthrough on one board), then the player's turn on a different board.
// Completion is judged against the engine's expected hint for that board.

import { useMemo, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { exampleHint, expectedHint, validScenarios, type CoachScenario } from '../engine/coach';
import { techniqueTier } from '../engine/tutor';
import { cloneCells, type Cells } from '../engine/types';
import { playSound } from '../lib/sound';
import { Board } from './Board';
import { Icon } from './icons';
import { Sheet } from './Sheet';

export function CoachSheet() {
  const s = useStore();
  const [active, setActive] = useState<CoachScenario | null>(null);
  const scenarios = useMemo(() => validScenarios(), []);
  if (active) return <CoachPlay scenario={active} onBack={() => setActive(null)} />;
  return (
    <Sheet title="Coach">
      <p class="muted" style={{ marginTop: 4 }}>
        Pick a technique to learn. Each one explains the idea, walks you through an example, then gives you a board to
        try it yourself.
      </p>
      <div class="group">
        {scenarios.map((sc) => (
          <button key={sc.id} class="row" onClick={() => setActive(sc)}>
            <div class="grow">
              <div>{sc.title}</div>
              <div class="sub" style={{ textTransform: 'capitalize' }}>
                {techniqueTier(sc.technique)}
              </div>
            </div>
            {s.coachCompleted[sc.technique] ? (
              <span style={{ color: 'var(--gold)' }}>
                <Icon name="trophy" size={20} />
              </span>
            ) : (
              <span class="muted">
                <Icon name="chevronRight" size={18} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function CoachPlay({ scenario, onBack }: { scenario: CoachScenario; onBack: () => void }) {
  const s = useStore();
  const expected = useMemo(() => expectedHint(scenario)!, [scenario]);
  const example = useMemo(() => exampleHint(scenario)!, [scenario]);
  const [stage, setStage] = useState<'lesson' | 'example' | 'practice'>('lesson');
  const [exStep, setExStep] = useState(0);
  const [cells, setCells] = useState<Cells>(() => cloneCells(scenario.initialCells));
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const [pencil, setPencil] = useState(expected.placement === null);
  const [done, setDone] = useState(false);
  // Show me (on the practice board): step through the tutor's explanation.
  const [walk, setWalk] = useState<number | null>(null);

  const check = (next: Cells) => {
    let ok: boolean;
    if (expected.placement) {
      const p = expected.placement;
      ok = next[p.row][p.col].value === p.value;
    } else {
      // Every called-out candidate gone (and it was there to begin with);
      // extra eliminations elsewhere are tolerated.
      ok = expected.eliminations.every((e) => {
        const initial = scenario.initialCells[e.row][e.col].notes;
        const cur = next[e.row][e.col].notes;
        return [...e.candidates].some((d) => initial.has(d)) && ![...e.candidates].some((d) => cur.has(d));
      });
    }
    if (ok) {
      setDone(true);
      s.markCoachComplete(scenario.technique);
      if (s.prefs.sound) playSound('solved');
    }
  };

  const enter = (n: number) => {
    if (done || !sel) return;
    const next = cloneCells(cells);
    const cell = next[sel.row][sel.col];
    if (cell.isFixed) return;
    if (pencil) {
      cell.value = null;
      if (!cell.notes.delete(n)) cell.notes.add(n);
    } else {
      cell.value = cell.value === n ? null : n;
      cell.notes = new Set();
    }
    setCells(next);
    check(next);
  };

  const clear = () => {
    if (done || !sel) return;
    const next = cloneCells(cells);
    const cell = next[sel.row][sel.col];
    if (cell.isFixed) return;
    cell.value = null;
    cell.notes = new Set();
    setCells(next);
    check(next);
  };

  return (
    <Sheet
      title={scenario.title}
      left={
        <button class="link" onClick={onBack}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="chevronLeft" size={18} /> Coach
          </span>
        </button>
      }
    >
      {stage === 'lesson' && (
        <>
          <div class="coach-intro coach-lesson">
            {scenario.lesson.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <div class="stack center">
            <button
              class="btn primary"
              onClick={() => {
                setExStep(0);
                setStage('example');
              }}
            >
              Show me an example
            </button>
            <button class="link" onClick={() => setStage('practice')}>
              Skip to my turn
            </button>
          </div>
        </>
      )}
      {stage === 'example' && (
        <>
          <div class="coach-intro">
            <b>Example.</b> Step {exStep + 1} of {example.steps.length}:{' '}
            {example.steps[exStep].narration.replace(/ ?Tap (Got it|Apply) to [^.]*\./, '') ||
              'These are the ones it rules out.'}
          </div>
          <Board mini cells={scenario.exampleCells} look={() => ({})} tutor={example.steps[exStep].highlights} />
          <div class="tutor-ctrls">
            <button class="btn" onClick={() => (exStep === 0 ? setStage('lesson') : setExStep(exStep - 1))}>
              Back
            </button>
            {exStep === example.steps.length - 1 ? (
              <button class="btn primary" onClick={() => setStage('practice')}>
                My turn
              </button>
            ) : (
              <button class="btn primary" onClick={() => setExStep(exStep + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      )}
      {stage === 'practice' && (
        <>
          <div class="coach-intro">
            <b>Your turn.</b> {scenario.intro}{' '}
            <button class="link inline" onClick={() => setStage('lesson')}>
              Read the lesson again
            </button>
          </div>
          <Board
            mini
            cells={walk === null ? cells : scenario.initialCells}
            tutor={walk === null ? null : expected.steps[walk].highlights}
            onTap={(r, c) => setSel(sel && sel.row === r && sel.col === c ? null : { row: r, col: c })}
            look={(r, c) => ({ sel: sel?.row === r && sel?.col === c, locked: cells[r][c].isFixed })}
          />
          {walk !== null ? (
            <div class="sheet-body">
              <p class="tutor-narr" aria-live="polite">
                <b>
                  Step {walk + 1} of {expected.steps.length}.
                </b>{' '}
                {expected.steps[walk].narration.replace(/Tap (Got it|Apply) to /, 'Your move: ')}
              </p>
              <div class="tutor-ctrls">
                <button class="btn" disabled={walk === 0} onClick={() => setWalk(walk - 1)}>
                  Back
                </button>
                {walk === expected.steps.length - 1 ? (
                  <button class="btn primary" onClick={() => setWalk(null)}>
                    Now you try
                  </button>
                ) : (
                  <button class="btn primary" onClick={() => setWalk(walk + 1)}>
                    Next
                  </button>
                )}
              </div>
            </div>
          ) : done ? (
            <div class="stack center">
              <div style={{ color: 'var(--gold)' }}>
                <Icon name="trophy" size={52} />
              </div>
              <b>Nice — {scenario.title} cleared.</b>
              <button class="btn primary" onClick={onBack}>
                Back to Coach
              </button>
            </div>
          ) : (
            <div class="pad" style={{ margin: '0 auto' }}>
              <div class="pad-digits">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} class="pad-digit" onClick={() => enter(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div class="pad-tools">
                <button class={`tool${pencil ? ' on' : ''}`} onClick={() => setPencil(!pencil)}>
                  <Icon name="pencil" size={17} /> Pencil
                </button>
                <button class="tool" onClick={clear}>
                  <Icon name="erase" size={17} /> Erase
                </button>
                <button
                  class="tool"
                  onClick={() => {
                    setCells(cloneCells(scenario.initialCells));
                    setSel(null);
                  }}
                >
                  <Icon name="undo" size={17} /> Reset
                </button>
                <button class="tool" onClick={() => setWalk(0)}>
                  <Icon name="cap" size={17} /> Show me
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
