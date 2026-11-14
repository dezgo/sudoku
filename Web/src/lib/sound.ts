// Sound cues (SPEC §13.12) — the same CC0 Kenney clips as the apps.
// Web Audio rather than <audio>: lower latency for rapid placements, and
// several cues can overlap.
//
// iOS is strict about web audio, and two of its rules bit us (25 Oct 2026:
// sound worked in one game, then went silent after the app was restarted):
//  - An AudioContext only starts from a "real" gesture — touchend / click /
//    keydown. The board places digits on pointerdown so entry feels instant,
//    and pointerdown doesn't count, so a context first created there stays
//    silent forever. We unlock on the first qualifying gesture anywhere.
//  - Leaving the app moves the context to "interrupted" (not "suspended"),
//    and it needs resuming from a gesture again. Any state but "running"
//    is resumed on the next gesture.

import type { SoundCue } from '../engine/game';

const FILES: Record<SoundCue, string> = {
  place: 'place.m4a',
  erase: 'erase.m4a',
  mistake: 'mistake.m4a',
  unitComplete: 'unit_complete.m4a',
  solved: 'solved.m4a',
  // Pencil marks reuse the placement click, played quieter (and lower for
  // removal) so notes feel lighter than real digits and never sound wrong.
  noteOn: 'place.m4a',
  noteOff: 'place.m4a',
};

const TUNING: Partial<Record<SoundCue, { gain: number; rate: number }>> = {
  noteOn: { gain: 0.35, rate: 1.15 },
  noteOff: { gain: 0.3, rate: 0.85 },
};

let ctx: AudioContext | null = null;
const buffers = new Map<SoundCue, AudioBuffer>();
let loading: Promise<void> | null = null;
// Set when the app comes back to the foreground: iOS can hand back a context
// that claims "running" but plays nothing (14 Nov 2026: a whole game silent
// with sound on). The next gesture swaps in a fresh context — cheap, because
// decoded clips aren't tied to a context and are reused.
let stale = false;
let resumeTried = false;

/** Fetch + decode any cue not loaded yet. A failed fetch (flaky network on
 *  first launch) is retried on the next unlock instead of staying silent. */
function load(c: AudioContext): void {
  if (loading) return;
  const missing = (Object.keys(FILES) as SoundCue[]).filter((cue) => !buffers.has(cue));
  if (!missing.length) return;
  loading = Promise.all(
    missing.map(async (cue) => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}sounds/${FILES[cue]}`);
        if (!resp.ok) return;
        buffers.set(cue, await c.decodeAudioData(await resp.arrayBuffer()));
      } catch {
        /* stays missing — retried on a later gesture */
      }
    }),
  ).then(() => {
    loading = null;
  });
}

function freshContext(): AudioContext {
  try {
    void ctx?.close();
  } catch {
    /* already gone */
  }
  // "ambient" (iOS 17+): respects the silent switch and mixes with music
  // or podcasts instead of pausing them — same as the iOS app.
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'ambient';
  return new AudioContext();
}

function unlock(): void {
  try {
    // Anything but a healthy context gets replaced, here inside the gesture
    // where iOS allows a new one to start: none yet, back from the
    // background, "interrupted" (a call, Siri, another app's audio), closed,
    // or a resume from an earlier tap that never took.
    const state = ctx?.state as string | undefined;
    if (!ctx || stale || state === 'interrupted' || state === 'closed' || (state === 'suspended' && resumeTried)) {
      ctx = freshContext();
      stale = false;
      resumeTried = false;
    }
    load(ctx);
    if (ctx.state !== 'running') {
      resumeTried = true;
      void ctx.resume().then(() => {
        if (ctx?.state === 'running') resumeTried = false;
      });
      // A silent one-sample buffer, played inside the gesture, is what
      // actually unlocks output on iOS.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start();
    }
  } catch {
    /* no audio support */
  }
}


for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stale = true;
});
window.addEventListener('pageshow', () => {
  stale = true;
});

export function playSound(cue: SoundCue): void {
  try {
    if (!ctx) return; // not unlocked yet — the next real tap will do it
    if (ctx.state !== 'running') void ctx.resume();
    const buf = buffers.get(cue);
    if (!buf) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const tune = TUNING[cue];
    gain.gain.value = tune?.gain ?? 0.6;
    src.playbackRate.value = tune?.rate ?? 1;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* no audio support — silently skip */
  }
}
