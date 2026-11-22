//
//  BoardView.swift
//  Sudoku
//

import SwiftUI

struct BoardView: View {
    @ObservedObject var game: SudokuGame
    /// When non-nil, the tutor is active: cells receive tutor tints and the
    /// usual selection / matching / highlighting tints are suppressed so the
    /// step's narration stays visually unambiguous.
    var tutorHighlights: [TutorHighlight]? = nil

    private var tutorActive: Bool { tutorHighlights != nil }

    /// Resolves the tutor decoration for a single cell. The cell's background
    /// tint comes from the highest-priority kind among matching highlights
    /// (target > eliminator > focus). The candidate-digit color map lets a
    /// single cell tint different digits differently — needed for hidden
    /// pair, where the pair digits stay (green) and the others get crossed
    /// out (red) all in the same cell.
    private func tutorInfo(row: Int, col: Int) -> (kind: TutorHighlight.Kind, colors: [Int: Color])? {
        guard let highlights = tutorHighlights else { return nil }
        var bestKind: TutorHighlight.Kind?
        var digitKinds: [Int: TutorHighlight.Kind] = [:]
        for h in highlights where h.row == row && h.col == col {
            switch h.kind {
            case .target:
                bestKind = .target
            case .eliminator:
                if bestKind != .target { bestKind = .eliminator }
            case .focus:
                if bestKind == nil { bestKind = .focus }
            }
            // Per-digit kind: target wins over eliminator for the same digit.
            for d in h.candidates {
                let existing = digitKinds[d]
                if existing == nil || (existing == .eliminator && h.kind == .target) {
                    digitKinds[d] = h.kind
                }
            }
        }
        guard let kind = bestKind else { return nil }
        let colors: [Int: Color] = digitKinds.compactMapValues { k in
            switch k {
            case .target: return .green
            case .eliminator: return .red
            case .focus: return nil  // focus doesn't tint candidates
            }
        }
        return (kind, colors)
    }

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
                                let info = tutorInfo(row: row, col: col)
                                CellView(
                                    cell: game.cells[row][col],
                                    isSelected: !tutorActive && game.selected?.row == row && game.selected?.col == col,
                                    isHighlighted: !tutorActive && (game.isHighlighted(row: row, col: col)
                                        || game.isUnavailableForSelectedValue(row: row, col: col)),
                                    isMatching: !tutorActive && game.isMatchingNumber(row: row, col: col),
                                    isError: !tutorActive && game.highlightMistakes && game.hasConflict(row: row, col: col),
                                    isLocked: game.isLocked(row: row, col: col),
                                    tutorHighlight: info?.kind,
                                    tutorCandidateColors: info?.colors ?? [:]
                                )
                                .frame(width: cellSide, height: cellSide)
                                .onTapGesture {
                                    if !tutorActive { game.select(row: row, col: col) }
                                }
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
