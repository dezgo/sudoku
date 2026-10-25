// The 9×9 grid. One component serves play, the read-only completed view,
// coach scenarios and multiplayer — callers pass a `cellState` function for
// the highlight layers (SPEC §8) and an optional tap handler.

import type { Cells } from '../engine/types';
import type { TutorHighlight } from '../engine/tutor';

export interface CellLook {
  sel?: boolean;
  /** Faint outline marking the selection without the yellow fill. */
  ghost?: boolean;
  match?: boolean;
  peer?: boolean;
  err?: boolean;
  locked?: boolean;
}

type Kind = TutorHighlight['kind'];

/** Background kind per cell (target > eliminator > focus) and per-digit tint. */
function tutorMap(highlights: TutorHighlight[] | null) {
  const map = new Map<number, { kind: Kind; digits: Map<number, Kind> }>();
  if (!highlights) return map;
  const rank: Record<Kind, number> = { focus: 0, eliminator: 1, target: 2 };
  for (const h of highlights) {
    const key = h.row * 9 + h.col;
    const cur = map.get(key) ?? { kind: h.kind, digits: new Map<number, Kind>() };
    if (rank[h.kind] > rank[cur.kind]) cur.kind = h.kind;
    for (const d of h.candidates) {
      const existing = cur.digits.get(d);
      if (!existing || (existing === 'eliminator' && h.kind === 'target')) cur.digits.set(d, h.kind);
    }
    map.set(key, cur);
  }
  return map;
}

export function Board({
  cells,
  look,
  onTap,
  tutor = null,
  paused = false,
  onResume,
  mini = false,
}: {
  cells: Cells;
  look: (r: number, c: number) => CellLook;
  onTap?: (r: number, c: number) => void;
  tutor?: TutorHighlight[] | null;
  paused?: boolean;
  onResume?: () => void;
  mini?: boolean;
}) {
  const tmap = tutorMap(tutor);
  const tutorActive = tutor !== null;
  return (
    <div class={mini ? 'mini-board' : 'board-wrap'}>
      <div class="board" role="grid" aria-label="Sudoku board">
        {cells.map((row, r) =>
          row.map((cell, c) => {
            const t = tmap.get(r * 9 + c);
            // While the tutor is explaining, the normal tints are suppressed
            // so the step's colours are unambiguous.
            const l = tutorActive ? { locked: look(r, c).locked } : look(r, c);
            const cls = ['cell', `c${c + 1}`, `r${r + 1}`];
            if (t) cls.push(t.kind === 'target' ? 't-target' : t.kind === 'eliminator' ? 't-elim' : 't-focus');
            else if (l.sel) cls.push('sel');
            else if (l.match) cls.push('match');
            else if (l.peer) cls.push('peer');
            if (l.ghost && !t) cls.push('ghost');
            if (l.locked) cls.push('locked');
            if (l.err) cls.push('err');
            return (
              <button
                key={r * 9 + c}
                class={cls.join(' ')}
                role="gridcell"
                aria-label={`Row ${r + 1} column ${c + 1}${cell.value ? `, ${cell.value}` : ', empty'}`}
                tabIndex={-1}
                onPointerDown={
                  onTap && !tutorActive && !paused
                    ? (e) => {
                        // pointerdown, not click: fires on touch-start, which
                        // is what makes rapid entry feel native.
                        e.preventDefault();
                        onTap(r, c);
                      }
                    : undefined
                }
              >
                {cell.value !== null ? (
                  <span class="v">{cell.value}</span>
                ) : cell.notes.size > 0 ? (
                  <span class="notes">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                      const has = cell.notes.has(n);
                      const k = has ? t?.digits.get(n) : undefined;
                      return (
                        <span key={n} class={k === 'target' ? 'n-target' : k === 'eliminator' ? 'n-elim' : ''}>
                          {has ? n : ''}
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      {paused && (
        <div class="pause-cover">
          <span>Paused</span>
          <button class="btn primary compact" onClick={onResume}>
            Resume
          </button>
        </div>
      )}
    </div>
  );
}
