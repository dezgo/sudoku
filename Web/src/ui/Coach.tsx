// Coach mode (SPEC §13.11a): a list of technique scenarios, each a board
// where that technique is the next useful move. Completion is judged against
// the engine's expected hint, snapshotted at load.

import { useMemo, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { expectedHint, validScenarios, type CoachScenario } from '../engine/coach';
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
        Pick a technique to practise. Each scenario sets up a board where the named pattern is the next useful move —
        spot it and apply it.
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
  const [cells, setCells] = useState<Cells>(() => cloneCells(scenario.initialCells));
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const [pencil, setPencil] = useState(expected.placement === null);
  const [done, setDone] = useState(false);

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
      <div class="coach-intro">{scenario.intro}</div>
      <Board
        mini
        cells={cells}
        onTap={(r, c) => setSel(sel && sel.row === r && sel.col === c ? null : { row: r, col: c })}
        look={(r, c) => ({ sel: sel?.row === r && sel?.col === c, locked: cells[r][c].isFixed })}
      />
      {done ? (
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
          </div>
        </div>
      )}
    </Sheet>
  );
}
