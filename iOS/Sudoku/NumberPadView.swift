//
//  NumberPadView.swift
//  Sudoku
//

import SwiftUI

struct NumberPadView: View {
    @ObservedObject var game: SudokuGame

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(1...9, id: \.self) { n in
                    Button {
                        game.enter(n)
                    } label: {
                        Text("\(n)")
                            .font(.system(size: 22, weight: .semibold, design: .rounded))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(Color(.secondarySystemBackground))
                            .foregroundStyle(Color.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .opacity(game.isComplete(n) ? 0 : 1)
                    .disabled(game.isComplete(n))
                }
            }

            HStack(spacing: 12) {
                Button {
                    game.toggleMode()
                } label: {
                    let on = game.mode == .pencil
                    Label(
                        on ? "Pencil On" : "Pencil Off",
                        systemImage: on ? "pencil.circle.fill" : "pencil"
                    )
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .foregroundStyle(on ? Color.white : Color.primary)
                    .background(on ? Color.accentColor : Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)

                Button {
                    game.clearSelected()
                } label: {
                    Label(
                        game.eraseLabel,
                        systemImage: game.eraseLabel == "Undo" ? "arrow.uturn.backward" : "delete.left"
                    )
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .opacity(game.canEraseSelected ? 1 : 0.4)
                .disabled(!game.canEraseSelected)
            }
        }
    }
}
