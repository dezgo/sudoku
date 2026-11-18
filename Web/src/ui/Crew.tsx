// The crew (Nov 2026): what friends in your groups have just finished, how
// they found it, and their favourites — so you get curious and try the same
// board. Deliberately not competitive: no times, no ranks. Plus the two-tap
// "How was it?" on the Solved sheet that feeds it.

import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from '../app/store';
import { api, type CrewFavourite, type CrewPlay, type Enjoyment } from '../lib/api';
import { deviceId } from '../lib/usage';
import { dateFromDailyId, weekdayDate } from '../lib/format';
import { difficultyLabel } from '../engine/types';
import { techniqueLabel, type TutorTechnique } from '../engine/tutor';
import { Segmented, Sheet, shareText } from './Sheet';
import { track } from '../lib/usage';
import { Icon } from './icons';

const FACES: { v: Enjoyment; face: string; label: string }[] = [
  { v: 1, face: '😐', label: 'Meh' },
  { v: 2, face: '🙂', label: 'Good' },
  { v: 3, face: '😍', label: 'Loved it' },
];
const FEELING: Record<Enjoyment, string> = { 1: '😐 meh', 2: '🙂 enjoyed it', 3: '😍 loved it' };

function techniqueName(t: string): string {
  try {
    return techniqueLabel(t as TutorTechnique) ?? t;
  } catch {
    return t;
  }
}

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "today's daily", "the daily for Wed 12 Nov", "a Hard puzzle", "a co-op Hard puzzle". */
function what(item: { puzzle_id: number | null; difficulty: CrewPlay['difficulty']; mode?: string }): string {
  if (item.puzzle_id !== null)
    return item.puzzle_id === store.todayId ? "today's daily" : `the daily for ${weekdayDate(dateFromDailyId(item.puzzle_id))}`;
  return `a ${item.mode === 'coop' ? 'co-op ' : ''}${difficultyLabel[item.difficulty]} puzzle`;
}

function Initial({ name }: { name: string }) {
  return <span class="crew-avatar">{(name.trim()[0] ?? '?').toUpperCase()}</span>;
}

function TryButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return done ? (
    <span class="crew-done" title="You've done this one">
      <Icon name="seal" size={16} /> Done
    </span>
  ) : (
    <button class="btn compact" onClick={onClick}>
      Try it
    </button>
  );
}

function PlayRow({ p }: { p: CrewPlay }) {
  const bits: string[] = [];
  if (p.enjoyment) bits.push(FEELING[p.enjoyment]);
  if (p.techniques.length) bits.push(`${p.learnt === false ? 'used' : 'learnt'} ${p.techniques.map(techniqueName).join(', ')}`);
  else if (p.learnt) bits.push('learnt something');
  bits.push(ago(p.completed_at));
  return (
    <div class="row crew-row">
      <Initial name={p.who} />
      <div class="grow">
        <div>
          <b>{p.you ? 'You' : p.who}</b> finished {what(p)}
        </div>
        <div class="sub">{bits.join(' · ')}</div>
      </div>
      {!p.you && <TryButton done={p.done} onClick={() => store.tryFromCrew(p)} />}
    </div>
  );
}

function FavouriteRow({ f }: { f: CrewFavourite }) {
  const bits: string[] = [];
  if (f.loved) bits.push(`😍 × ${f.loved}`);
  if (f.learnt) bits.push(`${f.learnt} learnt something`);
  if (f.names.length) bits.push(f.names.slice(0, 3).join(', ') + (f.names.length > 3 ? ` +${f.names.length - 3}` : ''));
  else bits.push(`${f.players} ${f.players === 1 ? 'player' : 'players'}`);
  const label = what(f);
  return (
    <div class="row crew-row">
      <span class="crew-avatar fav">★</span>
      <div class="grow">
        <div>{label[0]!.toUpperCase() + label.slice(1)}</div>
        <div class="sub">{bits.join(' · ')}</div>
      </div>
      <TryButton done={f.done} onClick={() => store.tryFromCrew({ ...f, who: f.names[0], enjoyment: f.loved ? 3 : 2 })} />
    </div>
  );
}

