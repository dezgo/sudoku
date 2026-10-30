# Sudoku App Specification

This document is the **platform-agnostic behavioural contract** for Sudoku Crew. Since October 2026 the reference implementation is the **web app** (PWA) in `Web/`, live at `sudokucrew.com/play`. The iOS and Android apps implement an earlier version of this contract and are being retired; where they differ, sections below say so.

If a behaviour isn't here, it isn't part of the contract: feel free to choose the most natural pattern on the target platform.

---

## 1. Vision

A small, tight Sudoku app intended to be sent to friend / family groups. The core loop is the **daily puzzle**: every device shows the same puzzle on a given calendar date, and members of each group compare completion times on a per-group leaderboard. The same user can belong to multiple groups (e.g. family + two separate friend circles); the daily puzzle is global, but the leaderboard is filtered to each group's members. The single-player game (random puzzles at three difficulty tiers) is fully featured but is a side-mode to the daily.

Identity, group membership, daily distribution, and score storage are all served by a small Cloudflare Workers backend at `sudoku.appfoundry.cc` — see §17.

Distribution is the web app at `sudokucrew.com/play`, installable to the home screen (see §18).

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
| id         | int             | Stable identifier. Generated puzzles use ≥1000; daily uses YYYYMMDD. The puzzle's `displayLabel` reads "Daily · MMM d" when the ID is in the YYYYMMDD range and "Puzzle #N" otherwise — used everywhere a puzzle is named in the UI to avoid showing a raw 8-digit number to the user. |
| difficulty | enum (E/M/H)    | Easy, Medium, or Hard.                                     |
| givens     | int[9][9]       | Starting grid. 0 = blank.                                  |
| solution   | int[9][9]?      | The completed solution. Optional only for unsourced puzzles; in this app, always present. |

### `GameSave` (in-progress snapshot)

| Field                     | Type          | Meaning                                                                              |
|---------------------------|---------------|--------------------------------------------------------------------------------------|
| puzzle                    | Puzzle        | Embedded so saves don't depend on the provider.                                      |
| cells                     | Cell[9][9]    | Current state of all cells.                                                          |
| elapsedSeconds            | int           | Timer at last save.                                                                  |
| mistakeCount              | int           | Cumulative incorrect placements this session.                                        |
| lastPlayedAt              | timestamp     | Most-recent interaction time. Used for sort order.                                   |
| hintsUsed                 | int           | Tutor hints **viewed**. Bumped when the tutor sheet opens with a hint to show, regardless of whether the user taps Apply / Got it. Empty-state opens (no hint found) don't count. Defaults to 0; ratchets only up.   |
| pencilAssistsUsed         | int           | Number of auto-pencil applications this session. Defaults to 0.                      |
| highlightMistakesEverOn   | bool          | Sticky: true if the "Highlight mistakes" assist was on at any point during the solve. Defaults to true (the default toggle state). |
| highlightConstraintsEverOn| bool          | Sticky: true if "Highlight rules" was on at any point. Defaults to true.             |

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

| Key                          | Contents                                                          |
|------------------------------|-------------------------------------------------------------------|
| `sudoku.history.v1`          | Array of `PuzzleResult`.                                          |
| `sudoku.saves.v1`            | Map of `puzzle.id` → `GameSave`.                                  |
| `sudoku.difficulty`          | Difficulty enum raw value.                                        |
| `sudoku.appearance`          | Appearance enum raw value (system/light/dark).                    |
| `sudoku.identity.v1`         | `{ user_id, display_name, token }` for the signed-in user. Token stored in Keychain (iOS) / EncryptedSharedPreferences (Android), not in plain UserDefaults / DataStore. Absent when signed out. |
| `sudoku.groups.v1`           | Cached list of `{ id, name, member_count }` for the user's groups, refreshed from `/v1/me/groups`. |
| `sudoku.daily_cache.v1`      | `{ today: Puzzle, tomorrow: Puzzle, fetched_at }` from `/v1/daily/today`. Used so the daily works offline once fetched. |
| `sudoku.pending_scores.v1`   | Queue of `{ puzzle_id, elapsed_seconds, mistakes, completed_at }` awaiting upload — solves completed while offline or signed-out. |

Any equivalent platform-native key/value store (Android `DataStore`, web `localStorage`) is fine.

**Web app.** Uses `localStorage` under the same keys, with two differences: preferences live together in `sudoku.prefs.v1` (`{ difficulty, appearance, highlightMistakes, highlightConstraints, sound, colors }`), and the bearer token is stored inside `sudoku.identity.v1` (`{ user, token }`) — a browser has no Keychain. Extra keys: `sudoku.coach.completed.v1`, `sudoku.puzzle_buffer.v1` (one pre-generated puzzle per tier), `sudoku.next_id.v1`, `sudoku.installed.v1`, `sudoku.install_hint_dismissed.v1`. Every read/write tolerates storage being unavailable (private browsing, blocked site data). On iPhone, a home-screen web app's storage is separate from Safari's.

---

## 5. Difficulty Tiers

Four tiers (Expert is web-only, single-player only). Each starts from a target number of givens, but a tier is ultimately defined by the **techniques it needs** (§6), not the clue count:

| Tier   | Target givens | Notes                                                         |
|--------|---------------|---------------------------------------------------------------|
| Easy   | 48            | Gentle introduction.                                          |
| Medium | 32            | Default tier. Carving continues below 32 until a medium technique is required (typically ~27 givens). |
| Hard   | 26            | Carving continues until a hard technique is required (typically ~25 givens). |
| Expert | 24            | Web only. Hard techniques needed **at least 3 times** (a typical Hard needs one or two, with Medium work around it). Not offered for multiplayer: the server generates those puzzles and has no technique grader. |

The user's preferred tier persists; default is Medium.

---

## 6. Puzzle Generation

A puzzle is produced by:

1. **Generate a random fully-solved 9×9 grid** via backtracking with shuffled digit order at each step. The first empty cell is filled, recursing.
2. **Carve out a puzzle** by visiting cells in random order and removing each one *only if* the resulting grid still has a unique solution. Stop when the target hint count for the difficulty is reached or no more cells can be removed without ambiguity.
3. **Validate the technique tier** by running the puzzle through `classify(cells)`, which solves the puzzle by repeatedly applying the easiest engine hint and tracks the *hardest* tier required. If the carved puzzle is still too easy, **keep carving** (uniqueness-preserving), re-classifying after each removal, and put back any removal that overshoots (needs a harder tier, or is beyond the engine). The candidate is accepted when its max tier matches the requested difficulty:
   - **Easy** → `TutorTechnique.Tier.simple` (only naked / hidden singles).
   - **Medium** → `medium` (up through pair / pointing / box-line — needs at least one of those).
   - **Hard** → `hard` (needs at least one triple / wing / fish technique).
   - **Expert** (web) → `hard`, with `grade(cells).hardSteps >= 3` — the solve applies a hard-tier technique at least three times. A Hard-tier result with fewer steps keeps carving.

   Up to 25 attempts per generation (120 for Expert, which succeeds on fewer starting grids), with the best on-tier candidate kept as a fallback if all miss. Measured on a desktop (Oct 2026): Expert 60/60 with 3+ hard steps, median ~0.4 s, slowest ~2 s; it's pre-generated in a worker, so New Game is still usually instant.

   **`classify` must read singles from pencil marks.** The tutor's naked/hidden singles deliberately read candidates from placed digits only (no spoilers from the player's notes), so they can't see eliminations made by pairs, wings or fish. Inside `classify`, when the next engine hint is an elimination, first check for a single in the (auto-pencilled) notes and apply that; the single is charged to the elimination's tier. Without this, any puzzle needing a medium/hard technique stalls and classifies as `nil`, so Medium and Hard can never be generated. **The iOS/Android apps have this bug**: in practice their Medium/Hard puzzles fell through to the fallback and played like Easy with fewer clues. Measured on the web generator after the fix: 30/30 on-tier for each difficulty, ~0.1–0.4 s each.

   **The server's daily** (`Backend/src/generator.ts`) is still chosen by clue count alone (32 givens), so it is usually singles-only despite being labelled Medium. Open decision — see `docs/TODO.md`.
