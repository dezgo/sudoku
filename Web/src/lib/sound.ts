// Sound cues (SPEC.md §13.12) — the same CC0 Kenney clips as the apps.
// Web Audio rather than <audio>: lower latency for rapid placements, and
// several cues can overlap. iOS Safari keeps the AudioContext suspended until
// a user gesture, so it's created lazily on the first cue (always a tap).

import type { SoundCue } from '../engine/game';

const FILES: Record<SoundCue, string> = {
  place: 'place.m4a',
  erase: 'erase.m4a',
  mistake: 'mistake.m4a',
  unitComplete: 'unit_complete.m4a',
  solved: 'solved.m4a',
};

let ctx: AudioContext | null = null;
const buffers = new Map<SoundCue, AudioBuffer>();
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (loading) return loading;
  const c = ctx!;
  loading = Promise.all(
    (Object.keys(FILES) as SoundCue[]).map(async (cue) => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}sounds/${FILES[cue]}`);
        buffers.set(cue, await c.decodeAudioData(await resp.arrayBuffer()));
      } catch {
        /* a missing cue just stays silent */
      }
    }),
  ).then(() => undefined);
  return loading;
}

export function playSound(cue: SoundCue): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const buf = buffers.get(cue);
    if (!buf) {
      // First cue of the session: start loading; this one plays once decoded.
      void load().then(() => playSound(cue));
      return;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* no audio support — silently skip */
  }
}
