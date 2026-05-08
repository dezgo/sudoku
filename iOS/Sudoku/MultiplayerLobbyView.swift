//
//  MultiplayerLobbyView.swift
//  Sudoku
//
//  Lobby screen for the turn-based async multiplayer feature. Shows three
//  sections: "Your turn now" (highest priority — games waiting on the user),
//  "In progress" (games waiting on others), and "Completed". A floating
//  "+ New game" button kicks off the create flow.
//

import SwiftUI

struct MultiplayerLobbyView: View {
    @EnvironmentObject private var store: MultiplayerStore
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    /// If set when the lobby appears, push directly into that game — used by
    /// the universal-link flow so a tapped invite opens the game, not the
    /// lobby's list.
    var initialGame: MultiplayerGame? = nil

    @State private var showingCreate = false
    @State private var openingGame: MultiplayerGame?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Multiplayer")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            showingCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
                .task {
                    await store.refresh()
                    if let g = initialGame, openingGame == nil { openingGame = g }
                }
                .refreshable { await store.refresh() }
                .sheet(isPresented: $showingCreate) {
                    MultiplayerCreateView()
                        .environmentObject(store)
                }
                .navigationDestination(item: $openingGame) { game in
                    MultiplayerGameView(gameID: game.id)
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !auth.isSignedIn {
            VStack(spacing: 16) {
                Spacer()
                Image(systemName: "person.crop.circle.badge.exclamationmark")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)
                Text("Sign in to play with friends.")
                    .font(.headline)
                Text("Multiplayer needs a signed-in account so we know whose turn it is.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Spacer()
                Spacer()
            }
        } else if store.inProgress.isEmpty && store.completed.isEmpty {
            ContentUnavailableView(
                "No games yet",
                systemImage: "gamecontroller",
                description: Text("Tap + to start a turn-based sudoku with friends.")
            )
        } else {
            List {
                let myTurnGames = store.inProgress.filter { $0.isMyTurn }
                let waitingGames = store.inProgress.filter { !$0.isMyTurn }

                if !myTurnGames.isEmpty {
                    Section("Your turn") {
                        ForEach(myTurnGames) { game in
                            row(for: game, accent: .accentColor)
                        }
                    }
                }
                if !waitingGames.isEmpty {
                    Section("Waiting on others") {
                        ForEach(waitingGames) { game in
                            row(for: game, accent: .secondary)
                        }
                    }
                }
                if !store.completed.isEmpty {
                    Section("Completed") {
                        ForEach(store.completed) { game in
                            row(for: game, accent: .secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func row(for game: MultiplayerGame, accent: Color) -> some View {
        Button {
            openingGame = game
        } label: {
            HStack(spacing: 12) {
                Image(systemName: iconName(for: game))
                    .foregroundStyle(accent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(for: game))
                        .foregroundStyle(.primary)
                    Text(subtitle(for: game))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .buttonStyle(.plain)
    }

    private func iconName(for game: MultiplayerGame) -> String {
        switch game.status {
        case .pending:    return "hourglass"
        case .active:     return game.isMyTurn ? "arrow.right.circle.fill" : "person.2"
        case .completed:  return "checkmark.seal.fill"
        case .abandoned:  return "xmark.circle"
        }
    }

    private func title(for game: MultiplayerGame) -> String {
        let diff = game.difficulty.label
        switch game.status {
        case .pending:   return "\(diff) · waiting to start"
        case .active:    return "\(diff)"
        case .completed: return "\(diff) · solved"
        case .abandoned: return "\(diff) · abandoned"
        }
    }

    private func subtitle(for game: MultiplayerGame) -> String {
        switch game.status {
        case .pending:
            return "Tap to invite or start"
        case .active:
            if game.isMyTurn {
                if let secs = game.timeRemainingSeconds, secs > 0 {
                    return "Your move · \(formatRemaining(secs)) left"
                }
                return "Your move"
            }
            return "Waiting on another player"
        case .completed:
            return "Tap to see stats"
        case .abandoned:
            return "Game ended early"
        }
    }

    private func formatRemaining(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m)m"
    }
}