4. The full pre-removal grid becomes `solution`; the carved grid becomes `givens`.

For responsiveness the generator keeps a small per-tier buffer of pre-built puzzles, filled in the background (the web app: a Web Worker, one puzzle per tier, persisted in `localStorage` so New Game is instant even straight after launch). If the buffer is empty, generate on demand behind a "Building your puzzle…" indicator.

### Solver

The uniqueness check is a backtracking solver with the **Minimum Remaining Values** heuristic — at each step, branch on the empty cell with the fewest legal candidates. The solver stops once it has found 2 solutions; the puzzle is unique iff exactly 1 is found.

The solver doubles as the engine that knows whether a placement matches the solution (used for mistake highlighting and locking).

---

## 7. Daily Puzzle

A single shared puzzle per calendar date, identical across **all** devices and groups, served by the backend.

- **Date** is the **server's** calendar date in `Australia/Sydney` for v1. Per-group timezones (each group resolves "today" in its own timezone) are a deferred enhancement — see §17.6.
- **ID** is `YYYYMMDD` (e.g. 2026-04-29 → 20260429).
- The Worker generates the day's puzzle on first request and persists it in D1, so every subsequent request returns byte-identical givens and solution. The puzzle is generated using the §6 algorithm seeded from the puzzle ID, which is deterministic but no longer load-bearing for cross-device identity (D1 is the source of truth).
- Difficulty is fixed (currently Medium).
- Apps fetch the daily via `GET /v1/daily/today`, which returns **today and tomorrow** in one response. Both are cached locally (`sudoku.daily_cache.v1`), so any device that opens the app once a day always has the next daily prefetched and works offline.
- **Offline fallback**: if the daily can't be fetched and isn't cached, the app may generate a local puzzle using the §6 algorithm so the user has *something* to play. Such a fallback puzzle is **not guaranteed to match** the canonical server puzzle, so the app must clearly mark it as offline / unranked, and any solve against it is **not posted as a score**.

The daily uses the same in-progress save / history flow as any other puzzle (its ID happens to be in the YYYYMMDD range).

---

## 8. Highlighting (visual hierarchy)

Cells are tinted based on the current selection and the user's preferences. The visual hierarchy is layered, with each level overriding lower ones:

| Layer | Trigger                                                                 | Tint                       |
|-------|-------------------------------------------------------------------------|----------------------------|
| 1     | Selected cell.                                                          | Solid yellow, dark text (strongest). |
| 2     | Cells holding the **focus number** (matching) — the selected cell's value, or the armed speed digit (§9). | Accent-coloured digit on a soft accent tint. |
| 3a    | Cells in the same row, column, **or 3×3 box** as the selected cell. *Not drawn while a speed digit is armed* (§9). | Light accent.              |
| 3b    | (only when "Highlight rules" is **on**) Cells in any row, col, or box that already contains the selected cell's value — i.e., where that value can't legally go. | Light accent.              |
| 3c    | (only when "Highlight rules" is **on**) Cells that are already filled with **any** value — they're unavailable for the selected number regardless. | Light accent.              |
| 4     | (only when "Highlight mistakes" is **on**) The cell's text is red if the cell has a value that doesn't match the puzzle's solution. (For fixed cells, falls back to row/col/box rule check.) | Red text (overrides text colour, not background). |

The selection-based highlighting (layers 1–3a) always applies once a cell is selected. The "rules" highlighting (3b, 3c) is gated on the user's "Highlight rules" preference. Mistake highlighting is gated on the "Highlight mistakes" preference.

A green seal-style icon is shown next to the puzzle title when the grid is fully solved.

**Web app visual notes.** Tints are opaque colours with clear steps between layers (translucent washes all landed at similar strength on a dark board, so the selection didn't stand out). Grid lines are 1px (cells) and 2.5px (boxes and outer border) so they read on a phone.

---

## 9. Input Behaviour

**Selection.** Tapping a cell selects it. Tapping a different cell deselects the prior. **Tapping the already-selected cell deselects it** (a quick "show me the board with no highlights" gesture). The selection is the focus point for all highlighting.

**Number pad (1–9).** Behaviour depends on what's selected:

- **No selection, or selected cell already has a value** → tap-to-highlight: jump the selection to the first cell on the board containing that number (row-major scan). If no such cell exists, no-op. This applies in both normal and pencil mode.
- **Empty cell selected, normal mode** → write that number into the cell as a real value.
- **Empty cell selected, pencil mode** → toggle that number in the cell's notes.

A pad button is **disabled and visually hidden (slot preserved for layout)** once the digit has 9 valid placements on the board (i.e., the number is "complete"). When "Highlight mistakes" is on, conflicting placements don't count toward 9.

When the selected cell holds a value, the pad button for that value is rendered with the **accent background** (same treatment as the Pencil-On toggle) — mirrors the board's matching-cell highlight so the player sees the "digit in focus" both on the grid and on the controls.

**Mode toggle.** A button toggles between Normal and Pencil mode. Pencil mode adds/removes pencil marks instead of writing real values.

**Speed mode toggle.** A button next to the Pencil toggle. Speed mode is "pick a number, then tap squares": it is driven by one piece of real state, the **armed digit** (`activeNumber`).

- **Pad tap** arms that digit, or disarms it if it's already armed. It never places anything, and it clears the selection so nothing stale lingers on the board.
- **Board tap on an empty, editable cell** with a digit armed places it — or, in pencil mode, toggles it as a note (rapid note-filling).
- **Board tap on a filled or locked cell** with a digit armed clears the selection; it does not re-arm.
- The armed digit's pad button is highlighted, and every copy of it on the board lights up (§8 layer 2).
- While armed, the board shading means **only** "this digit can't go here" (§8 layers 3b/3c); the selection's row/column/box tint (3a) is suppressed, and the selected cell is drawn as a faint yellow outline (it's what Undo would clear) instead of the yellow fill. The hint under the pad reads "Tap empty squares to place N. Dark squares are where N can still go." The tints must agree with that sentence: when the selection tint was drawn too, it hid a legal square and misled a player into a wrong placement.
- The digit disarms itself once all nine are placed. A tenth copy of a completed digit is refused on every input path.
- Arrow keys only ever move the selection; they never place.
- Speed mode and the armed digit reset on new puzzle / reset / load. Speed off → normal behaviour, unchanged.

**The iOS/Android apps differ:** they infer the armed digit from the selected cell's value, so a digit not yet on the board can't be armed, and arrow keys, pencil mode and the completed-digit guard all misbehave (see `docs/TODO.md`). Not being fixed there.

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

