//
//  BoardView.swift
//  Sudoku
//

import SwiftUI

struct BoardView: View {
    @ObservedObject var game: SudokuGame

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let cellSide = side / 9

            ZStack(alignment: .topLeading) {
                // Cells
                VStack(spacing: 0) {
                    ForEach(0..<9, id: \.self) { row in
                        HStack(spacing: 0) {
                            ForEach(0..<9, id: \.self) { col in
                                CellView(
                                    cell: game.cells[row][col],
                                    isSelected: game.selected?.row == row && game.selected?.col == col,
                                    isHighlighted: game.isHighlighted(row: row, col: col)
                                        || game.isUnavailableForSelectedValue(row: row, col: col),
                                    isMatching: game.isMatchingNumber(row: row, col: col),
                                    isError: game.highlightMistakes && game.hasConflict(row: row, col: col),
                                    isLocked: game.isLocked(row: row, col: col)
                                )
                                .frame(width: cellSide, height: cellSide)
                                .onTapGesture { game.select(row: row, col: col) }
                            }
                        }
                    }
                }

                // Grid lines
                gridLines(side: side)

                if game.isPaused {
                    pauseCover(side: side)
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func pauseCover(side: CGFloat) -> some View {
        ZStack {
            Rectangle()
                .fill(Color(.systemBackground))
            VStack(spacing: 12) {
                Image(systemName: "pause.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.secondary)
                Text("Paused")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
                Button("Resume") { game.togglePause() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(width: side, height: side)
        .contentShape(Rectangle())
    }

    private func gridLines(side: CGFloat) -> some View {
        let cell = side / 9
        return ZStack {
            // Thin lines for every cell boundary.
            ForEach(0...9, id: \.self) { i in
                let isThick = i % 3 == 0
                let width: CGFloat = isThick ? 2 : 0.5
                let color: Color = isThick ? .primary : .secondary

                // Horizontal
                Rectangle()
                    .fill(color)
                    .frame(width: side, height: width)
                    .position(x: side / 2, y: cell * CGFloat(i))

                // Vertical
                Rectangle()
                    .fill(color)
                    .frame(width: width, height: side)
                    .position(x: cell * CGFloat(i), y: side / 2)
            }
        }
        .allowsHitTesting(false)
    }
}
