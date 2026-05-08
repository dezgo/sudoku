//
//  CoachMode.swift
//  Sudoku
//
//  Coach Mode: short, tightly-scoped scenarios where the user is asked to
//  apply a specific tutor technique on a pre-built board. Completing each
//  scenario unlocks a per-technique trophy.
//
//  Scenarios are built by lifting a board state from `TutorTests` (where
//  each technique already has a hand-crafted firing example) and then
//  *fast-forwarding* through any simpler techniques that the engine's
//  global `findHint` would catch first — so by the time the user sees the
//  board, the target technique is unambiguously the next useful move.
//

import Foundation

/// One coach scenario: a pre-filled board state where the named technique is
/// the next useful move. The play view derives the *expected* tutor hint at
/// load time so we never store a stale move; the engine is the source of
/// truth for what counts as "correct."
struct CoachScenario: Identifiable {
    let id: String           // matches TutorTechnique.rawValue
    let technique: TutorTechnique
    let title: String        // e.g. "Naked Single"
    let intro: String        // one-sentence task description shown above the board
    let initialCells: [[Cell]]

    /// The hint the engine returns for `initialCells`. nil only if the
    /// scenario is mis-constructed — surfaced via `isValid` so a broken
    /// scenario fails loudly during development rather than silently
    /// confusing the user.
    var expectedHint: TutorHint? { TutorEngine.findHint(cells: initialCells) }

    /// True when the engine returns a hint of the expected technique.
    var isValid: Bool { expectedHint?.technique == technique }
}

extension CoachScenario {

    /// All scenarios in display order (simple → hard). Built lazily so the
    /// fast-forwarder runs once on first access and caches.
    static let all: [CoachScenario] = build()

    /// Subset that actually validates — defensive net so a scenario that
    /// fails to fast-forward (e.g. simpler-technique cycle) doesn't crash
    /// the play view.
    static var validScenarios: [CoachScenario] { all.filter { $0.isValid } }

    private static func build() -> [CoachScenario] {
        // v1 ships 7 scenarios. The remaining techniques (Hidden Triple,
        // X-Wing, XY-Wing, Swordfish, Naked Quad, Hidden Quad, Jellyfish)
        // need hand-crafted boards where the target technique is the first
        // useful engine move — the test boards trigger simpler patterns
        // first under findHint (e.g. X-Wing with bivalue cells degrades to
        // a naked pair). Coming in a follow-up with proper boards.
        [
            nakedSingle(),
            hiddenSingle(),
            nakedPair(),
            pointingPair(),
            boxLineReduction(),
            hiddenPair(),
            nakedTriple()
        ].compactMap { $0 }
    }

    // MARK: - Board helpers

    /// Build a Cells grid from a compact int matrix where 0 = empty (free)
    /// and 1-9 = a fixed given. Mirrors the test helper.
    private static func cellsFromGivens(_ grid: [[Int]]) -> [[Cell]] {
        precondition(grid.count == 9)
        return grid.map { row in
            precondition(row.count == 9)
            return row.map { v in
                if v == 0 { return Cell(value: nil, isFixed: false, notes: []) }
                return Cell(value: v, isFixed: true, notes: [])
            }
        }
    }

    /// For each empty cell, fill its `notes` with the engine-derived
    /// candidates. Used by techniques whose detection requires user pencil
    /// marks (pair, pointing, wing, etc.).
    private static func autoPencil(_ cells: [[Cell]]) -> [[Cell]] {
        var result = cells
        for r in 0..<9 {
            for c in 0..<9 where result[r][c].value == nil {
                result[r][c].notes = candidates(row: r, col: c, in: result)
            }
        }
        return result
    }

