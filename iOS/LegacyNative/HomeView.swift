//
//  HomeView.swift
//  Sudoku
//

import SwiftUI

enum DailyStatus {
    case notStarted, inProgress, completed
}

struct HomeView: View {
    let mostRecentSave: GameSave?
    let dailyDate: Date
    let dailyPuzzleID: Int
    let dailyStatus: DailyStatus
    let dailyElapsed: Int?
    let signedInDisplayName: String?
    let onDaily: () -> Void
    let onReplayDaily: () -> Void
    let onContinue: () -> Void
    let onNewGame: () -> Void
    let onShowGames: () -> Void
    let onShowSettings: () -> Void
    let onSignIn: () -> Void
    let onShowLeaderboard: () -> Void
    let onShowCoach: () -> Void
    let onShowMultiplayer: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Sudoku Crew")
                .font(.system(size: 56, weight: .bold, design: .rounded))
            Spacer()
            VStack(spacing: 14) {
                dailyGroup
                if let save = mostRecentSave, save.puzzle.id != dailyPuzzleID {
                    continueGroup(save: save)
                }
                leaderboardButton
                multiplayerButton
                newGameButton
                coachButton
                gamesButton
            }
            .padding(.horizontal, 48)
            Spacer()
            Spacer()
        }
        .overlay(alignment: .topLeading) {
            identityChip
                .padding()
        }
        .overlay(alignment: .topTrailing) {
            Button(action: onShowSettings) {
                Image(systemName: "gearshape")
                    .font(.title3)
            }
            .buttonStyle(PlainButtonStyle())
            .padding()
        }
    }

    @ViewBuilder
    private var identityChip: some View {
        if let name = signedInDisplayName {
            Label(name, systemImage: "person.crop.circle.fill")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            Button(action: onSignIn) {
                Label("Sign in", systemImage: "person.crop.circle")
                    .font(.footnote)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.tint)
        }
    }

    @ViewBuilder
    private var dailyGroup: some View {
        VStack(spacing: 4) {
            dailyButton
            Text(dailySubtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var dailyButton: some View {
        switch dailyStatus {
        case .completed:
            Button(action: onReplayDaily) {
                Label("Daily Done", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BorderedButtonStyle())
            .controlSize(.large)
        case .inProgress:
            Button(action: onDaily) {
                Label("Resume Daily", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BorderedProminentButtonStyle())
            .controlSize(.large)
        case .notStarted:
            Button(action: onDaily) {
                Label("Daily Puzzle", systemImage: "calendar")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BorderedProminentButtonStyle())
            .controlSize(.large)
        }
    }

    private var dailySubtitle: String {
        let dateLabel = dailyDate.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        switch dailyStatus {
        case .notStarted:
            return dateLabel
        case .inProgress:
            if let s = dailyElapsed {
                return "\(dateLabel) · \(formatTime(s))"
            }
            return dateLabel
        case .completed:
            return "\(dateLabel) · already played"
        }
    }

    private func continueGroup(save: GameSave) -> some View {
        VStack(spacing: 4) {
            Button(action: onContinue) {
                Label("Continue", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BorderedButtonStyle())
            .controlSize(.large)

            Text(verbatim: "\(save.puzzle.displayLabel) · \(formatTime(save.elapsedSeconds))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var leaderboardButton: some View {
        Button(action: onShowLeaderboard) {
            Label("Today's Leaderboard", systemImage: "list.number")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(BorderedButtonStyle())
        .controlSize(.large)
    }

    private var newGameButton: some View {
        Button(action: onNewGame) {
            Label("New Game", systemImage: "plus")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(BorderedButtonStyle())
        .controlSize(.large)
    }

    private var gamesButton: some View {
        Button(action: onShowGames) {
            Label("Games", systemImage: "list.bullet")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(BorderedButtonStyle())
        .controlSize(.large)
    }

    private var coachButton: some View {
        Button(action: onShowCoach) {
            Label("Coach", systemImage: "graduationcap")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(BorderedButtonStyle())
        .controlSize(.large)
    }

    private var multiplayerButton: some View {
        Button(action: onShowMultiplayer) {
            Label("Multiplayer", systemImage: "person.2.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(BorderedButtonStyle())
        .controlSize(.large)
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
