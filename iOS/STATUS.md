# Sudoku — Status

_Last updated: 2026-04-28_

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

## Architecture

| File | Role |
|---|---|
| `SudokuApp.swift` | App entry point. |
| `ContentView.swift` | Root view; wires `SudokuGame`, `PuzzleHistory`, `GameStore`; header / board / pad / controls layout; sheet presentation. |
| `BoardView.swift` | 9×9 grid layout, grid lines, pause cover. |
| `CellView.swift` | Single cell rendering: backgrounds, value vs notes, locked/error styling. |
| `NumberPadView.swift` | 1–9 buttons, Pencil toggle, dynamic Erase/Undo button. |
| `SudokuGame.swift` | All game state and logic (`ObservableObject`). Cells, selection, modes, highlighting helpers, conflict / solve detection, autosave hooks, undo bookkeeping. |
| `SudokuPuzzle.swift` | `Difficulty` enum, `Puzzle` Codable struct, hand-curated source puzzles (Easy / Medium / Hard) sharing one solution. |
| `PuzzleProvider.swift` | `PuzzleProvider` protocol + `HardcodedPuzzleProvider` (7 variants per tier via validity-preserving transforms; deterministic seeded RNG). Kept for previews / tests; production uses `GeneratedPuzzleProvider`. |
| `PuzzleGenerator.swift` | Production `GeneratedPuzzleProvider` + `SudokuGridGenerator` + `SudokuSolver`. Generates an independent solved grid per call, carves a puzzle by uniqueness-preserving cell removal targeting a per-difficulty hint count. Maintains a small per-difficulty buffer filled on a background queue so New Game stays responsive. Also implements deterministic daily puzzles — same date → same puzzle on every device — via `DailyPuzzle.seed`. Today's daily is pre-warmed in the cache at app launch. |
| `SeededRNG.swift` | Linear-congruential RNG used for both variant transforms and daily-puzzle seeding. |
| `DailyPuzzle.swift` | Daily puzzle naming + seeding helpers. Stable `id(for:)` (YYYYMMDD) so saves/history record dailies under predictable IDs. |
| `PuzzleHistory.swift` | Completed-puzzle records (`PuzzleResult`) persisted to UserDefaults. |
| `GameStore.swift` | In-progress saves (`GameSave`) keyed by puzzle ID, persisted to UserDefaults. |
| `HistoryView.swift` | Games sheet; in-progress + completed sections. |
| `CompletedBoardView.swift` | Read-only solved-board view for completed entries. |
| `SettingsView.swift` | Highlight toggles + theme picker; gear icon in header. |
| `HomeView.swift` | Landing screen on launch / after solve. New Game, Continue (if a save exists), Games, gear-icon Settings. |
| `SolvedView.swift` | Fanfare sheet shown when a puzzle is completed. Tap Done to return to home. |
| `NewGameSheet.swift` | Compact bottom sheet that asks for difficulty before starting a new game; pre-selects last-played tier. |

### Persistence keys
- `sudoku.history.v1` — completed games.
- `sudoku.saves.v1` — in-progress saves.
- `sudoku.difficulty` — preferred difficulty.
- `sudoku.appearance` — theme override.

### Notes / known caveats
- Production puzzles come from `GeneratedPuzzleProvider`, which produces an independent solved grid per call and carves with uniqueness verification. Generated puzzles use IDs starting at 1000 to avoid colliding with the 1–21 hardcoded range that may exist in older saves/history.
- `lastPlacementInfo` (Undo target) is in-memory only; closing the app forfeits Undo for the most recent placement.
- Conflict detection prefers solution-mismatch for user cells when a solution is known; falls back to row/col/box rule check otherwise.
- First New Game after a fresh launch can briefly block (1–2s) if the per-difficulty buffer hasn't filled yet; subsequent generations are instant.

## Roadmap (likely order)

1. **Leaderboards** — needs networking + identity. Originally excluded for MVP, now on the table per user. The daily puzzle (already shipped) provides the shared anchor.
2. More polish: settings toggle for solution-based vs rule-based mistake highlighting, optional cross-session Undo persistence, per-tier dailies if desired.
