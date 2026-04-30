# Sudoku — iOS Status

_Last updated: 2026-04-29_

A SwiftUI iOS Sudoku app. Single-target Xcode project. iOS 18.5 deployment.

## Shipped

### Gameplay
- 9×9 board with tap-to-select cells.
- Number pad (1–9) for entry, plus Erase/Undo and a Pencil toggle for notes.
- Normal mode and pencil/notes mode (multiple small numbers per cell).
- Fixed (given) vs user-entered numbers; user-entered correct numbers auto-lock and render bold.
- Pencil notes auto-clear in row/col/box peers when a real value is placed; Undo restores them.
- Tap-to-highlight: tapping a pad number with no selection (or a filled selected cell) jumps to a cell containing that number.
- Numbers fully placed (9×) drop out of the pad; "Highlight mistakes" makes that count valid placements only.

### Visuals
- Selected cell highlighted in yellow.
- Same-number cells highlighted in blue (matching tint).
- Row/column/box of selected cell + rows/cols/boxes of the selected number tinted lighter (gated by "Highlight rules").
- "Highlight rules" also tints every filled cell so empty candidate cells stand out.
- Mistakes shown in red (solution-based — catches wrong placements that don't yet conflict by rule).
- Light / Dark / System theme picker.

### Game management
- Timer with pause (board hidden when paused, no input accepted).
- Mistake counter beside the timer (only shown when "Highlight mistakes" is on).
- Reset (returns to givens) and New Game (silently autosaves current, picks fresh puzzle excluding completed + in-progress).
- Difficulty: Easy / Medium / Hard, persisted via `@AppStorage`.
- Autosave to UserDefaults on every state change; auto-resume the most recent in-progress save on launch.
- Games sheet with two sections: In Progress (tap to resume) and Completed (tap to view solved board read-only).
- Completion history persisted with timestamp, elapsed time, and full puzzle snapshot for replay viewing.

### Identity, groups, and networking (Phase 1)
- Email + 6-digit OTP sign-in via the Sudoku backend at `sudoku.appfoundry.cc`. Bearer token stored in Keychain.
- Multi-step sign-in sheet (email → code → display name → create-or-join-a-group).
- Anonymous play allowed; signing in is optional, surfaced via "Sign in" chip top-left and Settings → Account.
- Multiple groups per user. Create a group → 6-char invite code shown + shareable. Join with a code. Settings → Groups lists all your groups with member counts and invite codes (each row has a Share button).
- Daily puzzle is **fetched from the server** (server-side generation in Sydney timezone). Today + tomorrow are cached locally so the daily works offline once fetched. If the network is unreachable on first launch, falls back to the local generator (flagged unranked; will not post a score).
- App refreshes daily + groups on foreground (`scenePhase == .active` when signed in) so changes from another device propagate without a kill+relaunch.

## Architecture

| File | Role |
|---|---|
| `SudokuApp.swift` | App entry; instantiates `AuthStore`, `GroupsStore`, `DailyPuzzleStore` and injects them via environment. |
| `ContentView.swift` | Root view; phase routing (home / playing); presents sign-in, settings, history, new-game, solved sheets; refresh-on-foreground hooks. |
| `BoardView.swift` | 9×9 grid layout, grid lines, pause cover. |
| `CellView.swift` | Single cell rendering: backgrounds, value vs notes, locked/error styling. |
| `NumberPadView.swift` | 1–9 buttons, Pencil toggle, dynamic Erase/Undo button. |
| `SudokuGame.swift` | All game state and logic (`ObservableObject`). Cells, selection, modes, highlighting helpers, conflict / solve detection, autosave hooks, undo bookkeeping. `startDaily(puzzle:)` overload accepts a server-resolved daily. |
| `SudokuPuzzle.swift` | `Difficulty` enum, `Puzzle` Codable struct, hand-curated source puzzles. |
| `PuzzleProvider.swift` | `PuzzleProvider` protocol + `HardcodedPuzzleProvider` (kept for previews / tests). |
| `PuzzleGenerator.swift` | `GeneratedPuzzleProvider` + `SudokuGridGenerator` + `SudokuSolver`. Used for non-daily puzzles and as the offline-fallback daily generator. |
| `SeededRNG.swift` | Linear-congruential RNG. |
| `DailyPuzzle.swift` | YYYYMMDD → daily ID + seed (now mostly used by the offline-fallback path). |
| `PuzzleHistory.swift` | Completed-puzzle records persisted to UserDefaults. |
| `GameStore.swift` | In-progress saves keyed by puzzle ID. |
| `HistoryView.swift` | Games sheet; in-progress + completed sections. |
| `CompletedBoardView.swift` | Read-only solved-board view. |
| `HomeView.swift` | Landing screen. Daily / Continue / New Game / Games / Settings. Identity chip top-left; "Sign in" button when signed out, display name when signed in. |
| `SettingsView.swift` | Highlight toggles + theme picker + **Account** section (sign in / sign out) + **Groups** section (list, invite codes, share, leave, add-a-group). |
| `SolvedView.swift` | Fanfare sheet on completion. |
| `NewGameSheet.swift` | Difficulty picker. |
| `APIClient.swift` | Async HTTP client (URLSession + JSON) for the backend. Pure functions per endpoint; no auth state of its own. |
| `Keychain.swift` | Tiny wrapper over Security framework for the bearer token. |
| `AuthStore.swift` | `ObservableObject` for token + signed-in user. Sign-in/verify/setDisplayName/sign-out. Persists via Keychain (token) and UserDefaults (cached user). |
| `GroupsStore.swift` | `ObservableObject` for the user's groups. Refresh / create / join / leave. Cache in UserDefaults. |
| `DailyPuzzleStore.swift` | Coordinates daily fetch + cache + offline fallback. `ensureToday()` returns `(Puzzle, isOffline)`. |
| `SignInView.swift` | Multi-step sign-in sheet (email → code → display name → group onboarding). |
| `GroupOnboardingView.swift` | Create-or-join-a-group sheet content; shows the invite code with `ShareLink` after creation. |

### Persistence keys

| Key | Backing store | Contents |
|---|---|---|
| `sudoku.history.v1` | UserDefaults | Completed games (`PuzzleResult` array). |
| `sudoku.saves.v1` | UserDefaults | In-progress saves keyed by `puzzle.id`. |
| `sudoku.difficulty` | UserDefaults | Preferred difficulty. |
| `sudoku.appearance` | UserDefaults | Theme override (System/Light/Dark). |
| `sudoku.identity.v1` | UserDefaults | Cached signed-in user (id, display name). |
| `api-token` (account) | **Keychain** | Bearer token for the API. |
| `sudoku.groups.v1` | UserDefaults | Cached `[GroupListItem]` (group + member count + invite code). |
| `sudoku.daily_cache.v1` | UserDefaults | Cached today + tomorrow puzzles + `fetched_at`. |
| `sudoku.pending_scores.v1` | UserDefaults | Reserved for Phase 2 — score POSTs queued when offline. |

### Notes / known caveats
- Production puzzles come from `GeneratedPuzzleProvider`; generated puzzle IDs start at 1000 to avoid colliding with the 1–21 hardcoded range that may exist in older saves/history.
- `lastPlacementInfo` (Undo target) is in-memory only; closing the app forfeits Undo for the most recent placement.
- Conflict detection prefers solution-mismatch for user cells when a solution is known.
- First New Game after a fresh launch can briefly block (1–2s) if the per-difficulty buffer hasn't filled yet.
- Daily fetched from server in `Australia/Sydney` timezone for v1 — devices in other timezones may see a ±1 day skew (SPEC §17.6 — per-group timezones are deferred).
- Offline-fallback daily is **not** byte-identical to the server's daily; any solve against a fallback puzzle is unranked and will not post a score (Phase 2).

## Roadmap

1. **Phase 2 — Leaderboards.** Score POST on solve, leaderboard sheet showing per-group ranking for today's daily, pending-scores queue for offline solves.
2. **Phase 2.5 — Username + invite-by-username.** Replace invite-code-as-primary with searchable usernames; keep codes as fallback.
3. **TestFlight distribution.** Requires Apple Developer Program ($99/yr).
4. **Polish.** Per-group timezone, solution-based vs rule-based mistake toggle, cross-session Undo, per-tier dailies.
