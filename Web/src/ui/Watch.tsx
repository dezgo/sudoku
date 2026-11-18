// Watching a crew-mate play, live (Backend/src/watch-room.ts).
//  - WatchBar: on the player's own board — "Ash would like to watch", who's
//    watching (with Stop), and reactions floating in.
//  - WatchSheet: the watcher's view — the player's board, pencil marks and
//    where they're looking, plus emoji reactions. They can't touch the board.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { difficultyLabel, type Cells, type Difficulty } from '../engine/types';
import { track } from '../lib/usage';
import { Board } from './Board';
import { Sheet } from './Sheet';

const REACTIONS = ['👏', '😮', '💡', '🔥', '😂', '❤️'];

export function WatchBar() {
  const s = useStore();
  const { asks, watchers, reaction } = s.watch;
  if (!asks.length && !watchers.length && !reaction) return null;
  return (
    <div class="watch-bar">
      {asks.map((a) => (
        <div class="watch-ask" key={a.id}>
          <span class="grow">
            👀 <b>{a.name}</b> would like to watch
          </span>
          <button class="btn compact primary" onClick={() => s.allowWatcher(a.id)}>
            Allow
          </button>
          <button class="link" onClick={() => s.denyWatcher(a.id)}>
            Not now
          </button>
        </div>
      ))}
      {watchers.length > 0 && (
        <div class="watch-on">
          <span class="grow">
            👀 {watchers.map((w) => w.name).join(', ')} {watchers.length === 1 ? 'is' : 'are'} watching
          </span>
          <button class="link" onClick={() => s.stopWatchers()}>
            Stop
          </button>
        </div>
      )}
      {reaction && (
        <div class="watch-react" key={reaction.key}>
          <span class="e">{reaction.e}</span> {reaction.name}
        </div>
      )}
    </div>
  );
}

interface BoardMsg {
  difficulty: Difficulty;
  daily: boolean;
  fixed: number[];
  values: number[];
  notes: number[][];
  sel: number | null;
  solved: boolean;
}

type State = 'connecting' | 'waiting' | 'watching' | 'denied' | 'ended';
const ENDED: Record<string, (n: string) => string> = {
  done: (n) => `${n} solved it! 🎉`,
  stopped: (n) => `${n} stopped sharing their game.`,
  left: (n) => `${n} put the game down for now.`,
  not_playing: (n) => `${n} isn't playing right now.`,
};

export function WatchSheet({ id, name }: { id: string; name: string }) {
  const s = useStore();
  const [state, setState] = useState<State>('connecting');
  const [reason, setReason] = useState('left');
  const [board, setBoard] = useState<BoardMsg | null>(null);
  const [floating, setFloating] = useState<{ e: string; who: string; key: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!s.token) return;
    track('feature', { f: 'watch_ask' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/v1/watch/${id}/ws?role=watcher&token=${encodeURIComponent(s.token)}`);
    ws.current = sock;
    let ended = false;
    sock.onmessage = (e) => {
      let m: { t: string; reason?: string; e?: string; name?: string } & Partial<BoardMsg>;
      try {
        m = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (m.t === 'waiting') setState('waiting');
      else if (m.t === 'allowed') setState('watching');
      else if (m.t === 'denied') {
        ended = true;
        setState('denied');
      } else if (m.t === 'board') {
        setState('watching');
        setBoard(m as BoardMsg);
      } else if (m.t === 'react' && m.e) setFloating({ e: m.e, who: m.name || 'Someone', key: Date.now() });
      else if (m.t === 'ended') {
        ended = true;
        setReason(m.reason ?? 'left');
        setState('ended');
      }
    };
    sock.onclose = () => {
      if (!ended) {
        setReason((r) => r);
        setState((st) => (st === 'denied' ? st : 'ended'));
      }
    };
    return () => sock.close();
  }, [id]);

  useEffect(() => {
    if (!floating) return;
    const k = floating.key;
    const t = setTimeout(() => setFloating((f) => (f?.key === k ? null : f)), 2600);
    return () => clearTimeout(t);
  }, [floating]);

  const cells: Cells | null = useMemo(
    () =>
      board
        ? Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              const i = r * 9 + c;
              return { value: board.values[i] || null, isFixed: board.fixed[i] === 1, notes: new Set(board.notes[i]) };
            }),
          )
        : null,
    [board],
  );

  const react = (e: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: 'react', e }));
    track('feature', { f: 'watch_react' });
    setFloating({ e, who: 'You', key: Date.now() });
  };

  return (
    <Sheet title={state === 'watching' ? `Watching ${name}` : name}>
      {state === 'connecting' && <p class="muted t-center">Connecting…</p>}
      {state === 'waiting' && (
        <div class="watch-wait">
          <div class="big">👀</div>
          <p>
            Asking {name} if you can watch…
            <br />
            <span class="muted small">Their game pauses while they decide.</span>
          </p>
        </div>
      )}
      {state === 'denied' && (
        <div class="watch-wait">
          <div class="big">🙂</div>
          <p>{name} would rather play on their own right now. Maybe next time!</p>
        </div>
      )}
      {state === 'ended' && (
        <div class="watch-wait">
          <div class="big">{reason === 'done' ? '🎉' : '👋'}</div>
          <p>{(ENDED[reason] ?? ENDED.left!)(name)}</p>
        </div>
      )}
      {state === 'watching' && (
        <>
          {board && cells ? (
            <>
              <div class="muted small t-center" style={{ marginBottom: 6 }}>
                {board.daily ? 'The daily' : `A ${difficultyLabel[board.difficulty]} puzzle`} · live
              </div>
              <div class="watch-board">
                <Board
                  cells={cells}
                  look={(r, c) => ({ locked: board.fixed[r * 9 + c] === 1, partnerSel: board.sel === r * 9 + c })}
                />
                {floating && (
                  <div class="watch-float" key={floating.key}>
                    <span>{floating.e}</span>
                    <small>{floating.who}</small>
                  </div>
                )}
              </div>
              <div class="watch-reacts">
                {REACTIONS.map((e) => (
                  <button key={e} class="react-btn" aria-label={`Send ${e}`} onClick={() => react(e)}>
                    {e}
                  </button>
                ))}
              </div>
              <p class="muted small t-center">They see your reactions. You can't change their board.</p>
            </>
          ) : (
            <p class="muted t-center">Waiting for the board…</p>
          )}
        </>
      )}
    </Sheet>
  );
}
