# Sudoku — Android

Native Android port of the iOS app. Driven by [`../SPEC.md`](../SPEC.md) — that's the canonical behavioural contract for both platforms.

## Stack

- Kotlin 2.0.21 with Jetpack Compose (BOM 2024.10.01)
- Material 3
- DataStore Preferences for persistence (JSON-encoded blobs for history + saves; typed prefs for settings)
- kotlinx-serialization for the JSON
- AGP 8.7.2 / Java 17 / minSdk 26 / targetSdk 35

## Opening the project

The Gradle wrapper isn't checked in. Open the `Android/` folder in Android Studio (Hedgehog or later) and let it auto-generate the wrapper on first sync. After that, `./gradlew` works from the command line.

```
cd /Users/derek/Projects/Sudoku/Android
# (Open Android Studio; or, if you have Gradle CLI installed:)
gradle wrapper
./gradlew assembleDebug
```

## Source layout

```
app/src/main/java/com/derekgillett/sudoku/
├── MainActivity.kt              ← entry; instantiates ViewModel via factory
├── SudokuApplication.kt         ← Application subclass; lazy AppContainer
├── AppContainer.kt              ← simple DI: provider + repos
├── data/
│   ├── DataStoreModule.kt       ← Context.sudokuDataStore extension
│   ├── AppearancePreference.kt
│   ├── PreferencesRepository.kt ← typed prefs (toggles, difficulty, theme)
│   ├── PuzzleHistoryRepository.kt
│   └── GameSaveRepository.kt
├── model/
│   ├── Cell.kt, Difficulty.kt, Puzzle.kt, PuzzleResult.kt, GameSave.kt
├── generator/
│   ├── SeededRng.kt             ← LCG, deterministic seeding
│   ├── SudokuSolver.kt          ← backtracking + MRV
│   ├── SudokuGridGenerator.kt   ← random fill + uniqueness-preserving carve
│   ├── PuzzleProvider.kt        ← interface
│   ├── GeneratedPuzzleProvider.kt ← production: bg-buffered + daily cache
│   └── DailyPuzzle.kt           ← YYYYMMDD ID + seed
├── state/
│   ├── GameState.kt             ← single immutable state
│   ├── InputMode.kt, Phase.kt, CellPos.kt, PlacementUndo.kt
│   ├── Highlights.kt            ← pure highlighting/lock/conflict logic
│   └── SudokuGameViewModel.kt   ← the SudokuGame.swift port
└── ui/
    ├── SudokuRoot.kt            ← phase routing + lifecycle observer
    ├── HomeScreen.kt            ← Daily / Continue / New Game / Games / Settings
    ├── GameScreen.kt            ← header + board + pad + Home/Reset
    ├── BoardView.kt             ← 9×9 grid + lines + pause cover
    ├── CellView.kt              ← one cell with highlight tinting
    ├── NumberPadView.kt         ← 1–9 + Pencil + Erase/Undo
    ├── NewGameSheet.kt          ← difficulty picker + Start
    ├── GamesSheet.kt            ← In Progress + Completed lists
    ├── CompletedBoardSheet.kt   ← read-only solved-board view
    ├── SettingsSheet.kt         ← highlight toggles + theme picker
    ├── SolvedSheet.kt           ← fanfare on completion
    ├── Format.kt                ← time / date helpers
    └── theme/
        ├── Color.kt, Type.kt, Theme.kt
```

## Persistence keys (DataStore)

| Key                        | Contents                                |
|----------------------------|-----------------------------------------|
| `history_v1`               | JSON array of `PuzzleResult`            |
| `saves_v1`                 | JSON map of `puzzleID` → `GameSave`     |
| `highlight_mistakes`       | Boolean                                 |
| `highlight_constraints`    | Boolean                                 |
| `difficulty`               | `Difficulty.name`                       |
| `appearance`               | `AppearancePreference.name`             |

## Behaviour

Driven by `SPEC.md`. A few Android-specific notes:

- **Daily seed**: `DailyPuzzle.seed(date)` matches the iOS multiplier (`0x9E3779B97F4A7C15`). Iteration order in the generator is the same algorithm, but a deterministic RNG seed is ultimately what guarantees a daily is identical *for a given platform/build* — cross-platform "exact same daily" is *not* guaranteed because language-level Random.shuffle implementations differ. For a leaderboard-friendly daily that's truly identical across iOS and Android, the day's puzzle data should ultimately come from a shared source (server, or a shared seeded algorithm we control end-to-end). See `SPEC.md` §17.
- **Lifecycle pause**: `SudokuRoot` observes `LocalLifecycleOwner` and calls `enterBackground` / `enterForeground` on `ON_STOP`/`ON_RESUME` so the timer doesn't tick off-screen.
- **No Hilt / no DI framework** — small `AppContainer` is enough for the app's size.
