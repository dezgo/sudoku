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

                Button(action: onDone) {
                    Text("Done")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
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
