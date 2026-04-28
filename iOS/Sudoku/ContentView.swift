//
//  ContentView.swift
//  Sudoku
//  Created by Derek Gillett on 27/4/2026.
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
    @StateObject private var history: PuzzleHistory
    @StateObject private var store: GameStore
    @StateObject private var game: SudokuGame
    @State private var phase: Phase = .home
    @State private var showingHistory = false
    @State private var showingSettings = false
    @State private var showingNewGame = false
    @State private var showingSolved = false
    @State private var confirmingReset = false

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
                let today = Date()
                let dailyID = DailyPuzzle.id(for: today)
                HomeView(
                    mostRecentSave: store.mostRecent,
                    dailyDate: today,
                    dailyStatus: dailyStatus(dailyID: dailyID),
                    dailyElapsed: store.saves[dailyID]?.elapsedSeconds,
                    onDaily: startDaily,
                    onContinue: continueMostRecent,
                    onNewGame: { showingNewGame = true },
                    onShowGames: { showingHistory = true },
                    onShowSettings: { showingSettings = true }
                )
            case .playing:
                gameView
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
            // Only celebrate if the user actually solved it from the playing
            // screen — guards against an already-solved state on app launch.
            if phase == .playing {
                showingSolved = true
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
        .sheet(isPresented: $showingSolved) {
            SolvedView(
                puzzleID: game.puzzleID,
                difficulty: game.currentPuzzle.difficulty,
                elapsedSeconds: game.elapsedSeconds,
                mistakeCount: game.mistakeCount
            ) {
                phase = .home
                showingSolved = false
            }
        }
        .preferredColorScheme(appearance.colorScheme)
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                game.enterForeground()
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
            Text("Sudoku #\(game.puzzleID) · \(game.currentPuzzle.difficulty.label)")
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

    private func startDaily() {
        game.startDaily()
        phase = .playing
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

    /// Pause the game (so the timer stops accumulating off-screen) and
    /// return to home.
    private func goHome() {
        if !game.isPaused {
            game.togglePause()
        }
        phase = .home
    }
}

#Preview {
    ContentView()
}
