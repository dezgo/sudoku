//
//  CellView.swift
//  Sudoku
//

import SwiftUI

struct CellView: View {
    let cell: Cell
    let isSelected: Bool
    let isHighlighted: Bool
    let isMatching: Bool
    let isError: Bool
    let isLocked: Bool

    var body: some View {
        ZStack {
            background
            content
        }
        .aspectRatio(1, contentMode: .fit)
        .contentShape(Rectangle())
    }

    private var valueColor: Color {
        if isError { return .red }
        return .primary
    }

    private var background: Color {
        if isSelected { return Color.yellow.opacity(0.55) }
        if isMatching { return Color.accentColor.opacity(0.45) }
        if isHighlighted { return Color.accentColor.opacity(0.30) }
        return Color(.systemBackground)
    }

    @ViewBuilder
    private var content: some View {
        if let v = cell.value {
            Text("\(v)")
                .font(.system(size: 24, weight: isLocked ? .bold : .regular, design: .rounded))
                .foregroundStyle(valueColor)
        } else if !cell.notes.isEmpty {
            notesGrid
        }
    }

    private var notesGrid: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) / 3
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { r in
                    HStack(spacing: 0) {
                        ForEach(0..<3, id: \.self) { c in
                            let n = r * 3 + c + 1
                            Text(cell.notes.contains(n) ? "\(n)" : " ")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                                .foregroundStyle(.secondary)
                                .frame(width: side, height: side)
                        }
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .center)
        }
        .padding(2)
    }
}
