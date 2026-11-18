// The crew (Nov 2026): what friends in your groups have just finished, how
// they found it, and their favourites — so you get curious and try the same
// board. Deliberately not competitive: no times, no ranks. Plus the two-tap
// "How was it?" on the Solved sheet that feeds it.

import { useState } from 'preact/hooks';
import { store, useStore } from '../app/store';
import type { CrewFavourite, CrewPlay, Enjoyment } from '../lib/api';
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
          <b>{p.who}</b> finished {what(p)}
        </div>
        <div class="sub">{bits.join(' · ')}</div>
      </div>
      <TryButton done={p.done} onClick={() => store.tryFromCrew(p)} />
    </div>
  );
}

function FavouriteRow({ f }: { f: CrewFavourite }) {
  const bits: string[] = [];
  if (f.loved) bits.push(`😍 × ${f.loved}`);
  if (f.learnt) bits.push(`${f.learnt} learnt something`);
  bits.push(f.names.slice(0, 3).join(', ') + (f.names.length > 3 ? ` +${f.names.length - 3}` : ''));
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

/** Home screen: the latest few, and a way into the rest. Only when signed in and in a group. */
export function CrewCard() {
  const s = useStore();
  if (!s.identity || !s.groups.length || !s.crew) return null;
  const { feed, favourites } = s.crew;
  const latest = feed.slice(0, 3);
  return (
    <div class="crew-card">
      <div class="crew-head">
        <span>From your crew</span>
        {(feed.length > 3 || favourites.length > 0) && (
          <button class="link" onClick={() => s.open({ kind: 'crew' })}>
            {favourites.length ? 'Favourites & more' : 'See all'}
          </button>
        )}
      </div>
      <div class="group">
        {latest.map((p) => (
          <PlayRow key={p.id} p={p} />
        ))}
        {!latest.length && (
          <div class="row">
            <span class="grow muted small">When someone in your group finishes a game, it shows up here so you can try it too.</span>
          </div>
        )}
        <button class="row crew-invite" onClick={inviteFriend}>
          <Icon name="plus" size={18} />
          <span class="grow">Invite a friend to your crew</span>
        </button>
      </div>
    </div>
  );
}

export function CrewSheet({ tab: initial }: { tab?: 'recent' | 'favourites' }) {
  const s = useStore();
  const [tab, setTab] = useState<'recent' | 'favourites'>(initial ?? 'recent');
  const crew = s.crew;
  return (
    <Sheet title="Your crew">
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
            Nothing in the last two weeks yet. Games your group finishes show up here.
          </p>
        )
      ) : crew?.favourites.length ? (
        <>
          <p class="muted small" style={{ margin: '12px 2px 0' }}>
            Puzzles your crew enjoyed most in the last two months.
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
      {s.groups.length > 0 && <div class="muted small rate-note">Your group sees this, not your time.</div>}
    </div>
  );
}
