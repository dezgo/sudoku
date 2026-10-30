// The lifelines row (lib/lifelines.ts): four assists, lit until used and
// crossed out once used. Tapping the row explains them.

import { useStore } from '../app/store';
import { LIFELINES, type Lifeline } from '../lib/lifelines';
import { Icon } from './icons';
import { Sheet } from './Sheet';

export function Lifelines({ used, small = false }: { used: Lifeline[]; small?: boolean }) {
  const s = useStore();
  return (
    <button
      class={`lifelines${small ? ' small' : ''}`}
      aria-label={`Lifelines: ${LIFELINES.map((l) => `${l.label} ${used.includes(l.key) ? 'used' : 'not used'}`).join(', ')}`}
      onClick={() => s.open({ kind: 'lifelines', used })}
    >
      {LIFELINES.map((l) => (
        <span key={l.key} class={`lifeline${used.includes(l.key) ? ' used' : ''}`} title={l.label}>
          <Icon name={l.icon} size={small ? 14 : 16} />
        </span>
      ))}
    </button>
  );
}

export function LifelinesSheet({ used }: { used: Lifeline[] }) {
  return (
    <Sheet title="Lifelines">
      <p class="muted" style={{ marginTop: 4 }}>
        Like a quiz show: each one stays lit until it's used{used.length ? '' : ' — none used so far'}.
      </p>
      <div class="group">
        {LIFELINES.map((l) => (
          <div class="row" key={l.key}>
            <span class={`lifeline${used.includes(l.key) ? ' used' : ''}`}>
              <Icon name={l.icon} size={16} />
            </span>
            <div class="grow">
              <div>
                <b>{l.label}</b> · {used.includes(l.key) ? 'used' : 'not used'}
              </div>
              <div class="sub">{l.about}</div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
