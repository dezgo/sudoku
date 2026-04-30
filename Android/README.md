# Sudoku — Android

Native Android port. Driven by [`../SPEC.md`](../SPEC.md) — the canonical behavioural contract for both platforms.

## Stack

- Kotlin 2.0.21 with Jetpack Compose (BOM 2024.10.01), Material 3.
- DataStore Preferences for non-secret persistence (history, saves, settings, daily cache, groups cache).
- EncryptedSharedPreferences (`androidx.security:security-crypto:1.1.0-alpha06`) for the API bearer token + cached user.
- HttpURLConnection (no extra HTTP deps) + kotlinx-serialization for the backend client.
- AGP 8.7.2 / Java 17 / minSdk 26 / targetSdk 35.

## Opening the project

The Gradle wrapper isn't checked in. Open the `Android/` folder in Android Studio (Hedgehog or later) and let it auto-generate the wrapper on first sync. After that, `./gradlew` works from the command line:

```
cd /Users/derek/Projects/Sudoku/Android
./gradlew :app:assembleDebug
```

If `./gradlew` complains that `java` isn't found, point `JAVA_HOME` at Android Studio's bundled JDK:

```
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

(Persist in `~/.zshrc` for permanence.)

## Manifest permissions

`AndroidManifest.xml` declares:

- `android.permission.INTERNET` — required for backend API calls.
- `android.permission.ACCESS_NETWORK_STATE` — for connectivity awareness.

## Source layout

```
app/src/main/java/com/derekgillett/sudoku/
├── MainActivity.kt              ← entry; passes AppContainer's repos into SudokuRoot
├── SudokuApplication.kt         ← Application subclass; lazy AppContainer
├── AppContainer.kt              ← simple DI: provider + all repos + ApiClient
├── data/
│   ├── DataStoreModule.kt       ← Context.sudokuDataStore extension
│   ├── AppearancePreference.kt
│   ├── PreferencesRepository.kt ← typed prefs (toggles, difficulty, theme)
│   ├── PuzzleHistoryRepository.kt
│   ├── GameSaveRepository.kt
│   ├── AuthRepository.kt        ← token (EncryptedSharedPreferences) + user state + sign-in flow
│   ├── GroupsRepository.kt      ← cached groups + create/join/leave/refresh
│   └── DailyPuzzleRepository.kt ← today/tomorrow fetch + cache + offline fallback
├── network/
│   ├── ApiClient.kt             ← HttpURLConnection-based async client; ApiException sealed class
│   └── ApiModels.kt             ← @Serializable wire DTOs (User, Group, GroupListItem, AuthVerifyResponse, PuzzleResponse, …)
├── model/
│   ├── Cell.kt, Difficulty.kt, Puzzle.kt, PuzzleResult.kt, GameSave.kt
├── generator/
│   ├── SeededRng.kt             ← LCG, deterministic seeding
│   ├── SudokuSolver.kt          ← backtracking + MRV
│   ├── SudokuGridGenerator.kt   ← random fill + uniqueness-preserving carve
│   ├── PuzzleProvider.kt        ← interface
│   ├── GeneratedPuzzleProvider.kt ← non-daily puzzles + offline-fallback daily
│   └── DailyPuzzle.kt           ← YYYYMMDD ID + seed (offline-fallback path only now)
├── state/
│   ├── GameState.kt, InputMode.kt, Phase.kt, CellPos.kt, PlacementUndo.kt
│   ├── Highlights.kt            ← pure highlighting/lock/conflict logic
│   └── SudokuGameViewModel.kt   ← `startDaily(puzzle: Puzzle)` overload accepts a server-resolved daily
└── ui/
    ├── SudokuRoot.kt            ← phase routing + lifecycle observer + sign-in sheet host
    ├── HomeScreen.kt            ← Daily / Continue / New Game / Games / Settings + identity chip
    ├── GameScreen.kt            ← header + board + pad + Home/Reset
    ├── BoardView.kt, CellView.kt, NumberPadView.kt
    ├── NewGameSheet.kt, GamesSheet.kt, CompletedBoardSheet.kt
    ├── SettingsSheet.kt         ← highlight + appearance + Account + Groups (with invite-code share)
    ├── SignInSheet.kt           ← email → code → display name → group onboarding
    ├── GroupOnboardingSheet.kt  ← create / join / show invite code with share intent
    ├── SolvedSheet.kt           ← fanfare on completion
    ├── Format.kt
    └── theme/
        ├── Color.kt, Type.kt, Theme.kt
```

## Persistence keys

| Key | Backing store | Contents |
|---|---|---|
| `history_v1` | DataStore | JSON array of `PuzzleResult`. |
| `saves_v1` | DataStore | JSON map of `puzzleID` → `GameSave`. |
| `highlight_mistakes`, `highlight_constraints`, `difficulty`, `appearance` | DataStore | Typed prefs. |
| `sudoku.groups.v1` | DataStore | JSON array of cached `GroupListItem` (group + member count + invite code). |
| `sudoku.daily_cache.v1` | DataStore | JSON `{ today, tomorrow, fetchedAt }`. |
| `api_token` | **EncryptedSharedPreferences** (`sudoku_secure`) | Bearer token. |
| `api_user_v1` | **EncryptedSharedPreferences** (`sudoku_secure`) | Cached signed-in user (id, display name). |

## Behaviour

Driven by `SPEC.md`. A few Android-specific notes:

- **Daily puzzle source**: fetched from `sudoku.appfoundry.cc/v1/daily/today`, cached locally, falls back to the local `GeneratedPuzzleProvider` if unreachable. Offline-fallback dailies are flagged unranked.
- **Lifecycle**: `SudokuRoot` observes `LocalLifecycleOwner` and on `ON_STOP` / `ON_PAUSE` calls `enterBackground` (timer auto-pauses). On `ON_START` / `ON_RESUME` it calls `enterForeground` *and* fires a refresh of the daily and groups (so changes from another device or app instance show up without a kill+relaunch).
- **Edge-to-edge**: `enableEdgeToEdge()` is on, so `HomeScreen` and `GameScreen` apply `Modifier.systemBarsPadding()` to keep the top-left identity chip / bottom controls out from under system bars.
- **No Hilt / no DI framework** — the small `AppContainer` is enough for the app's size.

## Roadmap

1. **Phase 2 — Leaderboards.** Score POST on solve, per-group leaderboard sheet, pending-scores queue.
2. **Phase 2.5 — Username + invite-by-username.**
3. **Play internal-test distribution** (free; just upload an APK or AAB to Play Console).
4. **Polish.** Per-group timezone, mistake-highlight mode toggle, cross-session Undo, per-tier dailies.
