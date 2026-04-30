//
//  ContentView.swift
//  Sudoku
//

import SwiftUI

struct ContentView: View {
    enum Phase {
        case home
        case playing
    }

    @AppStorage("sudoku.difficulty") private var difficulty: Difficulty = .medium
    @AppStorage("sudoku.appearance") private var appearance: AppearancePreference = .system
    @Environment(\.scenePhase) private var scenePhase

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groupsStore: GroupsStore
    @EnvironmentObject private var dailyStore: DailyPuzzleStore
    @EnvironmentObject private var scoresStore: ScoresStore

    @StateObject private var history: PuzzleHistory
    @StateObject private var store: GameStore
    @StateObject private var game: SudokuGame
    @State private var phase: Phase = .home
    @State private var showingHistory = false
    @State private var showingSettings = false
    @State private var showingNewGame = false
    @State private var showingSolved = false
    @State private var showingSignIn = false
    @State private var confirmingReset = false
    @State private var replayingDaily: PuzzleResult?
    @State private var showingLeaderboard = false
    @State private var dailyIsOfflineFallback = false
    @State private var solvedRank: Int?
    @State private var solvedWasDaily = false

    init() {
        let h = PuzzleHistory()
        let s = GameStore()
        let initial = UserDefaults.standard.string(forKey: "sudoku.difficulty")
            .flatMap(Difficulty.init(rawValue:)) ?? .medium
        _history = StateObject(wrappedValue: h)
        _store = StateObject(wrappedValue: s)
        _game = StateObject(wrappedValue: SudokuGame(
            provider: GeneratedPuzzleProvider(),
            history: h,
            store: s,
            initialDifficulty: initial
        ))
    }

