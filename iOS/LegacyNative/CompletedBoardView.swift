//
//  CompletedBoardView.swift
//  Sudoku
//

import SwiftUI

/// A read-only view of a completed puzzle's solved grid.
/// Givens render bold, the rest in regular weight (matching the
/// played-board styling) so the user can see what they filled in.
struct CompletedBoardView: View {
    let result: PuzzleResult
    @Environment(\.dismiss) private var dismiss
    @State private var animateIn: Bool = false

    var body: some View {
        NavigationStack {
            ZStack {
                VStack(spacing: 12) {
                    fanfare
                    summary
                    if let puzzle = result.puzzle {
                        board(puzzle: puzzle)
                            .padding(.horizontal, 8)
                    }
                    Spacer()
                }
                .padding(.vertical, 12)

                ConfettiView()
                    .allowsHitTesting(false)
            }
            .navigationTitle(result.puzzle?.displayLabel ?? "Puzzle #\(result.puzzleID)")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                animateIn = true
                SoundManager.shared.play(.solved)
            }
        }
    }

    /// Fanfare header — confetti shower, triple-icon flourish, and gradient
    /// "Solved!" title. Mirrors the live solve fanfare so revisiting a
    /// completed puzzle replays the celebration.
    private var fanfare: some View {
        VStack(spacing: 12) {
            iconRow
                .scaleEffect(animateIn ? 1 : 0.4)
                .opacity(animateIn ? 1 : 0)
                .animation(.spring(response: 0.45, dampingFraction: 0.55), value: animateIn)

            Text("Solved!")
                .font(.system(size: 40, weight: .heavy, design: .rounded))
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
        }
        .padding(.top, 4)
    }

    private var iconRow: some View {
        HStack(spacing: 14) {
            Image(systemName: "party.popper.fill")
                .font(.system(size: 40))
                .foregroundStyle(.orange)
                .symbolEffect(.bounce, options: .nonRepeating)
                .rotationEffect(.degrees(-20))
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
                .symbolEffect(.bounce, options: .nonRepeating)
            Image(systemName: "party.popper.fill")
                .font(.system(size: 40))
                .foregroundStyle(.purple)
                .symbolEffect(.bounce, options: .nonRepeating)
                .rotationEffect(.degrees(20))
                .scaleEffect(x: -1, y: 1)
        }
    }

    private var summary: some View {
        HStack {
            Label(result.completedAt.formatted(date: .abbreviated, time: .shortened),
                  systemImage: "calendar")
            Spacer()
            Label(formatTime(result.elapsedSeconds), systemImage: "clock")
                .monospacedDigit()
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
    }

    private func board(puzzle: Puzzle) -> some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let cellSide = side / 9
            ZStack(alignment: .topLeading) {
                VStack(spacing: 0) {
                    ForEach(0..<9, id: \.self) { row in
                        HStack(spacing: 0) {
                            ForEach(0..<9, id: \.self) { col in
                                cell(puzzle: puzzle, row: row, col: col)
                                    .frame(width: cellSide, height: cellSide)
                            }
                        }
                    }
                }
                gridLines(side: side)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    @ViewBuilder
    private func cell(puzzle: Puzzle, row: Int, col: Int) -> some View {
        let givenValue = puzzle.givens[row][col]
        let isFixed = givenValue != 0
        let value = isFixed ? givenValue : (puzzle.solution?[row][col] ?? 0)
        ZStack {
            Color(.systemBackground)
            if value != 0 {
                Text("\(value)")
                    .font(.system(size: 24, weight: isFixed ? .bold : .regular, design: .rounded))
            }
        }
    }

    private func gridLines(side: CGFloat) -> some View {
        let cell = side / 9
        return ZStack {
            ForEach(0...9, id: \.self) { i in
                let isThick = i % 3 == 0
                let width: CGFloat = isThick ? 2 : 0.5
                let color: Color = isThick ? .primary : .secondary
                Rectangle()
                    .fill(color)
                    .frame(width: side, height: width)
                    .position(x: side / 2, y: cell * CGFloat(i))
                Rectangle()
                    .fill(color)
                    .frame(width: width, height: side)
                    .position(x: cell * CGFloat(i), y: side / 2)
            }
        }
        .allowsHitTesting(false)
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
