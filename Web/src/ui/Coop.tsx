// Co-op (SPEC §18): start a live game, join one by name, list your games,
// and the strip shown above the board while playing together. The game
// itself is the normal Play screen — store.coop switches on the extras.

import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { requestPuzzle } from '../app/puzzles';
import { difficultyLabel, DIFFICULTIES, type Difficulty } from '../engine/types';
import { ApiError, api, type CoopGameSummary } from '../lib/api';
import { formatTime } from '../lib/format';
import { Icon } from './icons';
import { Segmented, Sheet, shareText } from './Sheet';

export function coopUrl(name: string): string {
  return `${location.origin}/c/${name}`;
}

export function inviteToCoop(name: string, difficulty: Difficulty): void {
  void shareText(`Solve this ${difficultyLabel[difficulty]} sudoku with me, live!`, coopUrl(name));
}

/** "ginger willow velvet", "Ginger-Willow-Velvet" → "ginger-willow-velvet". */
function normaliseName(s: string): string {
  return s.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean).join('-');
}

/** Lobby section: start, join by name, and your recent co-op games. */
export function CoopSection({ onCreate }: { onCreate: () => void }) {
  const s = useStore();
  const [games, setGames] = useState<CoopGameSummary[] | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    api
      .coopMine(s.token!)
      .then(setGames)
      .catch(() => setGames([]));
  }, []);
  const others = (g: CoopGameSummary) =>
    g.players.filter((p) => p.id !== s.identity?.user.id).map((p) => p.display_name ?? 'someone');
  const valid = /^[a-z]+-[a-z]+-[a-z]+$/.test(normaliseName(name));
  return (
    <>
      <div class="section-title">Solve together, live</div>
      <p class="footnote" style={{ margin: '0 4px 8px' }}>
        Everyone works on the same board at once. Numbers show up for all of you; pencil marks stay your own.
      </p>
      <button class="btn primary" onClick={onCreate}>
        <Icon name="users" size={20} /> Start a co-op game
      </button>
      <form
        style={{ display: 'flex', gap: 8, margin: '10px 0 6px' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void s.startCoop(normaliseName(name));
        }}
      >
        <input
          class="field"
          style={{ flex: 1, padding: 10 }}
          placeholder="Game name, e.g. ginger willow velvet"
          autoCapitalize="off"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <button class="btn compact primary" type="submit" disabled={!valid}>
          Join
        </button>
      </form>
      {games && games.length > 0 && (
        <div class="group">
          {games.slice(0, 8).map((g) => (
            <button key={g.name} class="row" onClick={() => void s.startCoop(g.name)}>
              <div class="grow">
                <div>
                  {difficultyLabel[g.difficulty]} · {g.name.split('-').join(' ')}
                </div>
                <div class="sub">
                  {others(g).length ? `With ${others(g).join(', ')}` : 'Waiting for someone to join'}
                  {g.completed_at ? ` · solved in ${formatTime(g.elapsed_seconds ?? 0)}` : ''}
                </div>
              </div>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </div>
      )}
      <div class="section-title" style={{ marginTop: 22 }}>
        Take turns
      </div>
    </>
  );
}

export function CoopCreate({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const [d, setD] = useState<Difficulty>(s.prefs.difficulty);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const p = await requestPuzzle(d, 0);
      const name = await api.coopCreate(s.token!, p.givens, d);
      await s.startCoop(name);
    } catch (e) {
      s.showToast(e instanceof ApiError && e.kind === 'offline' ? "You're offline." : "Couldn't start the game. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Co-op game"
      left={
        <button class="link" onClick={onBack}>
          Back
        </button>
      }
      right={<span />}
    >
      <div class="stack" style={{ paddingTop: 8 }}>
        <Segmented options={DIFFICULTIES.map((v) => ({ value: v, label: difficultyLabel[v] }))} value={d} onChange={setD} />
        <p class="muted" style={{ margin: 0 }}>
          You'll get a link to send. The clock starts when a friend joins or the first number goes in.
        </p>
        <button class="btn primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Setting up…' : 'Start'}
        </button>
      </div>
    </Sheet>
  );
}

/** Above the board while playing together: who's here, or how to invite someone. */
export function CoopStrip() {
  const s = useStore();
  const c = s.coop!;
  const g = s.game!;
  const others = Object.entries(c.players).filter(([id]) => id !== c.me);
  if (!c.connected)
    return (
      <div class="coop-strip">
        <span class="muted">Reconnecting…</span>
      </div>
    );
  if (others.length === 0)
    return (
      <div class="coop-strip">
        <span class="grow">
          Waiting for a friend · <b>{c.name.split('-').join(' ')}</b>
        </span>
        <button class="btn compact primary" onClick={() => inviteToCoop(c.name, g.puzzle.difficulty)}>
          <Icon name="share" size={16} /> Invite
        </button>
      </div>
    );
  return (
    <div class="coop-strip">
      <span class="muted">With</span>
      {others.map(([id, name]) => (
        <span key={id} class={`coop-player${c.online.includes(id) ? ' on' : ''}`}>
          {name}
        </span>
      ))}
    </div>
  );
}
