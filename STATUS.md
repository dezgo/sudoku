# Sudoku — Project Status

Two platforms targeting the same behavioural contract in [`SPEC.md`](SPEC.md).

| Layout | Contents |
|---|---|
| [`SPEC.md`](SPEC.md) | Platform-agnostic spec (data model, rules, screens, persistence, daily, generator). The canonical contract both apps follow. |
| [`iOS/`](iOS/) | SwiftUI app. See [`iOS/STATUS.md`](iOS/STATUS.md) for the implementation map. |
| [`Android/`](Android/) | Jetpack Compose app. See [`Android/README.md`](Android/README.md) for build instructions and source layout. |

## Where things stand

**iOS** — feature-complete per the spec. App icon wired up; home / playing / games / settings screens all working. Daily puzzles deterministic per-device. Distribution path: TestFlight.

**Android** — scaffolded and code-complete per the spec, *not yet built or run*. The project is ready to open in Android Studio, which will auto-generate the Gradle wrapper on first sync. Nothing's been verified to compile or run on a device yet — see Android/README.md for the open/build flow. Distribution path: Google Play internal-test track.

## Roadmap

1. **Build + smoke-test the Android app.** Open in Android Studio, sync, run on emulator/device. Fix anything that doesn't compile or behave per spec.
2. **Cross-platform daily verification.** The seeded RNG produces the same numeric stream on both platforms, but the higher-level generator algorithms (random `shuffled(rng)` and recursion) may walk through state in different orders, so today's daily on iOS and today's daily on Android are not guaranteed identical. To make the daily *truly shared* across platforms, we'll need either: (a) a small shared backend that hands out the day's puzzle, or (b) a stricter deterministic generator we control end-to-end. Option (b) is doable in pure code if we insist on identical iteration order.
3. **Leaderboards.** Once dailies are platform-identical, add a small shared backend (Firebase / Supabase / Cloudflare Worker + KV) to receive scores and serve a leaderboard. iOS and Android post the same `(puzzle_id, elapsed_seconds, display_name)` payload.
4. **Distribution.** TestFlight (iOS) and Play internal-test (Android) for the friend group.
5. **Polish bucket.** Settings toggle for solution-based vs rule-based mistake highlighting; cross-session Undo persistence; per-tier dailies; possibly UTC vs local-calendar daily switch.