    var body: some View {
        Group {
            switch phase {
            case .home:
                HomeView(
                    mostRecentSave: store.mostRecent,
                    dailyDate: Date(),
                    dailyPuzzleID: resolvedDailyID,
                    dailyStatus: dailyStatus(dailyID: resolvedDailyID),
                    dailyElapsed: store.saves[resolvedDailyID]?.elapsedSeconds,
                    signedInDisplayName: auth.displayName,
                    onDaily: startDaily,
                    onReplayDaily: { replayDaily(dailyID: resolvedDailyID) },
                    onContinue: continueMostRecent,
                    onNewGame: { showingNewGame = true },
                    onShowGames: { showingHistory = true },
                    onShowSettings: { showingSettings = true },
                    onSignIn: { showingSignIn = true },
                    onShowLeaderboard: { showingLeaderboard = true }
                )
            case .playing:
                gameView
            }
        }
        .task {
            await dailyStore.refresh()
            if auth.isSignedIn {
                await groupsStore.refresh()
                await scoresStore.flushPending()
            }
        }
        .onChange(of: game.isSolved) { _, isSolved in
            guard isSolved else { return }
            history.record(PuzzleResult(
                puzzleID: game.puzzleID,
                completedAt: Date(),
                elapsedSeconds: game.elapsedSeconds,
                puzzle: game.currentPuzzle
            ))
            if phase == .playing {
                solvedWasDaily = game.currentPuzzle.isDaily
                solvedRank = nil
                showingSolved = true

                // Spec §17.4: post score for canonical daily solves only;
                // offline-fallback dailies are explicitly unranked.
                if solvedWasDaily && !dailyIsOfflineFallback {
                    let pid = game.puzzleID
                    let elapsed = game.elapsedSeconds
                    let mistakes = game.mistakeCount
                    Task {
                        let rank = await scoresStore.submit(
                            puzzleID: pid,
                            elapsedSeconds: elapsed,
                            mistakes: mistakes
                        )
                        solvedRank = rank
                    }
                }
            }
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn {
                Task {
                    await groupsStore.refresh()
                    await scoresStore.flushPending()
                }
            }
        }
        .sheet(isPresented: $showingHistory) {
            HistoryView(
                game: game,
                history: history,
                store: store,
                onResume: { phase = .playing }
            )
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(game: game)
        }
        .sheet(isPresented: $showingNewGame) {
            NewGameSheet(difficulty: $difficulty) {
                game.newGame(difficulty: difficulty)
                phase = .playing
            }
        }
        .sheet(isPresented: $showingSignIn) {
            SignInView()
        }
        .sheet(item: $replayingDaily) { result in
            CompletedBoardView(result: result)
        }
        .sheet(isPresented: $showingSolved) {
            SolvedView(
                puzzle: game.currentPuzzle,
                elapsedSeconds: game.elapsedSeconds,
                mistakeCount: game.mistakeCount,
                rank: solvedRank,
                showLeaderboardButton: solvedWasDaily && !dailyIsOfflineFallback && auth.isSignedIn && !groupsStore.groups.isEmpty,
                showSignInPrompt: solvedWasDaily && !dailyIsOfflineFallback && !auth.isSignedIn,
                onLeaderboard: {
                    showingSolved = false
                    showingLeaderboard = true
                },
                onSignIn: {
                    showingSolved = false
                    showingSignIn = true
                },
                onDone: {
                    phase = .home
                    showingSolved = false
                }
            )
        }
        .sheet(isPresented: $showingLeaderboard) {
            LeaderboardView(
                puzzleID: resolvedDailyID,
                puzzleLabel: dailyStore.today?.displayLabel ?? Puzzle(id: resolvedDailyID, difficulty: .medium, givens: [], solution: nil).displayLabel
            )
        }
        .preferredColorScheme(appearance.colorScheme)
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                game.enterForeground()
                Task {
                    await dailyStore.refresh()
                    if auth.isSignedIn { await groupsStore.refresh() }
                }
            case .background, .inactive:
                game.enterBackground()
            @unknown default:
                break
            }
        }
    }

    private var gameView: some View {
        VStack(spacing: 16) {
            header
            BoardView(game: game)
                .padding(.horizontal, 8)
            NumberPadView(game: game)
                .padding(.horizontal, 8)
            controls
        }
        .padding(.vertical, 12)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text(verbatim: "\(game.currentPuzzle.displayLabel) · \(game.currentPuzzle.difficulty.label)")
                .font(.title3.weight(.bold))
            if game.isSolved {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title3)
                    .foregroundStyle(.green)
            }
            Spacer()
            if game.highlightMistakes {
                Label("\(game.mistakeCount)", systemImage: "exclamationmark.circle")
                    .font(.headline)
                    .foregroundStyle(game.mistakeCount > 0 ? .red : .primary)
            }
            Label(game.formattedTime, systemImage: "clock")
                .font(.headline)
                .monospacedDigit()
            Button {
                game.togglePause()
            } label: {
                Image(systemName: game.isPaused ? "play.fill" : "pause.fill")
                    .font(.headline)
            }
            .buttonStyle(.plain)
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.headline)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                goHome()
            } label: {
                Label("Home", systemImage: "house.fill")
            }
            .buttonStyle(.borderedProminent)
            Button("Reset") { confirmingReset = true }
                .buttonStyle(.bordered)
        }
        .padding(.horizontal, 16)
        .confirmationDialog(
            "Reset puzzle?",
            isPresented: $confirmingReset,
            titleVisibility: .visible
        ) {
            Button("Reset", role: .destructive) { game.reset() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This will clear your progress on this puzzle.")
        }
    }

    // MARK: - Phase actions

    private func continueMostRecent() {
        if let save = store.mostRecent {
            game.resume(save)
        }
        phase = .playing
    }

    /// Resolves today's daily via the server-backed store, falls back to the
    /// local generator if nothing's reachable, then enters the playing phase.
    private func startDaily() {
        Task {
            let (puzzle, isOffline) = await dailyStore.ensureToday()
            dailyIsOfflineFallback = isOffline
            game.startDaily(puzzle: puzzle)
            phase = .playing
        }
    }

    private func replayDaily(dailyID: Int) {
        replayingDaily = history.results.first(where: { $0.puzzleID == dailyID })
    }

    private func dailyStatus(dailyID: Int) -> DailyStatus {
        if history.results.contains(where: { $0.puzzleID == dailyID }) {
            return .completed
        }
        if store.saves[dailyID] != nil {
            return .inProgress
        }
        return .notStarted
    }

    /// Server-known daily ID when we have a cache, else fall back to local
    /// date math. The two will agree for any device on Sydney time and may
    /// differ by ±1 day across timezones — a tradeoff we accept while the
    /// daily is anchored to one server timezone (SPEC §17.6).
    private var resolvedDailyID: Int {
        dailyStore.today?.id ?? DailyPuzzle.id(for: Date())
    }

    private func goHome() {
        if !game.isPaused {
            game.togglePause()
        }
        phase = .home
    }
}

#Preview {
    let client = APIClient()
    let auth = AuthStore(client: client)
    return ContentView()
        .environmentObject(auth)
        .environmentObject(GroupsStore(client: client, auth: auth))
        .environmentObject(DailyPuzzleStore(client: client, fallbackProvider: GeneratedPuzzleProvider()))
        .environmentObject(ScoresStore(client: client, auth: auth))
}