    private static func candidates(row: Int, col: Int, in cells: [[Cell]]) -> Set<Int> {
        var cands: Set<Int> = Set(1...9)
        for c in 0..<9 where c != col {
            if let v = cells[row][c].value { cands.remove(v) }
        }
        for r in 0..<9 where r != row {
            if let v = cells[r][col].value { cands.remove(v) }
        }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 where !(r == row && c == col) {
                if let v = cells[r][c].value { cands.remove(v) }
            }
        }
        return cands
    }

    /// Apply simpler engine moves one at a time until `findHint` returns
    /// the target technique. Returns nil if the chain dead-ends or loops.
    /// Used so harder-tier coach scenarios start from a board where the
    /// target technique is unambiguously the next move (the test boards
    /// are designed for direct find* calls, not the global findHint).
    private static func fastForward(_ cells: [[Cell]], to target: TutorTechnique) -> [[Cell]]? {
        var current = autoPencil(cells)
        for _ in 0..<200 {
            guard let hint = TutorEngine.findHint(cells: current) else { return nil }
            if hint.technique == target { return current }
            if let p = hint.placement {
                current[p.row][p.col].value = p.value
                current[p.row][p.col].notes = []
                // Auto-clear the placed digit from peers' notes so the next
                // findHint sees a consistent board.
                let boxR = (p.row / 3) * 3
                let boxC = (p.col / 3) * 3
                for c in 0..<9 where c != p.col {
                    current[p.row][c].notes.remove(p.value)
                }
                for r in 0..<9 where r != p.row {
                    current[r][p.col].notes.remove(p.value)
                }
                for r in boxR..<boxR + 3 {
                    for c in boxC..<boxC + 3 where !(r == p.row && c == p.col) {
                        current[r][c].notes.remove(p.value)
                    }
                }
            } else {
                for elim in hint.eliminations {
                    current[elim.row][elim.col].notes.subtract(elim.candidates)
                }
            }
        }
        return nil
    }

    // MARK: - Scenarios (boards lifted from TutorTests so they're known-firing)

    private static func nakedSingle() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0]
        return CoachScenario(
            id: TutorTechnique.nakedSingle.rawValue,
            technique: .nakedSingle,
            title: TutorTechnique.nakedSingle.label,
            intro: "One empty cell can only hold one digit — find it and place the value.",
            initialCells: cellsFromGivens(grid)
        )
    }

    private static func hiddenSingle() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0][0] = 1; grid[0][1] = 2; grid[0][2] = 3
        grid[1][0] = 4
        grid[2][0] = 6; grid[2][1] = 7
        grid[8][2] = 5
        return CoachScenario(
            id: TutorTechnique.hiddenSingle.rawValue,
            technique: .hiddenSingle,
            title: TutorTechnique.hiddenSingle.label,
            intro: "In one of the units, a digit can only land in a single cell. Spot it and place the digit.",
            initialCells: cellsFromGivens(grid)
        )
    }

    private static func nakedPair() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0] = [0, 0, 0, 0, 5, 6, 7, 8, 9]
        grid[3][0] = 3
        grid[6][1] = 3
        grid[6][0] = 4
        grid[3][1] = 4
        return CoachScenario(
            id: TutorTechnique.nakedPair.rawValue,
            technique: .nakedPair,
            title: TutorTechnique.nakedPair.label,
            intro: "Two cells in a unit share the same two candidates. Erase those candidates from every other cell in that unit.",
            initialCells: autoPencil(cellsFromGivens(grid))
        )
    }

    private static func pointingPair() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[1] = [4, 5, 6, 0, 0, 0, 0, 0, 0]
        grid[2] = [7, 8, 9, 0, 0, 0, 0, 0, 0]
        return CoachScenario(
            id: TutorTechnique.pointingPair.rawValue,
            technique: .pointingPair,
            title: TutorTechnique.pointingPair.label,
            intro: "Inside one box, a candidate is restricted to a single row or column. Erase it from the rest of that line outside the box.",
            initialCells: autoPencil(cellsFromGivens(grid))
        )
    }

    private static func boxLineReduction() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0] = [0, 0, 0, 4, 5, 6, 7, 8, 9]
        return CoachScenario(
            id: TutorTechnique.boxLineReduction.rawValue,
            technique: .boxLineReduction,
            title: TutorTechnique.boxLineReduction.label,
            intro: "A digit is restricted to a single box within its row or column. Erase that digit from the rest of the box.",
            initialCells: autoPencil(cellsFromGivens(grid))
        )
    }

    private static func hiddenPair() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9]
        grid[1][5] = 1
        grid[1][6] = 2
        grid[2][0] = 7
        grid[2][1] = 8
        grid[2][5] = 2
        grid[3][2] = 1
        grid[5][2] = 2
        return CoachScenario(
            id: TutorTechnique.hiddenPair.rawValue,
            technique: .hiddenPair,
            title: TutorTechnique.hiddenPair.label,
            intro: "Two digits live only in two cells of a unit. Erase every *other* candidate from those two cells.",
            initialCells: autoPencil(cellsFromGivens(grid))
        )
    }

    private static func nakedTriple() -> CoachScenario {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9]
        grid[3][0] = 4
        grid[4][1] = 4
        grid[5][2] = 4
        grid[6][0] = 5
        grid[7][1] = 5
        grid[8][2] = 5
        let cells = autoPencil(cellsFromGivens(grid))
        guard let forwarded = fastForward(cells, to: .nakedTriple) else {
            return CoachScenario(
                id: TutorTechnique.nakedTriple.rawValue,
                technique: .nakedTriple,
                title: TutorTechnique.nakedTriple.label,
                intro: "",
                initialCells: cells
            )
        }
        return CoachScenario(
            id: TutorTechnique.nakedTriple.rawValue,
            technique: .nakedTriple,
            title: TutorTechnique.nakedTriple.label,
            intro: "Three cells share three candidates between them. Those digits must live in those cells — erase them from the rest of the unit.",
            initialCells: forwarded
        )
    }

    // TODO: scenarios for hiddenTriple, xWing, xyWing, swordfish, nakedQuad,
    // hiddenQuad, jellyfish. Constructing boards where these fire as the
    // *first* useful move via findHint requires hand-crafted puzzles — the
    // test boards in TutorTests.swift trigger these via direct find* calls,
    // and findHint catches simpler patterns first. Add real boards in a
    // follow-up once they've been constructed and verified against findHint.
}
