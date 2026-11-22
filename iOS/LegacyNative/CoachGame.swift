//
//  CoachGame.swift
//  Sudoku
//
//  Minimal play-state model for a Coach scenario. Mirrors the small slice
//  of `SudokuGame` we actually need (cells + selection + place/pencil) and
//  drops everything else (timer, mistakes, save/restore, daily plumbing).
//  Completion is decided by comparing the user's actions against the
//  engine's expected hint snapshotted at scenario start.
//

import Foundation

@MainActor
final class CoachGame: ObservableObject {
    @Published private(set) var cells: [[Cell]]
    @Published var selected: (row: Int, col: Int)?
    @Published var mode: InputMode
    @Published private(set) var isComplete: Bool = false

    let scenario: CoachScenario
    private let expected: TutorHint

    /// Snapshot of the user's pencil marks at scenario start, by cell. Used
    /// to detect whether the user has *removed* the expected eliminations
    /// (rather than just having those candidates absent because they never
    /// were there).
    private let initialNotes: [[Set<Int>]]

    init?(scenario: CoachScenario) {
        // Refuse to load an invalid scenario rather than leading the user
        // into a "no expected hint exists" dead end.
        guard let expected = scenario.expectedHint, expected.technique == scenario.technique else {
            return nil
        }
        self.scenario = scenario
        self.expected = expected
        self.cells = scenario.initialCells
        self.initialNotes = scenario.initialCells.map { row in row.map { $0.notes } }
        // Default to pencil mode for elimination scenarios; normal mode for
        // placement scenarios. Saves the user a tap on the most common path.
        self.mode = expected.placement != nil ? .normal : .pencil
    }

    func select(row: Int, col: Int) {
        if let sel = selected, sel.row == row && sel.col == col {
            selected = nil
            return
        }
        selected = (row, col)
    }

    func toggleMode() {
        mode = (mode == .normal) ? .pencil : .normal
    }

    /// Place a value (normal mode) or toggle a pencil mark (pencil mode) at
    /// the selected cell. Fixed cells are no-ops. Completion is re-evaluated
    /// after every change.
    func enter(_ number: Int) {
        guard !isComplete, let sel = selected else { return }
        var cell = cells[sel.row][sel.col]
        guard !cell.isFixed else { return }
        switch mode {
        case .normal:
            cell.value = (cell.value == number) ? nil : number
            cell.notes = []
        case .pencil:
            // Pencilling into a filled cell first clears the value.
            cell.value = nil
            if cell.notes.contains(number) {
                cell.notes.remove(number)
            } else {
                cell.notes.insert(number)
            }
        }
        cells[sel.row][sel.col] = cell
        recheckCompletion()
    }

    func clearSelection() {
        guard !isComplete, let sel = selected else { return }
        var cell = cells[sel.row][sel.col]
        guard !cell.isFixed else { return }
        cell.value = nil
        cell.notes = []
        cells[sel.row][sel.col] = cell
        recheckCompletion()
    }

    func reset() {
        cells = scenario.initialCells
        selected = nil
        mode = expected.placement != nil ? .normal : .pencil
        isComplete = false
    }

    // MARK: - Completion

    private func recheckCompletion() {
        if let placement = expected.placement {
            // Placement scenarios complete when the target cell holds the
            // expected value. The user can have other unrelated changes —
            // we only care about the one move.
            if cells[placement.row][placement.col].value == placement.value {
                isComplete = true
            }
        } else {
            // Elimination scenarios complete when *every* expected
            // (cell, candidate) elimination has actually been performed by
            // the user — i.e., the candidate was in the initial notes and
            // is gone now. Extra eliminations elsewhere are tolerated; the
            // user is taught the technique by being asked to do it, not
            // graded on perfectionism beyond that.
            for elim in expected.eliminations {
                let initial = initialNotes[elim.row][elim.col]
                let current = cells[elim.row][elim.col].notes
                let stillPresent = elim.candidates.intersection(current)
                if !stillPresent.isEmpty {
                    return  // not yet
                }
                // Sanity: each expected candidate should have been in the
                // initial notes (otherwise the scenario was mis-built and
                // there's nothing for the user to remove).
                let everPresent = elim.candidates.intersection(initial)
                if everPresent.isEmpty {
                    return
                }
            }
            isComplete = true
        }
    }
}
