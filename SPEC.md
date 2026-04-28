# Sudoku App Specification

This document is the **platform-agnostic behavioural contract** for the Sudoku app. The iOS implementation (in `/Sudoku/Sudoku/`) is the reference; this spec defines what *any* implementation must do — used to drive an Android port and any future versions.

If a behaviour isn't here, it isn't part of the contract: feel free to choose the most natural pattern on the target platform.

---

## 1. Vision

A small, tight Sudoku app intended to be sent to a friend group. The core loop is the **daily puzzle**: every device shows the same puzzle on a given calendar date, and friends compare completion times on a shared leaderboard. The single-player game (random puzzles at three difficulty tiers) is fully featured but is a side-mode to the daily.

Distribution is via TestFlight (iOS) and Google Play internal-test track (Android). Not a public app-store launch.

---

## 2. Core Sudoku Rules

Standard 9×9 Sudoku:

- Grid is 9 rows × 9 columns, divided into nine 3×3 boxes.
- Each row, column, and box must contain digits 1–9 exactly once when complete.
- A puzzle has a set of fixed *given* cells (the starting state) and the rest are blank, to be filled by the user.
- A puzzle has a unique solution.

---

## 3. Data Model

### `Cell`

| Field    | Type         | Meaning                                                    |
|----------|--------------|------------------------------------------------------------|
| value    | int? (1–9)   | The cell's main digit, or absent (blank).                  |
| isFixed  | bool         | True if this cell came from the puzzle's givens.           |
| notes    | set of int   | Pencil marks (1–9), only meaningful when value is absent.  |

### `Puzzle`

| Field      | Type            | Meaning                                                    |
|------------|-----------------|------------------------------------------------------------|
| id         | int             | Stable identifier. Generated puzzles use ≥1000; daily uses YYYYMMDD. |
| difficulty | enum (E/M/H)    | Easy, Medium, or Hard.                                     |
| givens     | int[9][9]       | Starting grid. 0 = blank.                                  |
| solution   | int[9][9]?      | The completed solution. Optional only for unsourced puzzles; in this app, always present. |

### `GameSave` (in-progress snapshot)

| Field          | Type          | Meaning                                            |
|----------------|---------------|----------------------------------------------------|
| puzzle         | Puzzle        | Embedded so saves don't depend on the provider.    |
| cells          | Cell[9][9]    | Current state of all cells.                        |
| elapsedSeconds | int           | Timer at last save.                                |
| mistakeCount   | int           | Cumulative incorrect placements this session.      |
| lastPlayedAt   | timestamp     | Most-recent interaction time. Used for sort order. |

### `PuzzleResult` (completed record)

| Field          | Type      | Meaning                                                  |
|----------------|-----------|----------------------------------------------------------|
| id             | uuid      | Stable record id.                                        |
| puzzleID       | int       | Matches `Puzzle.id`.                                     |
| completedAt    | timestamp | When the puzzle was solved.                              |
| elapsedSeconds | int       | Time to completion.                                      |
| puzzle         | Puzzle?   | Embedded so the completed grid can be rendered later. Optional for backwards compatibility with old records. |

---

## 4. Persistence

The app persists across launches:

- **In-progress saves** keyed by `puzzle.id`. Multiple saves can exist concurrently (one per puzzle the user has touched).
- **Completion history** as an ordered list of `PuzzleResult`, newest first.
- **User preferences**: difficulty, appearance (System/Light/Dark), highlighting toggles.

The runtime in-memory state (current selection, last placement / undo info, paused flag) is **not** persisted across launches — closing the app forfeits Undo for the most recent placement.

Storage format is JSON-encoded; the iOS reference uses `UserDefaults` keyed as:

| Key                     | Contents                                                          |
|-------------------------|-------------------------------------------------------------------|
| `sudoku.history.v1`     | Array of `PuzzleResult`.                                          |
| `sudoku.saves.v1`       | Map of `puzzle.id` → `GameSave`.                                  |
| `sudoku.difficulty`     | Difficulty enum raw value.                                        |
| `sudoku.appearance`     | Appearance enum raw value (system/light/dark).                    |

Any equivalent platform-native key/value store (Android `DataStore`, web `localStorage`) is fine.

---

## 5. Difficulty Tiers

Three tiers, identified by hint count targets after uniqueness-preserving cell removal:

| Tier   | Target givens | Notes                                                         |
|--------|---------------|---------------------------------------------------------------|
| Easy   | 48            | Gentle introduction.                                          |
| Medium | 32            | Default tier.                                                 |
| Hard   | 26            | Sparser; cell removal may stop above the target if uniqueness can't be preserved further. |

The user's preferred tier persists; default is Medium.

