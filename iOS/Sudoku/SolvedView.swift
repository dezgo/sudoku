//
//  SolvedView.swift
//  Sudoku
//

import SwiftUI

/// Fanfare sheet shown when a puzzle is solved. Confetti shower behind a
/// larger triple-icon celebration; tap Done to return to the home screen.
struct SolvedView: View {
    let puzzle: Puzzle
    let elapsedSeconds: Int
    let mistakeCount: Int
    let rank: Int?
    let showLeaderboardButton: Bool
    let showSignInPrompt: Bool
    let onLeaderboard: () -> Void
    let onSignIn: () -> Void
    let onDone: () -> Void

    @State private var animateIn: Bool = false

    var body: some View {
        ZStack {
            ConfettiView()
                .allowsHitTesting(false)

            VStack(spacing: 22) {
                iconRow
                    .scaleEffect(animateIn ? 1 : 0.4)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.spring(response: 0.45, dampingFraction: 0.55), value: animateIn)

                Text("Solved!")
                    .font(.system(size: 48, weight: .heavy, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.green, .blue],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .scaleEffect(animateIn ? 1 : 0.7)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.1), value: animateIn)

                VStack(spacing: 8) {
                    Text(verbatim: "\(puzzle.displayLabel) · \(puzzle.difficulty.label)")
                        .font(.headline)
                    HStack(spacing: 24) {
                        Label(formatTime(elapsedSeconds), systemImage: "clock")
                            .monospacedDigit()
                        Label("\(mistakeCount)", systemImage: "exclamationmark.circle")
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.3).delay(0.25), value: animateIn)

                if let rank {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(.yellow)
                        Text("Rank #\(rank)")
                            .font(.headline)
                    }
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.3).delay(0.3), value: animateIn)
                }

                VStack(spacing: 8) {
                    if showLeaderboardButton {
                        Button(action: onLeaderboard) {
                            Label("View leaderboard", systemImage: "list.number")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    } else if showSignInPrompt {
                        Button(action: onSignIn) {
                            Label("Sign in to put this on the board", systemImage: "person.crop.circle.badge.plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }

                    if showLeaderboardButton || showSignInPrompt {
                        Button(action: onDone) {
                            Text("Done")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    } else {
                        Button(action: onDone) {
                            Text("Done")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                }
                .padding(.horizontal, 32)
                .padding(.top, 12)
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.3).delay(0.35), value: animateIn)
            }
            .padding(.vertical, 36)
        }
        .presentationDetents([.medium])
        .onAppear { animateIn = true }
    }

    private var iconRow: some View {
        HStack(spacing: 16) {
            Image(systemName: "party.popper.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
                .symbolEffect(.bounce, options: .nonRepeating)
                .rotationEffect(.degrees(-20))
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)
                .symbolEffect(.bounce, options: .nonRepeating)
            Image(systemName: "party.popper.fill")
                .font(.system(size: 48))
                .foregroundStyle(.purple)
                .symbolEffect(.bounce, options: .nonRepeating)
                .rotationEffect(.degrees(20))
                .scaleEffect(x: -1, y: 1)
        }
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
