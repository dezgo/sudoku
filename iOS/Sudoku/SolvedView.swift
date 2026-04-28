//
//  SolvedView.swift
//  Sudoku
//

import SwiftUI

/// Fanfare sheet shown when a puzzle is solved. Tapping Done returns the
/// caller to the home screen.
struct SolvedView: View {
    let puzzleID: Int
    let difficulty: Difficulty
    let elapsedSeconds: Int
    let mistakeCount: Int
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 96))
                .foregroundStyle(.green)
                .symbolEffect(.bounce, options: .nonRepeating)

            Text("Solved!")
                .font(.system(size: 40, weight: .bold, design: .rounded))

            VStack(spacing: 6) {
                Text("Puzzle #\(puzzleID) · \(difficulty.label)")
                    .font(.headline)
                HStack(spacing: 24) {
                    Label(formatTime(elapsedSeconds), systemImage: "clock")
                        .monospacedDigit()
                    Label("\(mistakeCount)", systemImage: "exclamationmark.circle")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }

            Button(action: onDone) {
                Text("Done")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 32)
            .padding(.top, 12)
        }
        .padding(.vertical, 36)
        .presentationDetents([.medium])
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
