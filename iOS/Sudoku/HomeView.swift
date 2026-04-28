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
    let dailyStatus: DailyStatus
    let dailyElapsed: Int?  // shown when in progress
    let onDaily: () -> Void
    let onContinue: () -> Void
    let onNewGame: () -> Void
    let onShowGames: () -> Void
    let onShowSettings: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Sudoku")
                .font(.system(size: 56, weight: .bold, design: .rounded))
            Spacer()
            VStack(spacing: 14) {
                dailyGroup
                if let save = mostRecentSave, save.puzzle.id != DailyPuzzle.id(for: dailyDate) {
                    continueGroup(save: save)
                }
                newGameButton
                gamesButton
            }
            .padding(.horizontal, 48)
            Spacer()
            Spacer()
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
            Button(action: {}) {
                Label("Daily Done", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BorderedButtonStyle())
            .controlSize(.large)
            .disabled(true)
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

            Text("Puzzle #\(save.puzzle.id) · \(save.puzzle.difficulty.label) · \(formatTime(save.elapsedSeconds))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
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

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