export function inviteFriend(): void {
  track('feature', { f: 'invite' });
  const { text, url } = store.inviteLink();
  void shareText(text, url);
}

/**
 * The plain-English rules, shown on the crew screen (and opened from the
 * invite flow) so nobody has to guess who sees what.
 */
export function HowCrewWorks({ open: initiallyOpen = false }: { open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div class="how-crew">
      <button class="how-crew-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>How your crew works</span>
        <span class="muted">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <ul>
          <li>
            <b>Your crew is your own list of friends.</b> When someone opens your invite link, you get a request. They’re
            only added if you accept — and then it’s just the two of you who are connected.
          </li>
          <li>
            <b>You see each other’s finished games</b> and how you rated them, so you can try the same puzzle. Never your
            times, unless you open “Times for today’s daily”.
          </li>
          <li>
            <b>Their friends don’t see you, and yours don’t see them.</b> If Ash is in your crew and you invite a mate, Ash
            doesn’t see your mate and your mate doesn’t see Ash — unless they connect too.
          </li>
          <li>
            <b>Watching only happens if you say yes</b>, each time (you can change that in Settings).
          </li>
          <li>
            <b>Notes are just for you.</b> Add one to remember who someone is (“Sam from work”). They never see it.
          </li>
          <li>
            <b>You can remove anyone</b>, any time. They aren’t told; you just stop seeing each other.
          </li>
        </ul>
      )}
    </div>
  );
}

/** My private note on someone, shown under their name. Tap it to change it. */
function NoteLine({ id, onEdit }: { id: string; onEdit: () => void }) {
  const note = useStore().crew?.notes?.[id];
  if (!note) return null;
  return (
    <button class="crew-note" onClick={onEdit} title="Only you see this note">
      {note}
    </button>
  );
}

