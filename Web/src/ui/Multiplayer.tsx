// Turn-based multiplayer (SPEC §17.6): lobby, create, and the game view.
// The server is the source of truth for the board; the client polls while a
// game is open (no push on the web yet), and every move is one POST.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { DIFFICULTIES, difficultyLabel, type Cells, type Difficulty } from '../engine/types';
import { ApiError, api, type MultiplayerGame, type MultiplayerGameDetail } from '../lib/api';
import { playSound } from '../lib/sound';
import { Board } from './Board';
import { Icon } from './icons';
import { Segmented, Sheet, shareText, Toggle } from './Sheet';

const TURN_OPTIONS = [
  { value: '3600', label: '1 hour' },
  { value: '21600', label: '6 hours' },
  { value: '86400', label: '24 hours' },
  { value: '0', label: 'No limit' },
];

function remaining(secs: number): string {
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m`;
  return `${secs}s`;
}

export function inviteUrl(code: string): string {
  return `${location.origin}/m/${code}`;
}

export function MultiplayerSheet({ gameId }: { gameId?: string }) {
  const s = useStore();
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'create' } | { kind: 'game'; id: string }>(
    gameId ? { kind: 'game', id: gameId } : { kind: 'list' },
  );
  if (!s.identity)
    return (
      <Sheet title="Multiplayer">
        <div class="empty">
          <p>
            <b>Sign in to play with friends.</b>
          </p>
          <p>Multiplayer needs a signed-in account so we know whose turn it is.</p>
          <button class="btn primary" onClick={() => s.open({ kind: 'signIn' })}>
            Sign in
          </button>
        </div>
      </Sheet>
    );
  if (view.kind === 'create') return <CreateGame onBack={() => setView({ kind: 'list' })} onOpen={(id) => setView({ kind: 'game', id })} />;
  if (view.kind === 'game') return <GameView id={view.id} onBack={() => setView({ kind: 'list' })} />;
  return <Lobby onCreate={() => setView({ kind: 'create' })} onOpen={(id) => setView({ kind: 'game', id })} />;
}

function Lobby({ onCreate, onOpen }: { onCreate: () => void; onOpen: (id: string) => void }) {
  const s = useStore();
  const [data, setData] = useState<{ in_progress: MultiplayerGame[]; completed: MultiplayerGame[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = () =>
    api
      .mpMine(s.token!)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError("Couldn't refresh games."));
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const joinCode = async () => {
    setJoining(true);
    try {
      const g = await api.mpJoinByCode(s.token!, code.trim().toUpperCase());
      onOpen(g.id);
    } catch (e) {
      s.showToast(mpJoinError(e));
    } finally {
      setJoining(false);
    }
  };

  const mine = data?.in_progress ?? [];
  const yourTurn = mine.filter((g) => g.is_my_turn);
  const waiting = mine.filter((g) => !g.is_my_turn);
  const row = (g: MultiplayerGame) => (
    <button key={g.id} class="row" onClick={() => onOpen(g.id)}>
      <div class="grow">
        <div>{difficultyLabel[g.difficulty]} game</div>
        <div class="sub">
          {g.status === 'pending'
            ? 'Tap to invite or start'
            : g.status === 'completed'
              ? 'Tap to see stats'
              : g.status === 'abandoned'
                ? 'Game ended early'
                : g.is_my_turn
                  ? g.time_remaining_seconds !== null
                    ? `Your move · ${remaining(g.time_remaining_seconds)} left`
                    : 'Your turn now'
                  : 'Waiting on another player'}
        </div>
      </div>
      <Icon name="chevronRight" size={18} />
    </button>
  );

  return (
    <Sheet
      title="Multiplayer"
      left={
        <button class="icon-btn" aria-label="New game" onClick={onCreate}>
          <Icon name="plus" size={22} />
        </button>
      }
    >
      <form
        style={{ display: 'flex', gap: 8, marginBottom: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length === 6 && !joining) void joinCode();
        }}
      >
        <input
          class="field"
          style={{ flex: 1, padding: 10 }}
          placeholder="Have an invite code?"
          maxLength={6}
          autoCapitalize="characters"
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
        <button class="btn compact primary" type="submit" disabled={code.trim().length !== 6 || joining}>
          Join
        </button>
      </form>
      {error && <p class="error">{error}</p>}
      {!data && !error && <div class="spinner" />}
      {data && !mine.length && !data.completed.length && (
        <div class="empty">
          <p>
            <b>No games yet</b>
          </p>
          <p>Start a turn-based sudoku with friends.</p>
          <button class="btn primary" onClick={onCreate}>
            <Icon name="plus" size={18} /> New game
          </button>
        </div>
      )}
      {yourTurn.length > 0 && (
        <>
          <div class="section-title">Your turn</div>
          <div class="group">{yourTurn.map(row)}</div>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <div class="section-title">Waiting on others</div>
          <div class="group">{waiting.map(row)}</div>
        </>
      )}
      {data && data.completed.length > 0 && (
        <>
          <div class="section-title">Completed</div>
          <div class="group">{data.completed.slice(0, 20).map(row)}</div>
        </>
      )}
    </Sheet>
  );
}

function mpJoinError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === 'offline') return "You're offline. Try again when you're back online.";
    if (e.status === 404) return "We don't recognise that invite code. The game may have ended.";
    if (e.status === 409 && e.detail === 'cannot_rejoin') return "You've already left this game and can't rejoin.";
    if (e.status === 409) return 'This game has already started or ended.';
  }
  return "Couldn't join the game. Try again.";
}

function CreateGame({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const s = useStore();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [turn, setTurn] = useState('21600');
  const [competitive, setCompetitive] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.mpCreate(s.token!, {
        difficulty,
        turn_duration_seconds: Number(turn),
        competitive_mode: competitive,
        ...(groupId ? { group_id: groupId } : {}),
      });
      onOpen(r.game.id);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "You've hit the limit of 10 active games. Finish one first."
          : e instanceof ApiError && e.kind === 'offline'
            ? "You're offline."
            : "Couldn't create the game. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="New multiplayer game" left={<button class="link" onClick={onBack}>Cancel</button>} right={<span />}>
      <div class="section-title">Difficulty</div>
      <Segmented options={DIFFICULTIES.map((d) => ({ value: d, label: difficultyLabel[d] }))} value={difficulty} onChange={setDifficulty} />
      <div class="section-title">Each turn</div>
      <Segmented options={TURN_OPTIONS} value={turn} onChange={setTurn} />
      <div class="section-title">Competitive mode</div>
      <div class="group">
        <Toggle label="Single-winner ranking" checked={competitive} onChange={setCompetitive} />
      </div>
      <p class="footnote">
        {competitive ? 'A winner is crowned by score (correct − 2 × mistakes).' : 'Stats salad — everyone earns a badge category.'}
      </p>
      {s.groups.length > 0 && (
        <>
          <div class="section-title">Invite a group (optional)</div>
          <select class="field" value={groupId} onChange={(e) => setGroupId(e.currentTarget.value)}>
            <option value="">No group</option>
            {s.groups.map((g) => (
              <option key={g.group.id} value={g.group.id}>
                {g.group.name}
              </option>
            ))}
          </select>
          {groupId && <p class="footnote">Everyone in the group is invited automatically.</p>}
        </>
      )}
      {error && <p class="error">{error}</p>}
      <button class="btn primary" style={{ marginTop: 20 }} disabled={busy} onClick={() => void create()}>
        {busy ? '…' : 'Create game'}
      </button>
    </Sheet>
  );
}

function GameView({ id, onBack }: { id: string; onBack: () => void }) {
  const s = useStore();
  const me = s.identity!.user.id;
  const [detail, setDetail] = useState<MultiplayerGameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = () =>
    api
      .mpGame(s.token!, id)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch(() => setError("Couldn't load this game."));

  useEffect(() => {
    void load();
    // Poll while open: quicker when waiting on someone else's move.
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 8_000);
    const c = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [id]);

  const placedByMove = useMemo(() => {
    const set = new Set<number>();
    detail?.moves.forEach((m) => m.was_correct && set.add(m.row * 9 + m.col));
    return set;
  }, [detail]);

  const cells: Cells | null = useMemo(
    () =>
      detail
        ? detail.board.map((row, r) =>
            row.map((v, c) => ({ value: v || null, isFixed: v !== 0 && !placedByMove.has(r * 9 + c), notes: new Set<number>() })),
          )
        : null,
    [detail, placedByMove],
  );

  if (error && !detail)
    return (
      <Sheet title="Multiplayer" left={<BackLink onBack={onBack} />}>
        <div class="empty">
          <p>{error}</p>
          <button class="btn compact" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </Sheet>
    );
  if (!detail || !cells)
    return (
      <Sheet title="Multiplayer" left={<BackLink onBack={onBack} />}>
        <div class="spinner" />
      </Sheet>
    );

  const g = detail.game;
  const joined = detail.players.filter((p) => p.status === 'joined');
  const isHost = g.created_by === me;
  const myPlayer = detail.players.find((p) => p.user.id === me);
  const deadlineLeft = g.turn_deadline ? Math.max(0, Math.round((g.turn_deadline - Date.now()) / 1000)) : null;
  const activeName = detail.players.find((p) => p.user.id === g.active_player_id)?.user.display_name ?? 'someone';
  const nameOf = (uid: string) => detail.players.find((p) => p.user.id === uid)?.user.display_name ?? '—';

  const stats = new Map<string, { correct: number; wrong: number }>();
  for (const m of detail.moves) {
    const st = stats.get(m.player_id) ?? { correct: 0, wrong: 0 };
    if (m.was_correct) st.correct++;
    else st.wrong++;
    stats.set(m.player_id, st);
  }

  const place = async (value: number) => {
    if (!sel || busy || !g.is_my_turn) return;
    setBusy(true);
    try {
      const r = await api.mpMove(s.token!, id, sel.row, sel.col, value, crypto.randomUUID());
      if (s.prefs.sound) playSound(r.move.was_correct ? 'place' : 'mistake');
      if (!r.move.was_correct) s.showToast(`${value} doesn't go there — turn over.`);
      setSel(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        s.showToast('Not your turn anymore — refreshing.');
        await load();
      } else s.showToast("Couldn't place that move. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const status =
    g.status === 'pending'
      ? 'Waiting to start'
      : g.status === 'completed'
        ? g.winner_id
          ? `Solved by ${nameOf(g.winner_id)}`
          : 'Solved'
        : g.status === 'abandoned'
          ? 'Game abandoned'
          : g.is_my_turn
            ? `Your turn${deadlineLeft !== null ? ` · ${remaining(deadlineLeft)} left` : ''}`
            : `${activeName}'s turn`;

  return (
    <Sheet title={`${difficultyLabel[g.difficulty]} · multiplayer`} left={<BackLink onBack={onBack} />}>
      <p class="center" style={{ fontWeight: 700, margin: '4px 0 8px' }}>
        {status}
      </p>
      <div class="players" style={{ marginBottom: 6 }}>
        {detail.players
          .filter((p) => p.status !== 'declined')
          .map((p) => {
            const st = stats.get(p.user.id);
            return (
              <span key={p.user.id} class={`player${p.user.id === g.active_player_id && g.status === 'active' ? ' active' : ''}`}>
                {p.user.display_name ?? '—'}
                {p.status === 'invited' ? ' (pending)' : p.status === 'left' ? ' (left)' : ''}
                {st ? ` ${st.correct}✓ ${st.wrong}✗` : ''}
              </span>
            );
          })}
      </div>

      <Board
        mini
        cells={cells}
        onTap={g.status === 'active' && g.is_my_turn ? (r, c) => (cells[r][c].value ? setSel(null) : setSel({ row: r, col: c })) : undefined}
        look={(r, c) => ({ sel: sel?.row === r && sel?.col === c, locked: cells[r][c].isFixed })}
      />

      {g.status === 'active' && g.is_my_turn && (
        <div class="pad" style={{ margin: '0 auto' }}>
          <div class="pad-digits">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} class="pad-digit" disabled={!sel || busy} onClick={() => void place(n)}>
                {n}
              </button>
            ))}
          </div>
          <p class="speed-hint">{sel ? 'One digit per turn. A wrong digit ends your turn.' : 'Tap an empty square, then a number.'}</p>
        </div>
      )}
      {g.status === 'active' && !g.is_my_turn && <p class="footnote center">This refreshes on its own while you wait.</p>}

      {g.status === 'pending' && (
        <div class="stack" style={{ marginTop: 10 }}>
          <div class="group" style={{ padding: 14, textAlign: 'center' }}>
            <div class="muted small">Invite code</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.2em' }}>{g.invite_code}</div>
            <div class="muted small">Anyone with the link can join — it opens right in the browser.</div>
          </div>
          <button class="btn" onClick={() => void shareText('Join my Sudoku Crew game:', inviteUrl(g.invite_code))}>
            <Icon name="share" size={18} /> Share invite link
          </button>
          {isHost ? (
            <button
              class="btn primary"
              disabled={joined.length < 2 || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.mpStart(s.token!, id);
                  await load();
                } catch {
                  s.showToast("Couldn't start the game.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {joined.length < 2 ? 'Need at least 2 players' : 'Start game'}
            </button>
          ) : myPlayer?.status === 'invited' ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button class="btn" onClick={async () => { await api.mpDecline(s.token!, id).catch(() => {}); onBack(); }}>
                Decline
              </button>
              <button
                class="btn primary"
                onClick={async () => {
                  try {
                    await api.mpJoin(s.token!, id);
                    await load();
                  } catch (e) {
                    s.showToast(mpJoinError(e));
                  }
                }}
              >
                Join
              </button>
            </div>
          ) : (
            <p class="footnote center">Waiting for the host to start.</p>
          )}
        </div>
      )}

      {(g.status === 'completed' || g.status === 'abandoned') && (
        <>
          <div class="section-title">Final stats</div>
          <div class="group">
            {detail.players
              .filter((p) => p.status !== 'declined')
              .map((p) => {
                const st = stats.get(p.user.id) ?? { correct: 0, wrong: 0 };
                return (
                  <div class="row" key={p.user.id}>
                    <span class="grow" style={{ fontWeight: p.user.id === g.winner_id ? 700 : 400 }}>
                      {p.user.display_name ?? '—'}
                      {p.user.id === g.winner_id && (
                        <span style={{ color: 'var(--success)', marginLeft: 6, verticalAlign: 'middle' }}>
                          <Icon name="seal" size={16} />
                        </span>
                      )}
                    </span>
                    <span class="muted small">
                      {st.correct} correct · {st.wrong} miss
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {(g.status === 'active' || g.status === 'pending') && myPlayer?.status === 'joined' && (
        <button
          class="btn danger"
          style={{ marginTop: 18 }}
          onClick={async () => {
            try {
              await api.mpLeave(s.token!, id);
              onBack();
            } catch {
              s.showToast("Couldn't leave the game.");
            }
          }}
        >
          Leave game
        </button>
      )}
    </Sheet>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button class="link" onClick={onBack}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <Icon name="chevronLeft" size={18} /> Games
      </span>
    </button>
  );
}
