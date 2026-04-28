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

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                summary
                if let puzzle = result.puzzle {
                    board(puzzle: puzzle)
                        .padding(.horizontal, 8)
                }
                Spacer()
            }
            .padding(.vertical, 12)
            .navigationTitle("Puzzle #\(result.puzzleID)")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
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
