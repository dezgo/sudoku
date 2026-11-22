//
//  HistoryView.swift
//  Sudoku
//

import SwiftUI

struct HistoryView: View {
    @ObservedObject var game: SudokuGame
    @ObservedObject var history: PuzzleHistory
    @ObservedObject var store: GameStore
    var onResume: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingClear = false
    @State private var viewingCompleted: PuzzleResult?

    var body: some View {
        NavigationStack {
            Group {
                if store.inProgress.isEmpty && history.results.isEmpty {
                    ContentUnavailableView(
                        "No games yet",
                        systemImage: "square.grid.3x3.square",
                        description: Text("Start a puzzle to see it here.")
                    )
                } else {
                    List {
                        if !store.inProgress.isEmpty {
                            Section("In Progress") {
                                ForEach(store.inProgress) { save in
                                    Button {
                                        game.resume(save)
                                        onResume?()
                                        dismiss()
                                    } label: {
                                        inProgressRow(save)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        if !history.results.isEmpty {
                            Section("Completed") {
                                ForEach(history.results) { result in
                                    Button {
                                        if result.puzzle != nil {
                                            viewingCompleted = result
                                        }
                                    } label: {
                                        completedRow(result)
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(result.puzzle == nil)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Games")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if !history.results.isEmpty {
                        Button("Clear", role: .destructive) {
                            confirmingClear = true
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Clear completed history?",
                isPresented: $confirmingClear,
                titleVisibility: .visible
            ) {
                Button("Clear", role: .destructive) { history.clear() }
                Button("Cancel", role: .cancel) { }
            }
            .sheet(item: $viewingCompleted) { result in
                CompletedBoardView(result: result)
            }
        }
    }

    private func inProgressRow(_ save: GameSave) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: save.puzzle.displayLabel)
                    .font(.headline)
                Text(save.lastPlayedAt, format: .dateTime.day().month().hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(formatTime(save.elapsedSeconds))
                .font(.system(.body, design: .rounded).weight(.semibold))
                .monospacedDigit()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    private func completedRow(_ result: PuzzleResult) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(headlineLabel(for: result))
                    .font(.headline)
                Text(result.completedAt, format: .dateTime.day().month().year().hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(formatTime(result.elapsedSeconds))
                .font(.system(.body, design: .rounded).weight(.semibold))
                .monospacedDigit()
            if result.puzzle != nil {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    private func headlineLabel(for result: PuzzleResult) -> String {
        if let p = result.puzzle { return p.displayLabel }
        return "Puzzle #\(result.puzzleID)"
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
