// The crew (Nov 2026): what friends in your groups have just finished, how
// they found it, and their favourites — so you get curious and try the same
// board. Deliberately not competitive: no times, no ranks. Plus the two-tap
// "How was it?" on the Solved sheet that feeds it.

import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from '../app/store';
import { api, type CrewFavourite, type CrewGroup, type CrewPlay, type Enjoyment } from '../lib/api';
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

export function inviteFriend(groupId?: string): void {
  track('feature', { f: 'invite' });
  const { text, url } = store.inviteLink(groupId);
  void shareText(text, url);
}

const WHAT_IS_A_CREW = "Your crew is the people whose games you see, and who see yours. No scores, no pressure — just what everyone's playing.";

/** Home screen: the latest few, and the way into "Your crew". */
export function CrewCard() {
  const s = useStore();
  if (!s.identity) return null;
  if (!s.groups.length)
    return (
      <div class="crew-card">
        <div class="group crew-start">
          <div class="crew-start-text">Play alongside friends: see what they finish and try the same puzzles.</div>
          <button class="btn compact" onClick={() => s.open({ kind: 'crew' })}>
            Start your crew
          </button>
        </div>
      </div>
    );
  const feed = s.crew?.feed ?? [];
  const latest = feed.slice(0, 3);
  return (
    <div class="crew-card">
      <button class="crew-head" onClick={() => s.open({ kind: 'crew' })}>
        <span>Your crew</span>
        <span class="crew-head-more">See everyone ›</span>
      </button>
      <div class="group">
        {latest.map((p) => (
          <PlayRow key={p.id} p={p} />
        ))}
        {!latest.length && (
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

/** One crew: who's in it and the days each played this week. */
function Members({ g }: { g: CrewGroup }) {
  const letter = (d: string) => 'SMTWTFS'[new Date(`${d}T12:00:00Z`).getUTCDay()];
  return (
    <div class="group">
      <div class="row crew-days-head">
        <span class="grow" />
        <span class="crew-dots">
          {g.days.map((d) => (
            <i key={d}>{letter(d)}</i>
          ))}
        </span>
      </div>
      {g.members.map((m, i) => (
        <div class="row crew-member" key={i}>
          <Initial name={m.name} />
          <div class="grow">
            <div>
              {m.name}
              {m.you && <span class="muted"> (you)</span>}
            </div>
            <div class="sub">{m.last_at ? `last played ${ago(m.last_at)}` : 'not played yet'}</div>
          </div>
          <span class="crew-dots">
            {g.days.map((d) => (
              <b key={d} class={m.played.includes(d) ? 'on' : ''} title={d} />
            ))}
          </span>
        </div>
      ))}
      <button class="row crew-invite" onClick={() => inviteFriend(g.id)}>
        <Icon name="plus" size={18} />
        <span class="grow">Invite a friend to {g.name}</span>
      </button>
    </div>
  );
}

export function CrewSheet({ tab: initial }: { tab?: 'recent' | 'favourites' }) {
  const s = useStore();
  const [tab, setTab] = useState<'recent' | 'favourites'>(initial ?? 'recent');
  const [which, setWhich] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const crew = s.crew;

  if (!s.identity)
    return (
      <Sheet title="Your crew">
        <p class="muted">{WHAT_IS_A_CREW}</p>
        <button class="btn primary" onClick={() => s.open({ kind: 'signIn' })}>
          Sign in to start your crew
        </button>
      </Sheet>
    );

  if (!s.groups.length)
    return (
      <Sheet title="Your crew">
        <p class="muted">{WHAT_IS_A_CREW}</p>
        <div class="stack">
          <button
            class="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await s.startCrew();
              setBusy(false);
            }}
          >
            <Icon name="users" size={20} /> {busy ? 'Starting…' : 'Start your crew'}
          </button>
          <button class="link" onClick={() => s.open({ kind: 'groupOnboarding', mode: 'join' })}>
            Have a code from a friend? Join their crew
          </button>
        </div>
      </Sheet>
    );

  const groups = crew?.groups ?? [];
  const g = groups[Math.min(which, groups.length - 1)];
  return (
    <Sheet title="Your crew">
      <p class="muted small" style={{ margin: '2px 2px 12px' }}>
        {WHAT_IS_A_CREW}
      </p>
      {groups.length > 1 && (
        <div class="crew-picker">
          {groups.map((x, i) => (
            <button key={x.id} class={`chip${i === which ? ' on' : ''}`} onClick={() => (setWhich(i), setLeaving(false), setRenaming(null))}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      {g ? <Members g={g} /> : <p class="muted">Loading…</p>}

      <div class="section-title">What they've been playing</div>
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

      <div class="crew-more">
        {g?.can_rename &&
          (renaming === null ? (
            <button class="link" onClick={() => setRenaming(g.name)}>
              Rename {g.name}
            </button>
          ) : (
            <form
              class="crew-rename"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await s.renameCrew(g.id, renaming)) setRenaming(null);
              }}
            >
              <input
                class="field"
                value={renaming}
                maxLength={64}
                aria-label="Crew name"
                autoFocus
                onInput={(e) => setRenaming(e.currentTarget.value)}
              />
              <button class="btn compact primary" type="submit" disabled={!renaming.trim()}>
                Save
              </button>
              <button class="link" type="button" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <div class="muted small" style={{ width: '100%', textAlign: 'center' }}>
                Everyone in the crew sees this name.
              </div>
            </form>
          ))}
        <button class="link" onClick={() => s.open({ kind: 'groupOnboarding', mode: 'join' })}>
          Join another crew with a code
        </button>
        {g &&
          (leaving ? (
            <span class="crew-leave">
              Leave {g.name}? You'll stop seeing their games.{' '}
              <button class="link" onClick={() => setLeaving(false)}>
                Keep
              </button>{' '}
              <button
                class="link danger"
                onClick={async () => {
                  setLeaving(false);
                  setWhich(0);
                  await s.leaveCrew(g.id);
                }}
              >
                Leave
              </button>
            </span>
          ) : (
            <button class="link muted-link" onClick={() => setLeaving(true)}>
              Leave {g.name}
            </button>
          ))}
      </div>
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
        {s.identity && s.groups.length > 0 ? 'Your crew sees this, not your time.' : 'Helps others find puzzles they’ll enjoy. No names, no times.'}
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