---

## 6. Puzzle Generation

A puzzle is produced by:

1. **Generate a random fully-solved 9×9 grid** via backtracking with shuffled digit order at each step. The first empty cell is filled, recursing.
2. **Carve out a puzzle** by visiting cells in random order and removing each one *only if* the resulting grid still has a unique solution. Stop when the target hint count for the difficulty is reached or no more cells can be removed without ambiguity.
3. The full pre-removal grid becomes `solution`; the carved grid becomes `givens`.

For responsiveness the generator should keep a small per-tier buffer of pre-built puzzles (background queue, lazy-fill). 3 puzzles per tier is a reasonable buffer size. A synchronous fallback is acceptable on first launch before the buffer fills.

### Solver

The uniqueness check is a backtracking solver with the **Minimum Remaining Values** heuristic — at each step, branch on the empty cell with the fewest legal candidates. The solver stops once it has found 2 solutions; the puzzle is unique iff exactly 1 is found.

The solver doubles as the engine that knows whether a placement matches the solution (used for mistake highlighting and locking).

---

## 7. Daily Puzzle

A single shared puzzle per calendar date, identical across devices.

- **Date** is the device's local calendar date (year/month/day).
- **ID** is `YYYYMMDD` (e.g. 2026-04-28 → 20260428).
- **Seed** is a 64-bit value derived from the ID, multiplied by a large odd constant to spread bits.
- The same generator (above) is run with a deterministic RNG seeded from this value, so any two devices on the same date produce identical givens and solution.
- Difficulty is fixed (currently Medium).
- Today's daily should be pre-warmed in the cache at app launch so opening it is instant.

The daily uses the same in-progress save / history flow as any other puzzle (its ID happens to be in the YYYYMMDD range).

---

## 8. Highlighting (visual hierarchy)

Cells are tinted based on the current selection and the user's preferences. The visual hierarchy is layered, with each level overriding lower ones:

| Layer | Trigger                                                                 | Tint                       |
|-------|-------------------------------------------------------------------------|----------------------------|
| 1     | Selected cell.                                                          | Yellow / warm (strongest). |
| 2     | Cells holding the **same number** as the selected cell (matching).      | Medium accent (cool).      |
| 3a    | Cells in the same row, column, **or 3×3 box** as the selected cell.     | Light accent.              |
| 3b    | (only when "Highlight rules" is **on**) Cells in any row, col, or box that already contains the selected cell's value — i.e., where that value can't legally go. | Light accent.              |
| 3c    | (only when "Highlight rules" is **on**) Cells that are already filled with **any** value — they're unavailable for the selected number regardless. | Light accent.              |
| 4     | (only when "Highlight mistakes" is **on**) The cell's text is red if the cell has a value that doesn't match the puzzle's solution. (For fixed cells, falls back to row/col/box rule check.) | Red text (overrides text colour, not background). |

The selection-based highlighting (layers 1–3a) always applies once a cell is selected. The "rules" highlighting (3b, 3c) is gated on the user's "Highlight rules" preference. Mistake highlighting is gated on the "Highlight mistakes" preference.

A green seal-style icon is shown next to the puzzle title when the grid is fully solved.

---

## 9. Input Behaviour

**Selection.** Tapping a cell selects it. Tapping a different cell deselects the prior. The selection is the focus point for all highlighting.

**Number pad (1–9).** Behaviour depends on what's selected:

- **No selection, or selected cell already has a value** → tap-to-highlight: jump the selection to the first cell on the board containing that number (row-major scan). If no such cell exists, no-op. This applies in both normal and pencil mode.
- **Empty cell selected, normal mode** → write that number into the cell as a real value.
- **Empty cell selected, pencil mode** → toggle that number in the cell's notes.

A pad button is **disabled and visually hidden (slot preserved for layout)** once the digit has 9 valid placements on the board (i.e., the number is "complete"). When "Highlight mistakes" is on, conflicting placements don't count toward 9.

**Mode toggle.** A button toggles between Normal and Pencil mode. Pencil mode adds/removes pencil marks instead of writing real values.

**Erase / Undo button.** A single button that adapts:

- **Disabled** when there's nothing to clear in the selected cell, or the cell is locked (see §10).
- **Label = "Undo"** when the selected cell is the most-recent-placement *and* is still undoable (not locked) *and* "Highlight mistakes" is on. Tapping it reverts that placement: clears the cell's value, restores its prior pencil notes, and **restores any pencil notes auto-cleared from peer cells** at the time of placement (§10).
- **Label = "Erase"** otherwise. Tapping clears the selected cell's value and notes.

The undo state is per-most-recent-placement only; navigating away clears it. Cross-session Undo is not required.