- The mistake counter increments by 1 each time the user places a value (in normal mode, into a non-locked empty cell) that doesn't match the solution. **Counts regardless of whether "Highlight mistakes" is on** — leaderboard fairness shouldn't depend on whether the player wanted real-time feedback. Visual + audio mistake feedback is still gated on the toggle (and uses the softer "creates a row/col/box conflict" rule that the red-text highlighting also uses). Counter resets on Reset/New Game.
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

**Implementation note.** Auto-pause on background **cancels** the underlying timer publisher / coroutine entirely, not just toggles a `isPaused` flag. Re-foregrounding restarts the timer from the persisted elapsed value. This guards against run-loop / dispatcher edge cases where queued ticks could otherwise fire on resumption and cause time to jump (or, more insidiously, accumulate while the user thought the timer was paused).

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
   - *Completed today* — "Daily Done" with subtitle = "already played". Tappable — opens the read-only completed-board view (§13.5) with the bouncy "Solved!" header playing on appear, so the user can revisit their solved daily.
2. **Continue button** — only shown if the most-recent in-progress save is *not* today's daily (otherwise Daily already covers it). Subtitle shows the puzzle's label and elapsed time.
3. **Daily History button** — opens the daily calendar (§13.13). Caption: "N-day streak · M to catch up" (M = unplayed dailies in the last 30 days), or "M past dailies to catch up" with no current streak.
4. **Today's Leaderboard**, **Multiplayer**, **New Game** (difficulty picker), **Coach**, **Games** buttons.
5. **Settings** — gear icon, top-right; identity chip ("Sign in" or the display name) top-left.

Web app: an install tip sits at the top of Home when the app isn't installed (§13.14), and an update banner appears above everything when a newer version is live.

### 13.2 Playing screen

