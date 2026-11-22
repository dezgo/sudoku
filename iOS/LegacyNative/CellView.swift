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
    var tutorHighlight: TutorHighlight.Kind? = nil
    var tutorCandidateColors: [Int: Color] = [:]

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
        if let kind = tutorHighlight {
            switch kind {
            case .target: return Color.green.opacity(0.45)
            case .eliminator: return Color.orange.opacity(0.30)
            case .focus: return Color.blue.opacity(0.18)
            }
        }
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
            // Always render the user's own pencil marks. Tutor calls out
            // specific digits by tinting them — never synthesises marks the
            // user didn't write.
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
                            let isUserMarked = cell.notes.contains(n)
                            let tint = isUserMarked ? (tutorCandidateColors[n] ?? .secondary) : .secondary
                            Text(isUserMarked ? "\(n)" : " ")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                                .foregroundStyle(tint)
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