/** Inline editor for a private note. Saving an empty note removes it. */
function NoteEditor({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const s = useStore();
  const [text, setText] = useState(s.crew?.notes?.[id] ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await s.saveNote(id, text);
    setSaving(false);
    if (ok) onDone();
  };
  return (
    <div class="crew-note-edit">
      <input
        type="text"
        value={text}
        maxLength={200}
        placeholder={`Who’s ${name}? e.g. from work`}
        aria-label={`Private note on ${name}`}
        ref={(el) => el?.focus()}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') onDone();
        }}
      />
      <div class="sub">
        Only you see this.{' '}
        <button class="link inline-caption" disabled={saving} onClick={() => void save()}>
          Save
        </button>{' '}
        <button class="link inline-caption" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** "Bec wants to connect · Accept · Ignore". */
export function CrewRequests() {
  const s = useStore();
  const [noting, setNoting] = useState<string | null>(null);
  const reqs = s.crew?.requests ?? [];
  if (!reqs.length) return null;
  return (
    <div class="group crew-requests">
      {reqs.map((r) => (
        <div class="row crew-row" key={r.id}>
          <Initial name={r.name} />
          <div class="grow">
            <div>
              <b>{r.name}</b> wants to connect
            </div>
            {noting === r.id ? (
              <NoteEditor id={r.id} name={r.name} onDone={() => setNoting(null)} />
            ) : (
              <>
                <NoteLine id={r.id} onEdit={() => setNoting(r.id)} />
                <div class="sub">
                  You’d see each other’s games, not each other’s crews · {ago(r.at)}
                  {!s.crew?.notes?.[r.id] && (
                    <>
                      {' · '}
                      <button class="link inline-caption" onClick={() => setNoting(r.id)}>
                        Add note
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <button class="btn compact primary" onClick={() => void s.answerRequest(r.id, true)}>
            Accept
          </button>
          <button class="link" onClick={() => void s.answerRequest(r.id, false)}>
            Ignore
          </button>
        </div>
      ))}
    </div>
  );
}

/** Home screen: the latest few, and the way into "Your crew". */
export function CrewCard() {
  const s = useStore();
  if (!s.identity) return null;
  const feed = s.crew?.feed ?? [];
  if (!s.crewMates.length && !feed.some((p) => !p.you))
    return (
      <div class="crew-card">
        <CrewRequests />
        <div class="group crew-start">
          <div class="crew-start-text">
            Play alongside friends: see what they finish and try the same puzzles. Only the people you invite see your games.
          </div>
          <button class="btn compact primary" onClick={() => inviteFriend()}>
            Invite a friend
          </button>
          <button class="link" onClick={() => s.open({ kind: 'crew' })}>
            How it works
          </button>
        </div>
      </div>
    );
  const latest = feed.slice(0, 3);
  return (
    <div class="crew-card">
      <button class="crew-head" onClick={() => s.open({ kind: 'crew' })}>
        <span>Your crew</span>
        <span class="crew-head-more">See everyone ›</span>
      </button>
      <CrewRequests />
      <div class="group">
        <PlayingNow />
        {latest.map((p) => (
          <PlayRow key={p.id} p={p} />
        ))}
        {!latest.length && !s.pulse?.crew_playing?.length && (
          <div class="row">
            <span class="grow muted small">Nothing in the last two weeks. When someone in your crew finishes a game, it shows up here.</span>
          </div>
        )}
        <button class="row crew-invite" onClick={() => inviteFriend()}>
          <Icon name="plus" size={18} />
          <span class="grow">Invite a friend</span>
        </button>
      </div>
    </div>
  );
}

/** "Ash is playing now · Watch" rows — crew-mates with a game running. */
export function PlayingNow() {
  const s = useStore();
  const now = s.pulse?.crew_playing ?? [];
  return (
    <>
      {now.map((p) => (
        <div class="row crew-row" key={p.id}>
          <span class="crew-avatar live">{(p.name.trim()[0] ?? '?').toUpperCase()}</span>
          <div class="grow">
            <div>
              <b>{p.name}</b> is playing now
            </div>
            <div class="sub">
              <span class="pulse-dot" aria-hidden="true" />
              {p.watchable ? 'Ask to watch — they can say no' : 'Playing on their own'}
            </div>
          </div>
          {p.watchable && (
            <button class="btn compact" onClick={() => s.open({ kind: 'watch', id: p.id, name: p.name })}>
              Watch
            </button>
          )}
        </div>
      ))}
    </>
  );
}

/** Me and my crew, with the days each played this week. */
function People() {
  const s = useStore();
  const crew = s.crew;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [noting, setNoting] = useState<string | null>(null);
  if (!crew) return <p class="muted">Loading…</p>;
  const letter = (d: string) => 'SMTWTFS'[new Date(`${d}T12:00:00Z`).getUTCDay()];
  return (
    <>
      <div class="group">
        <div class="row crew-days-head">
          <span class="grow" />
          <span class="crew-dots">
            {crew.days.map((d) => (
              <i key={d}>{letter(d)}</i>
            ))}
          </span>
        </div>
        {crew.people.map((m) => (
          <div class="row crew-member" key={m.id}>
            <Initial name={m.name} />
            <div class="grow">
              <div>
                {m.name}
                {m.you && <span class="muted"> (you)</span>}
              </div>
              {!m.you && noting !== m.id && <NoteLine id={m.id} onEdit={() => setNoting(m.id)} />}
              {noting === m.id ? (
                <NoteEditor id={m.id} name={m.name} onDone={() => setNoting(null)} />
              ) : removing === m.id ? (
                <div class="sub">
                  Remove {m.name}? You’ll stop seeing each other.{' '}
                  <button class="link inline-caption" onClick={() => setRemoving(null)}>
                    Keep
                  </button>{' '}
                  <button
                    class="link inline-caption danger"
                    onClick={async () => {
                      setRemoving(null);
                      await s.removeFromCrew(m.id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div class="sub">
                  {m.last_at ? `last played ${ago(m.last_at)}` : 'not played yet'}
                  {editing && !m.you && (
                    <>
                      {' · '}
                      <button class="link inline-caption" onClick={() => (setNoting(m.id), setRemoving(null))}>
                        {crew.notes?.[m.id] ? 'Edit note' : 'Add note'}
                      </button>
                      {' · '}
                      <button class="link inline-caption danger" onClick={() => setRemoving(m.id)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <span class="crew-dots">
              {crew.days.map((d) => (
                <b key={d} class={m.played.includes(d) ? 'on' : ''} title={d} />
              ))}
            </span>
          </div>
        ))}
        {crew.waiting.map((w) => (
          <div class="row crew-member" key={w.id}>
            <Initial name={w.name} />
            <div class="grow">
              <div>{w.name}</div>
              {noting === w.id ? (
                <NoteEditor id={w.id} name={w.name} onDone={() => setNoting(null)} />
              ) : (
                <>
                  <NoteLine id={w.id} onEdit={() => setNoting(w.id)} />
                  <div class="sub">
                    Waiting for {w.name} to accept
                    {editing && (
                      <>
                        {' · '}
                        <button class="link inline-caption" onClick={() => setNoting(w.id)}>
                          {crew.notes?.[w.id] ? 'Edit note' : 'Add note'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        <button class="row crew-invite" onClick={() => inviteFriend()}>
          <Icon name="plus" size={18} />
          <span class="grow">Invite a friend</span>
        </button>
      </div>
      {(crew.people.length > 1 || crew.waiting.length > 0) && (
        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <button class="link inline-caption muted-link" onClick={() => (setEditing(!editing), setRemoving(null))}>
            {editing ? 'Finish editing' : 'Edit crew'}
          </button>
        </div>
      )}
    </>
  );
}

export function CrewSheet({ tab: initial, explain = false }: { tab?: 'recent' | 'favourites'; explain?: boolean }) {
  const s = useStore();
  const [tab, setTab] = useState<'recent' | 'favourites'>(initial ?? 'recent');
  const crew = s.crew;

  if (!s.identity)
    return (
      <Sheet title="Your crew">
        <HowCrewWorks open />
        <button class="btn primary" style={{ marginTop: 14 }} onClick={() => s.open({ kind: 'signIn' })}>
          Sign in to start your crew
        </button>
      </Sheet>
    );

  return (
    <Sheet title="Your crew">
      <HowCrewWorks open={explain || !s.crewMates.length} />
      <div style={{ height: 12 }} />
      <CrewRequests />
      <People />

      <div class="section-title">What they’ve been playing</div>
      <Segmented<'recent' | 'favourites'>
        options={[
          { value: 'recent', label: 'Recently played' },
          { value: 'favourites', label: 'Favourites' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'recent' ? (
        crew?.feed.length ? (
          <div class="group" style={{ marginTop: 12 }}>
            {crew.feed.map((p) => (
              <PlayRow key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <p class="muted" style={{ marginTop: 16 }}>
            Nothing in the last two weeks yet.
          </p>
        )
      ) : crew?.favourites.length ? (
        <>
          <p class="muted small" style={{ margin: '12px 2px 0' }}>
            Puzzles your crew enjoyed most in the last two months.{' '}
            <button class="link inline" onClick={() => s.open({ kind: 'everyone' })}>
              What everyone loved ›
            </button>
          </p>
          <div class="group" style={{ marginTop: 8 }}>
            {crew.favourites.map((f) => (
              <FavouriteRow key={`${f.puzzle_id ?? f.name}`} f={f} />
            ))}
          </div>
        </>
      ) : (
        <p class="muted" style={{ marginTop: 16 }}>
          No favourites yet. When someone rates a game 🙂 or 😍 after solving it, it appears here.
        </p>
      )}

      {s.crewMates.length > 0 && (
        <div class="crew-more">
          <button class="link" onClick={() => s.open({ kind: 'leaderboard', puzzleId: s.todayId })}>
            Times for today’s daily ›
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** "How was it?" on the Solved sheet. Two taps, both optional. */
export function RatePlay() {
  const s = useStore();
  const play = s.lastPlay;
  if (!play) return null;
  const learntLabel = play.techniques.length ? `Learn anything? (you used ${play.techniques.map(techniqueName).join(', ')})` : 'Learn anything?';
  return (
    <div class="rate">
      <div class="rate-q">How was it?</div>
      <div class="rate-opts">
        {FACES.map((f) => (
          <button
            key={f.v}
            class={`rate-btn${play.enjoyment === f.v ? ' on' : ''}`}
            aria-pressed={play.enjoyment === f.v}
            onClick={() => s.ratePlay({ enjoyment: f.v })}
          >
            <span class="face">{f.face}</span>
            {f.label}
          </button>
        ))}
      </div>
      <div class="rate-q">{learntLabel}</div>
      <div class="rate-opts">
        <button class={`rate-btn wide${play.learnt === true ? ' on' : ''}`} aria-pressed={play.learnt === true} onClick={() => s.ratePlay({ learnt: true })}>
          Yes
        </button>
        <button class={`rate-btn wide${play.learnt === false ? ' on' : ''}`} aria-pressed={play.learnt === false} onClick={() => s.ratePlay({ learnt: false })}>
          Not really
        </button>
      </div>
      <div class="muted small rate-note">
        {s.identity && s.crewMates.length > 0 ? 'Your crew sees this, not your time.' : 'Helps others find puzzles they’ll enjoy. No names, no times.'}
      </div>
    </div>
  );
}

/** "● 3 playing now · 14 solved today's daily" — anonymous, for everyone. Tapping opens Everyone. */
export function PulseLine() {
  const s = useStore();
  const p = s.pulse;
  if (!p || (p.playing_now === 0 && p.solved_today === 0)) return null;
  const bits: string[] = [];
  if (p.playing_now > 0) bits.push(`${p.playing_now} playing right now`);
  if (p.solved_today > 0) bits.push(`${p.solved_today} solved today’s daily`);
  return (
    <button class="pulse-line" onClick={() => s.open({ kind: 'everyone' })}>
      {p.playing_now > 0 && <span class="pulse-dot" aria-hidden="true" />}
      {bits.join(' · ')}
    </button>
  );
}

/** Everyone: live counts and the puzzles all players loved this week. No names. */
export function EveryoneSheet() {
  const s = useStore();
  const [data, setData] = useState<{ favourites: CrewFavourite[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api
      .everyone(s.token, deviceId())
      .then((r) => {
        s.pulse = { playing_now: r.playing_now, solved_today: r.solved_today };
        setData(r);
      })
      .catch(() => setFailed(true));
  }, []);
  const p = s.pulse;
  return (
    <Sheet title="Everyone">
      <div class="everyone-stats">
        <div>
          <b>{p?.playing_now ?? '–'}</b>
          <span>
            {p?.playing_now ? <span class="pulse-dot" aria-hidden="true" /> : null}playing right now
          </span>
        </div>
        <div>
          <b>{p?.solved_today ?? '–'}</b>
          <span>solved today’s daily</span>
        </div>
      </div>
      <div class="section-title">Most loved this week</div>
      {failed ? (
        <p class="muted">Couldn’t load this. Check your connection.</p>
      ) : !data ? (
        <p class="muted">Loading…</p>
      ) : data.favourites.length ? (
        <div class="group">
          {data.favourites.map((f) => (
            <FavouriteRow key={`${f.puzzle_id ?? f.name}`} f={f} />
          ))}
        </div>
      ) : (
        <p class="muted">Nothing rated yet this week. Rate a puzzle after you solve it and it could show up here.</p>
      )}
      <p class="muted small" style={{ marginTop: 14 }}>
        Everyone who plays Sudoku Crew, counted without names.
      </p>
    </Sheet>
  );
}