- **Header**: puzzle title (just `displayLabel` — see below), green seal if solved, mistake count (only if "Highlight mistakes" on), elapsed timer, **wand button** (auto-pencil — see §13.11), **lightbulb button** (tutor — see §13.10, yellow filled), pause/play button, settings gear. `displayLabel` is "Daily · MMM d" for dailies and the bare difficulty label ("Easy" / "Medium" / "Hard") for generated puzzles. (Web app: on the Playing header a daily shows as a calendar icon plus "d MMM", because "Daily · …" didn't fit beside the timer and four buttons on a phone. Offline stand-in dailies carry an "Unranked" tag.) The internal puzzle counter (#1042) is no longer surfaced — it's an implementation detail that no player cares about.
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

Read-only render of a previously-solved puzzle. Reachable from the Games sheet (Completed section) and from the Home screen's "Daily Done" button.

- Title: `Puzzle #N`.
- Top: full fanfare — confetti shower behind the content, triple-icon flourish (rotated party-popper-style icon left, large green checkmark-seal centre, mirrored party-popper right; all bouncing in), and a "Solved!" title in extra-bold rounded type with a green→blue gradient. Visually identical to §13.7 but slightly smaller (icons 40/64/40, title 40pt iOS / 36sp Android). Plays once on appear; the view then settles to the static read-only board.
- Below: completion date, elapsed time.
- Below: the 9×9 grid showing the *solution*. Givens render in bold; user-filled cells in regular weight.
- "Done" button to dismiss.

### 13.6 Settings sheet

Sectioned form:

- **Account**: signed-in user's display name (or Sign-in button), Sign-out option.
- **Groups** (signed-in only): list of joined groups, each row tappable to open the group's member roster. The roster shows every member's display name (with "(you)" beside the signed-in user) and a small all-time stats line: **`X dailies · last MMM d`**, where X is the total number of daily puzzles that user has solved (across any group / any date) and the date is the most recent solve. Members with no solves yet show "no dailies yet". Each group row also shows the invite code with a Share button, plus a Leave button. Below the list are two distinct rows — **"Create a group"** and **"Join with a code"** — that open the same onboarding sheet directly into the matching mode (no picker step). The earlier single "Add a group" button is gone; splitting it removes the ambiguity since a separate "join" flow already exists.
- **Highlighting**: "Highlight mistakes" toggle, "Highlight rules" toggle.
- **Sounds**: "Sound effects" toggle (default on).
- **Appearance**: segmented picker — System / Light / Dark.
- **Colours** (web app): a colour swatch each for *Buttons & links*, *Finished dailies* (done days in Daily History), *Selected square* and *Matching numbers*, plus *Reset to default colours* once any is changed. A chosen colour applies in both light and dark; its tints and the text drawn on it (black or white, whichever reads better) are derived from it. Stored per device in `prefs.colors`; unset keys keep the theme's own colour.

### 13.7 Solved sheet (fanfare)

Shown automatically when the user solves a puzzle while on the Playing screen. The sheet is intentionally celebratory:

- **Confetti shower** falling behind the content for a few seconds.
- **Triple-icon flourish**: a smaller party-popper-style icon on the left (rotated outward), a large green checkmark-seal in the centre, and a mirrored party-popper on the right. All scale-in with a bouncy spring on appear.
- **"Solved!" title** in large extra-bold rounded type, with a green→blue gradient.
- **Subtitle**: `<displayLabel> · <Difficulty>`, where `displayLabel` is "Daily · MMM d" for daily puzzles and "Puzzle #N" for generated. Elapsed time and mistake count below.
- **Done button** — dismisses the sheet **and** returns to Home in one action.

The sheet does not appear if the puzzle is already solved at app launch (avoids spurious fanfare from a corrupted-save edge case).

### 13.8 Reset confirmation

Tapping "Reset" on the Playing screen shows a confirmation dialog ("Reset puzzle? — This will clear your progress on this puzzle.") with destructive Reset and Cancel before clearing.

### 13.9 New Game confirmation

There is **no** "New Game" confirmation dialog — pressing New Game silently autosaves the current state (so it remains accessible from the Games sheet) before switching puzzles.

### 13.10 Tutor

A built-in step-by-step tutor that helps the user spot the next move using classic Sudoku techniques. Triggered by a yellow lightbulb button in the Playing-screen header. Disabled while paused or solved.

The tutor opens a bottom sheet (~40% detent) with three regions:

1. **Header**: technique name + step counter (e.g. "Naked Pair · Step 2 of 3").
2. **Narration**: a single sentence describing the current step. Highlights on the board change in lockstep.
3. **Controls**: Back / Next buttons; on the final step, "Apply" (placement-style hints — fills the deduced cell) or "Got it" (elimination-style hints — erases the called-out candidates from the user's pencil marks). Plus a small legend showing the three highlight colors.

**Implemented techniques** (priority order — easiest first):

| Technique               | Tier   | Kind        | Triggers when                                                                             |
|-------------------------|--------|-------------|-------------------------------------------------------------------------------------------|
| Naked Single            | Simple | Placement   | A cell has only one engine-valid candidate.                                               |
| Hidden Single           | Simple | Placement   | Within a unit, only one cell can hold a particular digit.                                 |
| Naked Pair              | Medium | Elimination | Two cells in a unit each have user-pencilled exactly the same two digits, equal to engine candidates. |
| Pointing Pair           | Medium | Elimination | All cells in a box where a digit could go lie in one row/column. User has pencilled the digit in those cells. |
| Box/Line Reduction      | Medium | Elimination | All cells in a row/column where a digit could go lie inside one 3×3 box. User has pencilled the digit in those cells. |
| Hidden Pair             | Medium | Elimination | Two missing digits in a unit can only land in the same two cells, both pencilled.         |
| Naked Triple            | Hard   | Elimination | Three cells in a unit whose combined user-pencilled candidates equal exactly three digits. |
| Hidden Triple           | Hard   | Elimination | Three missing digits restricted to the same three cells in a unit; pair cells may have additional candidates. |
| X-Wing                  | Hard   | Elimination | Across two rows (or columns), a digit's only candidate cells lie in the same two columns (or rows). |
| XY-Wing                 | Hard   | Elimination | Three bivalue cells: pivot {a,b}, pincers {a,c} and {b,c}; cells seeing both pincers can have c eliminated. |
| Swordfish               | Hard   | Elimination | X-Wing extended to 3×3 — a digit's candidates across three rows (or columns) lie in only three columns (or rows). |
| Naked Quad              | Hard   | Elimination | Four cells in a unit whose combined user-pencilled candidates equal exactly four digits. |
| Hidden Quad             | Hard   | Elimination | Four missing digits in a unit restricted to the same four cells; quad cells may have additional candidates. |
| Jellyfish               | Hard   | Elimination | Swordfish extended to 4×4 — a digit's candidates across four rows (or columns) lie in only four columns (or rows). |
| XYZ-Wing                | Hard   | Elimination | Trivalue pivot {a,b,c}; bivalue pincers {a,c} and {b,c} both seeing the pivot. Cells seeing the pivot AND both pincers can have c eliminated. |
| W-Wing                  | Hard   | Elimination | Two bivalue {a,b} cells that don't see each other, connected by a strong link on `a` (a unit where `a` has only those two candidate ends, one seeing each bivalue). Cells seeing both bivalues can have `b` eliminated. |
| Skyscraper              | Hard   | Elimination | Single-digit pattern: two rows (or cols) where d has exactly 2 candidate cells, sharing one column (or row) — the "base". The two unshared cells (the "tops") form a strong-link pair, so cells seeing both tops can have d eliminated. |
| Empty Rectangle         | Hard   | Elimination | In a box, candidates for d lie in a single pivot row + column. Combined with a strong link on d in another column (or row), eliminate d at the pivot's intersection. |
| 2-String Kite           | Hard   | Elimination | Single-digit pattern: d has 2 candidate cells in some row + 2 in some column, with one row-cell and one column-cell sharing a 3×3 box (the "joint"). The unjoined "tips" form a strong-link pair, so cells seeing both tips can have d eliminated. |
| Finned X-Wing           | Hard   | Elimination | Almost an X-Wing on d, but one row has extra candidate cells (the "fin") confined to the same box as one corner. Eliminations restricted to cells in the other column that share the fin's box. |
| Finned Swordfish        | Hard   | Elimination | Same idea at 3×3 scale — Swordfish where one row has fin cells confined to a single box. Eliminations restricted to cells in the unfinned columns that share the fin's box. |
| Unique Rectangle        | Hard   | Elimination | Exploits the puzzle's unique-solution guarantee. A 2×2 rectangle of empty cells spanning two boxes where all four corners share the same two candidates would allow two solutions (swap X↔Y throughout). Three types implemented: Type 1 (3 bivalue corners → eliminate X/Y from the roof); Type 2 (2 bivalue corners, 2 roofs each with identical extra Z → eliminate Z from cells seeing both roofs); Type 4 (2 bivalue floors, 2 roofs where one of X/Y is locked to the roof line → eliminate the other from both roofs). |

**Difficulty tiers** are exposed via `TutorTechnique.tier` for forward compatibility — the puzzle generator can use them to calibrate "Easy/Medium/Hard solvable using techniques up to tier X."

**Pencil-mark contract.** Pair-style and pointing-style techniques only fire when the user has pencilled the relevant cells (they're techniques about *working with* candidates). The placement-style techniques (singles) operate on engine candidates regardless of pencil state. This avoids spoilers in cells the user hasn't engaged with.

**Highlight colors on the board:**
- **Focus** (light blue) — the unit/area being examined.
- **Eliminator** (orange) — cells contributing to ruling things out, OR cells whose called-out candidates will be erased.
- **Target** (green) — the cell where the deduction lands, OR the pair cells in pair techniques.

When the tutor is active, the board's normal selection / matching / mistake tints are suppressed so the explanation is unambiguous.

**Per-digit tinting**: a single cell can show different candidates in different colors — used by hidden pair, where the pair digits stay (green) and the others are crossed out (red) all in the same cell.

**Empty state** (no implemented technique applies):
- Header — "Stuck on this one" if user has pencil marks, otherwise "No simple move spotted".
- If user has pencil marks: "I checked everything I know — singles, pairs/triples/quads (naked + hidden), pointing pair, box-line, X-wing (incl. finned), XY-wing, XYZ-wing, W-wing, swordfish (incl. finned), jellyfish, skyscraper, 2-string kite, empty rectangle. Nothing fits. This board likely needs chain reasoning (forcing chains, simple coloring) or some plain old guess-and-check."
- If user has no pencil marks: "Tap the wand to auto-fill pencil marks first — the pair and pointing techniques need them to work."

Opening the tutor — and being shown a hint — increments `GameSave.hintsUsed` once. The badge is charged the moment the user peeks, regardless of whether they then tap Apply / Got it or dismiss the sheet (since the suggestion is in their head either way). The empty-state response (no hint found) is free. Persisted across backgrounding via the save record. Surfaced as an assist marker on the leaderboard (see §17.4).

### 13.11 Auto-pencil

A **wand** button in the Playing-screen header that fills pencil marks for every empty cell with engine candidates (digits not conflicting with the cell's row, column, or box). Disabled while paused, solved, or while a fill is already pending.

**Delayed execution with cancel window.** Tapping the wand does **not** fire immediately. A floating "Auto-pencilling… · Cancel" banner appears at the bottom of the screen for **3 seconds**. Cells stay unchanged during this window. Behaviour:

- Tap **Cancel** within 3s → banner dismisses, cells unchanged, no assist counted.
- Make any other board move (place, erase) within 3s → pending fill auto-cancels, cells unchanged.
- 3s elapses → fill commits, banner dismisses, `pencilAssistsUsed` increments.

This delay prevents spoiler reveal: the user never sees pencil marks they're about to undo.

**Fill semantics** (intersect-with-engine, never re-add):
- Cells with no marks → filled with engine candidates.
- Cells with existing marks → digits no longer engine-valid are removed; **nothing is added back**. This preserves tutor-applied eliminations and any deliberate manual eliminations the user has made.
- To get a fresh fill on a particular cell, erase it first and tap the wand again.

Each successful fill increments `GameSave.pencilAssistsUsed`. Counts as a leaderboard assist marker (option A).

### 13.11a Coach mode

A practice surface for individual sudoku techniques. Reachable from the **Coach** button on the home screen. Opens a sheet listing technique cards (one per `TutorTechnique`); tapping a card loads a hand-built scenario where that technique is the next useful move. The user is asked to apply the technique on the board — placement-style techniques expect the deduced value at the right cell; elimination-style techniques expect the called-out candidates removed from the called-out cells.

Completion is decided against the engine's expected hint (snapshotted at scenario load) — extra eliminations elsewhere are tolerated; the user is *taught* the technique by being asked to do it, not graded on perfectionism beyond that. On completion the scenario shows a trophy + "Back to Coach" affordance.

Persistence: one boolean per technique stored locally (UserDefaults / DataStore key `sudoku.coach.completed.v1`). Coach progress is a personal track and is NOT synced to the backend or shown on the leaderboard.

Validation: every scenario is checked at runtime — if `TutorEngine.findHint(scenario.initialCells)?.technique != scenario.technique`, the scenario is filtered out of the visible list (defensive net against engine-ordering regressions). Unit test `CoachModeTests/everyScenarioIsValid` enforces this at build time.

**v1 ships 7 scenarios** (Naked Single, Hidden Single, Naked Pair, Pointing Pair, Box-Line Reduction, Hidden Pair, Naked Triple). The remaining 7 techniques (Hidden Triple, X-Wing, XY-Wing, Swordfish, Naked Quad, Hidden Quad, Jellyfish) require hand-crafted boards where the target fires as the *first* useful move under `findHint` — the test boards in `TutorTests` use direct `find*` calls and let simpler patterns slip through `findHint`. Coming in a follow-up.

### 13.11b Hardware keyboard

The Playing screen accepts hardware-keyboard input on both iOS and Android — useful in simulators, on iPad with a Magic Keyboard, on tablets with attached keyboards, and for accessibility setups.

| Key                          | Action                                              |
|------------------------------|-----------------------------------------------------|
| Digits 1–9                   | Same as tapping the matching number-pad button (place in normal mode, pencil-toggle in pencil mode). |
| 0, Backspace, Delete         | Clear the selected cell (same as the on-screen Erase button). |
| P or Space                   | Toggle pencil ↔ normal mode.                        |
| Arrow keys ←↑→↓              | Move the selected cell. Defaults to (0, 0) if none selected. Clamped to the 9×9 grid boundary. |

Ignored when the puzzle is paused, solved, or while the tutor sheet is open (those have their own focus). The Coach scenario play view does *not* yet support keyboard input — same is hooked separately if it becomes worthwhile.

### 13.12 Sound effects

Subtle audio cues for in-game events. All sounds are short (under ~½s except the solve sting at ~½s).

| Event                                | Cue                  | Notes                                                                          |
|--------------------------------------|----------------------|--------------------------------------------------------------------------------|
| Number placed                        | Soft click           | Fires on every digit entry into an empty cell (normal mode only — not pencil). |
| Number erased / undone               | Soft reverse-click   | Only when the cell had content. Erase/Undo button only.                        |
| Pencil mark added / removed          | Light tick / softer, lower tick | The placement click at reduced volume, pitched up (added) or down (removed). Web app only: the apps played the erase clip for pencil toggles, and removing a note sounded like an error. |
| Mistake entered                      | Short error blip     | Only when "Highlight mistakes" is on.                                          |
| 3×3 box completed, OR digit fully placed | Positive pip      | Fires when a placement completes its 3×3 box, or when the placed digit now has all 9 instances down. Row / column completion alone is too subtle to chime on. |
| Puzzle solved                        | Triumphant sting     | Plays alongside the live fanfare AND when revisiting a completed-board view.   |

**Settings.** Single "Sound effects" toggle in the Settings sheet (§13.6); default on. When off, all cues are suppressed (visual fanfare still plays).

**Platform behaviour.**
- **iOS** uses `AVAudioSession` category `.ambient` with `.mixWithOthers` — respects the silent (ringer) switch and mixes with other audio (Spotify, podcasts continue under the cues). Lazy-activated on first sound.
- **Android** uses `SoundPool` with `USAGE_GAME` / `CONTENT_TYPE_SONIFICATION` — rides the media volume stream so the volume rocker controls cue loudness. No silent-switch concept; the toggle covers it.
- **Web** uses Web Audio (`AudioContext`) for low latency. iOS only starts audio from a touchend/click/keydown — **not** pointerdown, which the board uses for instant entry — so the context is created and resumed on the first such gesture anywhere, and resumed again from the "interrupted" state iOS leaves it in after the app is backgrounded. `navigator.audioSession.type = 'ambient'` (iOS 17+) respects the silent switch and mixes with other audio, matching the iOS app.

Audio assets are CC0 from the Kenney Interface Sounds pack: `click_001`, `back_001`, `error_008`, `confirmation_001`, `confirmation_004`. Bundled as `.m4a` on iOS (converted from `.ogg`) and `.ogg` on Android.

### 13.13 Daily history, streaks & rewards (web app)

A month calendar of every daily since launch (first daily: 29 Apr 2026), reached from Home.

- **Day states:** solved (green, shows the time), started (outlined), not played, today (ringed), and days before launch / in the future (dimmed, not tappable). Month navigation is clamped to that range; weeks start Monday.
- **Tapping** a solved day opens its completed board (§13.5), which has a "Leaderboard for this day" button. Tapping today plays the daily; tapping any other unplayed day fetches it (`GET /v1/daily/:id`) and plays it as a normal ranked daily.
- **Streaks** count a day once its daily is solved, **whenever** it was solved — so catching up on a missed day repairs the streak. Current streak counts back from today, or from yesterday if today isn't done yet. Best streak and total dailies done are shown too.
- **Rewards:** a "Perfect month" trophy for every daily in a month solved (awarded once the month has ended), and streak milestones at 7, 30, 100 and 365 days. Derived on the client from history; not stored server-side.
- **Catch-up solves on leaderboards:** a late solve still posts to that day's leaderboard (the server accepts any past daily). The leaderboard tags it **"caught up"** when it was completed after its own Sydney date, so it isn't mistaken for an on-the-day time.

### 13.14 Install & updates (web app)

- **Install tip** at the top of Home: iPhone — "tap Share, then Add to Home Screen"; Android Chrome — a one-tap Install button (`beforeinstallprompt`); other Android browsers — "menu, then Add to Home screen". Never shown when running installed (`display-mode: standalone` / `navigator.standalone`); once the app has run installed (or `appinstalled` fired) a flag keeps it away from browser tabs on the same phone. Dismissing it hides it for good on that device.
- **Update banner.** iOS resumes a suspended home-screen app without reloading, so a deploy would never appear. The app checks for a newer build on returning to the foreground and every 3 minutes, comparing the live page's script bundle with the running one, and shows "A new version of Sudoku Crew is ready — tap to get it" with an **Update** button that saves and reloads (safe mid-game). The check must bypass the service worker (`?update-check=` query, skipped in `sw.js`): the SW answers `/play/` from its cache — a copy of the running version — so a naive check never sees a change.
- **Offline:** the service worker serves page loads network-first with the cached shell as fallback, and hashed assets cache-first. The API is never cached by the SW; the app keeps its own offline copies (daily cache, pending scores).

---

## 14. Provider Selection

The "next puzzle" flow excludes:
- All puzzles already in the completion history (so they aren't repeated).
- All puzzles with an in-progress save (so New Game is genuinely fresh; in-progress puzzles are reachable via the Games sheet).
- The currently-loaded puzzle.

If everything in the requested tier is excluded, fall back to any puzzle in that tier. With a real generator (no fixed pool), this fallback is rarely if ever hit.

---

## 15. Lifecycle Behaviours

- **App launch**: load history + saves from persistence. If a most-recent save exists, set the runtime game state to that save (so the data is ready for Continue) but **start on Home, not in Playing**. Do not auto-resume into the puzzle. In the background, attempt to refresh the daily cache via `GET /v1/daily/today` and flush any rows in `sudoku.pending_scores.v1` (only when authenticated). Failures are silent — the user can still play from cached / fallback dailies.
- **App background / inactive**: auto-pause the timer (§12). Saves are already up-to-date because every state-changing action calls saveProgress.
- **App foreground / active**: auto-resume the timer iff we auto-paused it. Manual pauses survive.
- **Solve**: stop the timer permanently, append a `PuzzleResult` to history, remove the puzzle's in-progress save, show the Solved sheet (only if on Playing screen).

---

## 16. Settings & Preferences

Persisted preferences:

- **Highlight mistakes** (bool, default true; **web: default false for new players since 30 Oct 2026**, existing players keep theirs). See §11.
- **Highlight rules** (bool, default true; **web: default false for new players since 30 Oct 2026**). See §8 layers 3b & 3c.
- **Lifelines** (web): a row of four icons under the timer (Auto-pencil, Hint, Highlighting, Show mistakes), lit until used, crossed out once used; read from `pencilAssistsUsed`, `hintsUsed` and the two `…EverOn` flags. Shown on Play, Solved and Completed (stored on `PuzzleResult.lifelines`). In co-op the set is shared through the room (`used` message); Show mistakes is always used there.
- **Difficulty** (Easy/Medium/Hard, default Medium). Used as the pre-selection for the New Game sheet.
- **Appearance** (System/Light/Dark, default System). Applied at the root of the UI tree.

---

## 17. Identity, Groups & Leaderboards

The social layer of the app. Implemented as a Cloudflare Workers backend (D1 + Resend) at `sudoku.appfoundry.cc`.

### 17.1 Backend stack

- **Runtime**: Cloudflare Workers (TypeScript).
- **Database**: Cloudflare D1 (SQLite).
- **Email delivery**: Resend, sending from `noreply@sudokucrew.com`, on a Resend account dedicated to this app.
- **API domain**: `sudoku.appfoundry.cc`, in the existing `appfoundry.cc` Cloudflare zone. Hardcoded in both shipped clients, so it must not move.
- **Mail domain**: `sudokucrew.com`, a separate zone. Kept apart from the API domain deliberately — `appfoundry.cc` was blocked by Gmail on sender reputation in Aug 2026 (see `Backend/README.md` → "Sending domain"). One sending domain per app.
- **Tier**: free across the board; usage at this scale (a small group of friends) is well inside every free quota.

### 17.2 Identity

Email + 6-digit OTP. No passwords, no third-party sign-in.

**Flow:**

1. User enters their email → app calls `POST /v1/auth/start { email }`. Server generates a 6-digit numeric code, stores `sha256(code)` with a 15-minute TTL and a 5-attempt cap, and emails the code via Resend.
2. User types the code → app calls `POST /v1/auth/verify { email, code }`. Server validates, deletes the code row on success, creates the user if new, issues a 32-byte random bearer token (stored as `sha256(token)` in `auth_tokens`), and returns `{ token, user, needs_display_name }`.
3. App stores the raw token in **Keychain (iOS) / EncryptedSharedPreferences (Android) / `localStorage` (web — the only option a browser offers)**. Sends `Authorization: Bearer <token>` on subsequent authenticated calls.
4. New users are immediately prompted to set a display name (`PUT /v1/me { display_name }`). Display names are global, one per user, duplicates allowed across users.

Tokens never expire; revocable by deleting the `auth_tokens` row server-side.

**Each `auth/start` replaces the previous code**, so a second send makes the first email's code fail with `wrong_code`. The web client therefore locks the Send/Verify buttons synchronously on the first tap (a state flag alone left a gap for a double-tap), offers **Resend code** only after a 30s cooldown, and shows distinct copy for an unreachable server ("Can't reach the server…"), rate limiting (429), and a failed send.

### 17.3 Groups

A user can be in multiple groups simultaneously. Each group has a 6-character base32 invite code (no ambiguous characters: 0/O/1/I/L excluded).

**Endpoints:**

- `POST /v1/groups { name }` → creates a group, the caller is its first member, returns `{ group, invite_code }`.
- `POST /v1/groups/join { invite_code }` → joins the matching group, returns `{ group }`.
- `GET /v1/me/groups` → the caller's groups.
- `GET /v1/groups/:id/members` → roster of a group the caller belongs to.
- `DELETE /v1/groups/:id/members/me` → leave a group.

**Onboarding (first sign-in):** after display-name is set, the app shows a one-time "you're not in any groups yet" screen with two buttons — *Create a group* and *Join with a code*. Either is skippable; the user can play the daily as a signed-in solo player and add groups from settings later.

**Rules:**

- The daily puzzle is global. Groups do **not** fork the puzzle.
- Score is global per user (one row per `(user_id, puzzle_id)`). Leaderboard view is per-group: filtered through `group_members`.
- Display name is global, one per user.
- A user signed-in with no groups can still play and score, but no leaderboard view is meaningful.

### 17.4 Leaderboards

Anchored on the daily puzzle. One leaderboard per `(group, puzzle_id)`.

- **Score (rank order)** = `elapsed_seconds × (1 + 0.10 × min(mistakes, 5))` — i.e., a +10% time penalty per mistake, capped at five mistakes (+50%). Lower is better. Stored as integer ×10 in SQL (`elapsed_seconds × (10 + MIN(mistakes, 5))`) to keep ordering float-free.
- **Display time on leaderboard rows** = the effective (post-penalty) seconds, so position and displayed time agree (a player listed at 12:00 ranks below a player at 11:00). The raw `elapsed_seconds` is still surfaced — but only inside the per-player detail sheet (tap a row), where the breakdown reads "Raw 10:00 · Effective 12:00 (includes mistake penalty)". Raw mistake count is *only* shown for the viewer's own row.
- **Tiebreaker** = `completed_at` (earlier wins) on equal penalised time.
- **Endpoints**: `POST /v1/scores` (idempotent — composite PK `(user_id, puzzle_id)` makes re-submission a no-op). `GET /v1/groups/:id/scores/:puzzle_id` returns the rows for that group + puzzle, sorted ascending by penalised time. `GET /v1/groups/:id/standings?from=YYYYMMDD&to=YYYYMMDD` totals a range of dailies per player (see View).
- **Submission**: on solve, the app POSTs the score along with four assist signals (see below). Failure (offline, no auth) puts the entry in `sudoku.pending_scores.v1`, which is flushed on next authenticated app launch and after a successful sign-in. Composite PK dedup means retry is safe.
- **View**: leaderboard sheet shows top N for today's daily within the selected group, plus the user's rank if outside top N. With ≥2 groups, a small picker (segmented control / dropdown) at the top of the sheet selects which group to view.
- **Periods (web app)**: a second picker — **Day · Week · Month · All time**. *Day* has ‹ › arrows to step through any daily from launch (29 Apr 2026) to today; it opens on the day it was launched from. *Week* (Monday to today), *Month* (1st to today) and *All time* show **standings**: players ranked by **wins** (days they had the group's fastest penalised time), then dailies played, then average time. Tapping a player shows their average and best effective time. Catch-up solves count like any other, and a day only one person played still counts as their win.
- **Anonymous solves**: not posted. The fanfare offers a "Sign in to put this on the board" affordance.

**Assist markers** (D1 columns on `scores`, added by migration `0002_score_assists.sql`):

| Column                     | Source                                  |
|----------------------------|-----------------------------------------|
| `hints_used`               | `GameSave.hintsUsed` at solve time      |
| `pencil_assists_used`      | `GameSave.pencilAssistsUsed`            |
| `highlight_mistakes_was_on`| `GameSave.highlightMistakesEverOn` (sticky — once true, stays true) |
| `highlight_rules_was_on`   | `GameSave.highlightConstraintsEverOn` (sticky) |

**Badge inversion in the UI.** The leaderboard does NOT mark *used* assists as asterisks; instead it shows **badges for the absence** of each assist, framing clean solves as achievements rather than assisted solves as penalties. Three badges, earned independently:

| Badge    | Earned when                  | Icon                  | Colour |
|----------|------------------------------|-----------------------|--------|
| Solo     | `hints_used == 0`            | lightbulb-slash       | green  |
| Manual   | `pencil_assists_used == 0`   | pencil / wand-inverse | purple |
| Flawless | `flawless == true` (zero mistakes; server-derived, raw count never exposed) | check-seal | mint |

**Purist** (gold star) — all three on the same solve. Replaces the three individual badges so the row stays uncluttered.

The highlight-toggle flags (`highlight_mistakes_was_on`, `highlight_rules_was_on`) are still recorded and returned, but **no longer award badges**: they're learning aids, and rewarding their absence created an incentive to switch off helpful UI just for a badge. (An earlier version of this spec listed "No safety net" and "Unaided" badges for them.)

Leaderboard rows show the **effective** (penalised) time; tapping a row shows raw vs effective, and the viewer's own mistake count on their own row only. Rows completed after their day are tagged "caught up" (§13.13).

A small ⓘ button in the leaderboard sheet's header opens a "Badge Legend" sub-sheet explaining each badge.

### 17.5 API contract (v1)

Base URL: `https://sudoku.appfoundry.cc/v1` for the store apps (compiled in; must never move). The web app calls the same Worker same-origin at `https://sudokucrew.com/v1`. All bodies are JSON.

| Method | Path                              | Auth     | Request                                | Response                                      |
|--------|-----------------------------------|----------|----------------------------------------|-----------------------------------------------|
| POST   | `/auth/start`                     | none     | `{ email }`                            | `204`                                         |
| POST   | `/auth/verify`                    | none     | `{ email, code }`                      | `{ token, user, needs_display_name }`         |
| GET    | `/me`                             | bearer   | —                                      | `{ user }`                                    |
| PUT    | `/me`                             | bearer   | `{ display_name }`                     | `{ user }`                                    |
| DELETE | `/me`                             | bearer   | —                                      | `204` — deletes the account and everything tied to it (scores, memberships, multiplayer moves/players, push tokens, sessions, codes) |
| GET    | `/me/groups`                      | bearer   | —                                      | `[{ group, member_count, invite_code }]`      |
| GET    | `/me/scores`                      | bearer   | —                                      | `{ scores: [{ puzzle_id, elapsed_seconds, mistakes, completed_at, hints_used, pencil_assists_used, highlight_mistakes_was_on, highlight_rules_was_on, difficulty, date, givens, solution }] }` — newest first, max 365; used to restore history on a new device |
| POST   | `/groups`                         | bearer   | `{ name }`                             | `{ group, invite_code }`                      |
| POST   | `/groups/join`                    | bearer   | `{ invite_code }`                      | `{ group }`                                   |
| GET    | `/groups/:id/members`             | bearer   | —                                      | `[{ user, dailies_completed, last_completed_at }]` (`dailies_completed` is all-time across every daily; `last_completed_at` is unix-millis or null) |
| DELETE | `/groups/:id/members/me`          | bearer   | —                                      | `204`                                         |
| GET    | `/daily/today`                    | none     | —                                      | `{ today: Puzzle, tomorrow: Puzzle }`         |
| GET    | `/daily/:puzzle_id`               | none     | —                                      | `{ puzzle: Puzzle }` — any past date (generated on first request); future dates → `404 not_yet_available` |
| GET    | `/version`                        | none     | —                                      | `{ ios: { current, min_required, store_url }, android: { … } }` — store apps' update prompt |
| POST   | `/shared`                         | bearer   | `{ givens, difficulty, elapsed_seconds? }` | `{ name }` — three-word name (`eagle-maple-lantern`, 256-word list in `words.ts`). Server checks the board has exactly one solution (`400 invalid_puzzle`) and stores it with the solution. Same board + same sharer → same name; a later share with `elapsed_seconds` records the sharer's time. Web only; `/p/<name>` redirects to `/play/?p=<name>` |
| GET    | `/shared/:name`                   | none     | —                                      | `{ name, difficulty, givens, solution, shared_by, sharer_seconds }` — opening resumes an in-progress save with the same givens, else starts it as a new local game |
| POST   | `/scores`                         | bearer   | `{ puzzle_id, elapsed_seconds, mistakes, hints_used, pencil_assists_used, highlight_mistakes_was_on, highlight_rules_was_on }` | `{ rank }` |
| GET    | `/groups/:id/scores/:puzzle_id`   | bearer   | —                                      | `[{ display_name, elapsed_seconds, effective_seconds, completed_at, rank, hints_used, pencil_assists_used, highlight_mistakes_was_on, highlight_rules_was_on, flawless }]` (rows ordered by penalised time; raw mistake count never exposed) |
| GET    | `/groups/:id/standings?from=&to=` | bearer   | —                                      | `[{ display_name, rank, played, wins, average_seconds, best_seconds }]` over dailies `from`..`to` (YYYYMMDD, inclusive); ordered by wins, then played, then average |
| POST   | `/multiplayer/games`              | bearer   | `{ difficulty, turn_duration_seconds, competitive_mode, invited_user_ids?, group_id? }` | `{ game, invite_code }` |
| GET    | `/multiplayer/games/:id`          | bearer   | —                                      | `{ game, players, moves, board }`             |
| POST   | `/multiplayer/games/:id/join`     | bearer   | `{ invite_code? }` (omit if pre-invited) | `{ game }`                                  |
| POST   | `/multiplayer/join-by-code`       | bearer   | `{ invite_code }`                      | `{ game }` (Universal-Link / App-Link entry: code-only join, no game id) |
| POST   | `/multiplayer/games/:id/decline`  | bearer   | —                                      | `204`                                         |
| POST   | `/multiplayer/games/:id/leave`    | bearer   | —                                      | `204`                                         |
| POST   | `/multiplayer/games/:id/start`    | bearer   | —                                      | `{ game }` (host only; needs ≥ 2 joined)     |
| POST   | `/multiplayer/games/:id/moves`    | bearer   | `{ row, col, value, idempotency_key }` | `{ move, game, board }`                       |
| GET    | `/me/multiplayer/games`           | bearer   | —                                      | `{ in_progress: [game], completed: [game] }` |
| POST   | `/me/push_token`                  | bearer   | `{ platform: "ios"\|"android", token }` | `204`                                        |
| DELETE | `/me/push_token`                  | bearer   | `{ token }`                            | `204`                                         |
| GET    | `/privacy`                        | none     | —                                      | HTML — privacy policy page              |
| GET    | `/delete-account`                 | none     | —                                      | HTML — account deletion landing page    |

`Puzzle` payload: `{ puzzle_id: int, date: "YYYY-MM-DD", difficulty: "medium", givens: int[9][9], solution: int[9][9] }`. `User`: `{ id, display_name }`. `Group`: `{ id, name }`.

### 17.6 Multiplayer (v3)

Turn-based async sudoku for 2+ players. Full design + locked product decisions in `/multiplayer-design.md`. High-level summary:

- **Game model**: 4 D1 tables — `multiplayer_games`, `multiplayer_players`, `multiplayer_moves`, `multiplayer_forfeits` (per migration `0003_multiplayer.sql`). Plus `push_tokens` for APNs/FCM dispatch.
- **Turn rules**: each player places one digit per turn. Wrong placements end the turn (logged in `multiplayer_moves` with `was_correct = 0`) but the cell stays empty so the puzzle remains solvable. Active player rotation follows `join_order`. Per-turn deadline = now + `turn_duration_seconds`; minute-granularity cron forfeits expired turns and rotates.
- **Server is the source of truth**: live board is reconstructed on every state read from `puzzle_givens` + correct moves. Wrong placements never taint the board.
- **Win condition**: per design §9.1, "stats salad" — Most Productive / Most Accurate / Quickest / Solver badges all earned. `competitive_mode` flag enables a single-winner ranking (`correct − 2 × mistakes`, tie-break by Solver).
- **Hints / auto-pencil / tutor are disabled** in multiplayer (per design §9.6 — the strategy IS the assist).
- **Push notifications** (APNs + FCM via Worker JWT signing in `Backend/src/push.ts`) fire on: `your_turn`, `turn_forfeited`, `mp_invite`, `mp_game_end`. Push tokens registered via `POST /me/push_token`. Worker secrets: `APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_PRIVATE_KEY / APNS_USE_SANDBOX`, `FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY`.
- **Public invite codes & deep-linking**: shareable URL is `https://sudoku.appfoundry.cc/m/<code>`. The Worker serves three things off that base path: (1) the HTML invite landing page (with App Store + Play Store buttons) for users without the app, (2) `/.well-known/apple-app-site-association` for iOS Universal Links, and (3) `/.well-known/assetlinks.json` for Android App Links. iOS Associated Domains entitlement and Android `<intent-filter android:autoVerify="true">` make `/m/*` open the app directly, where the client calls `POST /v1/multiplayer/join-by-code` to atomically join. Anyone (any phone, any platform) can be invited — the link routes them through the right path. Manual `POST /multiplayer/games/:id/join` with `{ invite_code }` is still supported for the in-app "Join with a code" picker.
- **Concurrent games**: capped at 10 active per user; `POST /multiplayer/games` returns 409 if exceeded.
- **Web app:** no push yet — the game view polls every 8 s while open and the lobby every 20 s. Invite links are `https://sudokucrew.com/m/<code>`; the landing page there sends people to `/play/?join=<code>`, which joins after sign-in (phones with a store app installed still open it via Universal/App Links). One digit per turn; a wrong digit ends the turn.

### 17.7 Deferred (post-v1)

- **Per-group timezone.** A `groups.timezone TEXT` column + per-group resolution of "today's" date. Users in two groups in different timezones would see two different "today" puzzles in the same UTC instant. Deferred until anyone plays the app outside `Australia/Sydney`.
- **Live realtime co-op / competitive.** Cloudflare Durable Objects + WebSockets, room key = `match_id` (UUID), independent of `group_id`. Friends-group picker pulls invitable people from the user's groups but a match itself isn't bound to one.
- **Async buddy progress.** Periodic `POST /v1/me/progress { puzzle_id, cells_filled_count, elapsed_seconds }` while playing; visible from the leaderboard view as "Alice is 47/81 at 03:12". Same HTTP stack as scoring, no new infra.
- **Deferred-deeplink group join.** Tap an invite link → install app → after sign-in, automatically joined to the inviting group.
- **Group admin actions.** Rename group, rotate invite code, kick member, transfer ownership.

---

## 18. Distribution

- **Web (production, since Oct 2026):** `sudokucrew.com/play`, served as static assets by the same Cloudflare Worker as the API (`Backend/wrangler.toml` `[assets]`). Deploy with `npm run deploy` in `Backend/`, which builds `Web/` into `Backend/public/play` first. Players add it to the home screen (§13.14). GitHub `main` mirrors what's deployed.
- **iOS / Android:** published on the App Store and Google Play; being retired in favour of the web app. `/privacy` must stay true for them while the listings exist. Plan in `docs/TODO.md` → "Retiring the store apps".

---

## 19. Platform Notes

| Concern         | Web (reference)                         | iOS                                       | Android (Compose)                                |
|-----------------|-----------------------------------------|-------------------------------------------|--------------------------------------------------|
| UI framework    | Preact + TypeScript (Vite)              | SwiftUI                                   | Jetpack Compose                                  |
| State container | One observable store + `useStore()` hook | `ObservableObject` + `@Published`         | `ViewModel` + `StateFlow` / `mutableStateOf`     |
| Navigation      | Phase + a stack of sheets               | Phase enum + sheets                       | Navigation-Compose with `NavHost` + bottom sheets |
| Persistence     | `localStorage` (JSON)                   | `UserDefaults` (JSON-encoded)             | `DataStore` (Preferences or Proto)               |
| Timer           | `setInterval`, cancelled on `visibilitychange` | Combine `Timer.publish` sink        | Coroutine + `Flow` ticking                       |
| Color scheme    | CSS tokens + `prefers-color-scheme` / `data-theme` | `.preferredColorScheme(_:)`    | `MaterialTheme` with dark/light derivation       |
| Lifecycle       | `visibilitychange` / `pagehide`         | `@Environment(\.scenePhase)` observe      | `LifecycleObserver` / `LifecycleEventEffect`     |
| Background work | Web Worker (puzzle generation)          | `DispatchQueue` background queue          | Coroutine on `Dispatchers.Default`               |

The puzzle generator, solver and tutor are pure logic in `Web/src/engine/` with unit tests (`npm test` in `Web/`).

---

## 18. Co-op (web only)

2–4 signed-in players solve one board together, live. Started from Multiplayer › "Start a co-op game" (any difficulty, including Expert — the creating phone generates and grades the puzzle; the server checks it has one solution). Invite link `/c/<three-word name>` → `/play/?coop=<name>`; the name can also be typed into the lobby.

- **Server:** `coop_games` / `coop_players` in D1 (index + result) and one Durable Object per game (`CoopRoom`, `Backend/src/coop-room.ts`) holding the live board. Phones connect by WebSocket to `/v1/coop/:name/ws?token=…`. Messages: client → `place` / `clear` / `sel`; server → `state`, `cell`, `presence`, `sel`, `done`. Givens and correct numbers are locked for everyone; a refused move is answered with the real square so a phone that raced its partner snaps back.
- **Client:** the normal Play screen with `store.coop` set. Each phone runs its own `Game`; `store.act` diffs placed numbers before/after each action and sends the changes, and incoming moves apply via `Game.applyRemote`. **Pencil marks, auto-pencil, speed mode and the tutor's explanation stay on the phone** — only placed numbers are shared (a hint that places a number shares that number). Right/wrong highlighting is always on. Partner numbers are purple; a purple outline shows where a partner is looking. No pause (shared clock). The clock starts when a second player connects or the first number goes in. Moves are blocked while reconnecting. Private notes and a stable local puzzle id live in `sudoku.coop.v1`. Never written to the solo saves; recorded in Completed when solved.

