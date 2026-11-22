//
//  CoachScenarioView.swift
//  Sudoku
//
//  Play view for a single Coach scenario. Reuses CellView for rendering;
//  the rest of the chrome (timer, mistake counter, daily plumbing) is
//  intentionally absent — Coach is a focus drill, not a normal game.
//

import SwiftUI

struct CoachScenarioView: View {
    let scenario: CoachScenario

    @StateObject private var game: CoachGame
    @EnvironmentObject private var store: CoachStore
    @Environment(\.dismiss) private var dismiss

    init(scenario: CoachScenario) {
        self.scenario = scenario
        // Force-unwrap is OK here: scenarios are validated at compile-time
        // (each one comes from `CoachScenario.all`, which is verified by
        // `isValid`). A nil here means the scenario is mis-built — fail loud.
        _game = StateObject(wrappedValue: CoachGame(scenario: scenario)!)
    }

    var body: some View {
        VStack(spacing: 12) {
            introBanner
            board
            modeRow
            pad
            Spacer()
        }
        .padding()
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if game.isComplete { completionOverlay } }
        .onChange(of: game.isComplete) { _, done in
            if done { store.markComplete(scenario) }
        }
    }

    // MARK: - Subviews

    private var introBanner: some View {
        Text(scenario.intro)
            .font(.callout)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.yellow.opacity(0.15))
            )
    }

    private var board: some View {
        VStack(spacing: 0) {
            ForEach(0..<9, id: \.self) { r in
                HStack(spacing: 0) {
                    ForEach(0..<9, id: \.self) { c in
                        let isSelected = game.selected.map { $0.row == r && $0.col == c } ?? false
                        CellView(
                            cell: game.cells[r][c],
                            isSelected: isSelected,
                            isHighlighted: false,
                            isMatching: false,
                            isError: false,
                            isLocked: game.cells[r][c].isFixed
                        )
                        .border(Color.gray.opacity(0.3), width: 0.5)
                        .border(boxBorder(row: r, col: c), width: 1.5)
                        .onTapGesture { game.select(row: r, col: c) }
                    }
                }
            }
        }
        .background(Color.gray.opacity(0.15))
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
    }

    /// Thicker borders at box boundaries (every 3rd line). Cheaper than a
    /// full grid-overlay and keeps the cell view as-is.
    private func boxBorder(row: Int, col: Int) -> Color {
        // Only draw on the outside / box-boundary cells; otherwise
        // transparent so the regular .gray border shows through.
        let onBoxRow = row % 3 == 0 || row == 8
        let onBoxCol = col % 3 == 0 || col == 8
        if onBoxRow || onBoxCol { return .primary.opacity(0.7) }
        return .clear
    }

    private var modeRow: some View {
        HStack(spacing: 12) {
            Button {
                game.toggleMode()
            } label: {
                Label(
                    game.mode == .pencil ? "Pencil" : "Normal",
                    systemImage: game.mode == .pencil ? "pencil" : "square.and.pencil"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button(role: .destructive) {
                game.reset()
            } label: {
                Label("Reset", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    private var pad: some View {
        HStack(spacing: 6) {
            ForEach(1...9, id: \.self) { n in
                Button {
                    game.enter(n)
                } label: {
                    Text("\(n)")
                        .font(.title2.monospacedDigit())
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
            Button {
                game.clearSelection()
            } label: {
                Image(systemName: "delete.left")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
        }
    }

    private var completionOverlay: some View {
        VStack(spacing: 16) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 64))
                .foregroundStyle(.yellow)
            Text("Nice — \(scenario.title) cleared.")
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
            Button {
                dismiss()
            } label: {
                Text("Back to Coach")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(28)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(.regularMaterial)
        )
        .padding(28)
    }
}