---

## 10. Locking & Auto-Note-Clearing

When **"Highlight mistakes" is on**:

- A user-entered cell that matches the solution is **locked** — it cannot be changed or erased. Visually, locked cells render in the same bold weight as fixed cells. (Reset still unlocks them by reloading from givens.)
- When a user places a *new* value (not pencil), every peer cell (same row, column, or 3×3 box) has that number removed from its pencil notes. The set of peers from which notes were cleared is captured as part of the undo info, so pressing Undo restores them.

When **"Highlight mistakes" is off**:

- No auto-locking — only fixed cells from the givens are locked.
- Pencil-clearing on placement still happens (it's a quality-of-life feature, not a hint); Undo still restores them.

---

## 11. Mistakes

A *mistake* is a user-entered value that doesn't match the puzzle's solution.

- The mistake counter increments by 1 each time the user places a value (in normal mode, into a non-locked empty cell) that is wrong, **only when "Highlight mistakes" is on**. Counter resets on Reset/New Game.
- Mistake feedback is solution-based: any non-matching value is flagged in red, even if it doesn't currently violate a row/col/box rule. This catches "wrong but not yet conflicting" placements that would lead to an unsolvable state.
- Fixed cells fall back to a rule-based check (row/col/box duplicates) — relevant only if a generator ever produces a malformed puzzle; in normal use, fixed cells are always correct.

---

## 12. Timer

- Counts elapsed seconds while a puzzle is being played.
- **Pauses when:**
  - The user manually taps the pause button.
  - The user navigates from the playing screen to home.
  - The app moves to background or inactive lifecycle state (auto-pause).
- **Resumes when:**
  - The user manually unpauses.
  - The user re-enters the playing screen (from home, Continue, Games, or New Game).
  - The app returns to active **and** the pause was an auto-pause (a manual pause isn't auto-cleared).
- Stops permanently (no further increment) when the puzzle is solved.

The timer's value is included in saves and history records.

---

## 13. Screens & Navigation

The app has two top-level **phases**:

- **Home** — landing screen on launch and after solving.
- **Playing** — the board view.

Plus a small set of modal sheets that can appear over either phase.

### 13.1 Home screen

Shows, in order:

1. **Daily Puzzle button** — featured, at the top. Three states:
   - *Not started today* — "Daily Puzzle" with subtitle = today's date.
   - *In progress today* — "Resume Daily" with subtitle = date + elapsed time.
   - *Completed today* — disabled, "Daily Done" with subtitle = "already played".
2. **Continue button** — only shown if the most-recent in-progress save is *not* today's daily (otherwise Daily already covers it). Subtitle shows puzzle ID, difficulty, elapsed time.
3. **New Game button** — opens the New Game sheet (difficulty picker).
4. **Games button** — opens the Games sheet.
5. **Settings** — small gear icon, top-right corner.

### 13.2 Playing screen

- **Header**: puzzle title (`Sudoku #N · Difficulty`), green seal if solved, mistake count (only if "Highlight mistakes" on), elapsed timer, pause/play button, settings gear.
- **Board**: 9×9 grid with the highlighting rules from §8. Tap to select.
- **Number pad**: 1–9 buttons (§9), Pencil-toggle button, Erase/Undo button.
- **Bottom controls**: prominent **Home** button (with house icon), **Reset** button (with confirmation dialog before discarding progress).

When paused, the board is covered with a "Paused / Resume" overlay; cell taps are blocked, and the number pad is also gated.

### 13.3 New Game sheet

A compact bottom sheet shown when the user taps "New Game":

- Segmented difficulty picker, pre-selected to the user's last-played tier.
- "Start" button (confirms; calls New Game with the chosen tier).
- "Cancel" toolbar button.

### 13.4 Games sheet

Shows two sections:

1. **In Progress** — list of saves, sorted by `lastPlayedAt` descending. Each row shows `Puzzle #N · Difficulty`, last-played timestamp, elapsed time. Tapping a row resumes that puzzle (switches phase to Playing).
2. **Completed** — list of `PuzzleResult`, newest first. Each row shows `Puzzle #N · Difficulty`, completion timestamp, elapsed time. Tapping a row (when the puzzle data is available) opens the completed-board read-only view.

Empty state when both sections are empty: "No games yet — start a puzzle to see it here."

A "Clear" button (with confirmation) wipes the completed history. In-progress saves are not cleared by this action.

### 13.5 Completed-board view

Read-only render of a previously-solved puzzle:

- Title: `Puzzle #N`.
- Top: completion date, elapsed time.
- Below: the 9×9 grid showing the *solution*. Givens render in bold; user-filled cells in regular weight.
- "Done" button to dismiss.

### 13.6 Settings sheet

Sectioned form:

- **Highlighting**: "Highlight mistakes" toggle, "Highlight rules" toggle.
- **Appearance**: segmented picker — System / Light / Dark.

### 13.7 Solved sheet (fanfare)

Shown automatically when the user solves a puzzle while on the Playing screen:

- Large green checkmark-seal icon (animated bounce on appear).
- "Solved!" title.
- Subtitle: `Puzzle #N · Difficulty`, elapsed time, mistake count.
- "Done" button — dismisses the sheet **and** returns to Home in one action.

The sheet does not appear if the puzzle is already solved at app launch (avoids spurious fanfare from a corrupted-save edge case).

### 13.8 Reset confirmation

Tapping "Reset" on the Playing screen shows a confirmation dialog ("Reset puzzle? — This will clear your progress on this puzzle.") with destructive Reset and Cancel before clearing.

### 13.9 New Game confirmation

There is **no** "New Game" confirmation dialog — pressing New Game silently autosaves the current state (so it remains accessible from the Games sheet) before switching puzzles.

---

## 14. Provider Selection

The "next puzzle" flow excludes:
- All puzzles already in the completion history (so they aren't repeated).
- All puzzles with an in-progress save (so New Game is genuinely fresh; in-progress puzzles are reachable via the Games sheet).
- The currently-loaded puzzle.

If everything in the requested tier is excluded, fall back to any puzzle in that tier. With a real generator (no fixed pool), this fallback is rarely if ever hit.

---

## 15. Lifecycle Behaviours

- **App launch**: load history + saves from persistence. If a most-recent save exists, set the runtime game state to that save (so the data is ready for Continue) but **start on Home, not in Playing**. Do not auto-resume into the puzzle.
- **App background / inactive**: auto-pause the timer (§12). Saves are already up-to-date because every state-changing action calls saveProgress.
- **App foreground / active**: auto-resume the timer iff we auto-paused it. Manual pauses survive.
- **Solve**: stop the timer permanently, append a `PuzzleResult` to history, remove the puzzle's in-progress save, show the Solved sheet (only if on Playing screen).

---

## 16. Settings & Preferences

Persisted preferences:

- **Highlight mistakes** (bool, default true). See §11.
- **Highlight rules** (bool, default true). See §8 layers 3b & 3c.
- **Difficulty** (Easy/Medium/Hard, default Medium). Used as the pre-selection for the New Game sheet.
- **Appearance** (System/Light/Dark, default System). Applied at the root of the UI tree.

---

## 17. Future: Leaderboards (cross-platform)

Not yet implemented. Design constraints when added:

- Anchor is the daily puzzle. One leaderboard per day, score = elapsedSeconds (lower is better), tiebreaker = completion timestamp (earlier wins).
- Must work on both iOS and Android with shared data, so neither Game Center alone nor Google Play Games Services alone is sufficient. A small shared backend is required.
- Identity model: friends-group, low friction. A simple display name + opaque user ID is sufficient — no social graph or follow/friend system needed initially.
- Score submission happens at the moment of solve, ideally with retry/queue if offline.
- Leaderboard view: top N for today's daily, plus the user's rank if outside top N.

Backend candidates: Firebase, Supabase, or a small Cloudflare Worker + KV. All fit a friends-group on free tiers.

---

## 18. Distribution

- **iOS**: TestFlight (internal team or external testers, friends added by Apple ID).
- **Android**: Google Play Console internal-test track (testers added by Google account).
- No public store listings required.

---

## 19. Platform Notes

| Concern         | iOS reference                             | Android equivalent (Compose)                     |
|-----------------|-------------------------------------------|--------------------------------------------------|
| UI framework    | SwiftUI                                   | Jetpack Compose                                  |
| State container | `ObservableObject` + `@Published`         | `ViewModel` + `StateFlow` / `mutableStateOf`     |
| Navigation      | Phase enum + sheets                       | Navigation-Compose with `NavHost` + bottom sheets |
| Persistence     | `UserDefaults` (JSON-encoded)             | `DataStore` (Preferences or Proto)               |
| Timer           | Combine `Timer.publish` sink              | Coroutine + `Flow` ticking                       |
| Color scheme    | `.preferredColorScheme(_:)`               | `MaterialTheme` with dark/light derivation       |
| Lifecycle       | `@Environment(\.scenePhase)` observe      | `LifecycleObserver` / `LifecycleEventEffect`     |
| Background work | `DispatchQueue` background queue          | Coroutine on `Dispatchers.Default`               |

The puzzle generator and solver are pure logic — port them straight to Kotlin with the same algorithms.
