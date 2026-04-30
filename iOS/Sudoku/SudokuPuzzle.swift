//
//  SudokuPuzzle.swift
//  Sudoku
//

import Foundation

enum Difficulty: String, Codable, CaseIterable, Identifiable {
    case easy, medium, hard
    var id: String { rawValue }
    var label: String {
        switch self {
        case .easy: return "Easy"
        case .medium: return "Medium"
        case .hard: return "Hard"
        }
    }
}

struct Puzzle: Codable {
    let id: Int
    let difficulty: Difficulty
    /// 9x9. 0 means empty.
    let givens: [[Int]]
    /// Filled solution, if known. Optional so future generators or unsourced
    /// puzzles don't need to provide one.
    let solution: [[Int]]?

    init(id: Int, difficulty: Difficulty, givens: [[Int]], solution: [[Int]]?) {
        self.id = id
        self.difficulty = difficulty
        self.givens = givens
        self.solution = solution
    }

    /// True if this puzzle's ID looks like a daily (YYYYMMDD-shaped Int).
    var isDaily: Bool { id >= 19700101 && id <= 99991231 }

    /// Human-readable label for headers / lists. Dailies show as
    /// "Daily · Apr 29"; generated puzzles show as "Puzzle #1042".
    var displayLabel: String {
        if isDaily,
           let date = DateComponents(
               calendar: .current,
               year: id / 10000,
               month: (id / 100) % 100,
               day: id % 100
           ).date {
            return "Daily · " + date.formatted(.dateTime.month(.abbreviated).day())
        }
        return "Puzzle #\(id)"
    }


    private enum CodingKeys: String, CodingKey {
        case id, difficulty, givens, solution
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        // Default to medium for old saves that pre-date the difficulty field.
        difficulty = (try? c.decode(Difficulty.self, forKey: .difficulty)) ?? .medium
        givens = try c.decode([[Int]].self, forKey: .givens)
        solution = try c.decodeIfPresent([[Int]].self, forKey: .solution)
    }
}

/// Three hand-curated source puzzles, one per difficulty tier. Each gets
/// expanded into a small pool of validity-preserving variants by the
/// HardcodedPuzzleProvider. All three share the same underlying solution
/// (the famous Wikipedia easy puzzle's solution) — the difficulty differs
/// only in how many cells are revealed up front.
enum SudokuPuzzle {
    static let solution: [[Int]] = [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ]

    /// 48 givens — gentle introduction.
    static let easy = Puzzle(
        id: 0,
        difficulty: .easy,
        givens: [
            [5, 0, 4, 6, 0, 8, 0, 1, 2],
            [0, 7, 2, 0, 9, 0, 3, 0, 8],
            [1, 9, 0, 3, 0, 2, 5, 0, 7],
            [0, 5, 9, 0, 6, 0, 4, 2, 0],
            [4, 0, 6, 8, 0, 3, 7, 0, 1],
            [7, 1, 0, 0, 2, 0, 0, 5, 6],
            [0, 6, 1, 5, 0, 7, 0, 8, 0],
            [2, 0, 7, 0, 1, 0, 6, 3, 0],
            [0, 4, 0, 2, 0, 6, 1, 0, 9],
        ],
        solution: solution
    )

    /// 30 givens — the classic Wikipedia example.
    static let medium = Puzzle(
        id: 0,
        difficulty: .medium,
        givens: [
            [5, 3, 0, 0, 7, 0, 0, 0, 0],
            [6, 0, 0, 1, 9, 5, 0, 0, 0],
            [0, 9, 8, 0, 0, 0, 0, 6, 0],
            [8, 0, 0, 0, 6, 0, 0, 0, 3],
            [4, 0, 0, 8, 0, 3, 0, 0, 1],
            [7, 0, 0, 0, 2, 0, 0, 0, 6],
            [0, 6, 0, 0, 0, 0, 2, 8, 0],
            [0, 0, 0, 4, 1, 9, 0, 0, 5],
            [0, 0, 0, 0, 8, 0, 0, 7, 9],
        ],
        solution: solution
    )

    /// 24 givens — sparser, asks for harder logic.
    static let hard = Puzzle(
        id: 0,
        difficulty: .hard,
        givens: [
            [5, 0, 0, 0, 7, 0, 0, 0, 0],
            [6, 0, 0, 1, 9, 0, 0, 0, 0],
            [0, 9, 8, 0, 0, 0, 0, 6, 0],
            [8, 0, 0, 0, 6, 0, 0, 0, 0],
            [4, 0, 0, 8, 0, 3, 0, 0, 1],
            [0, 0, 0, 0, 2, 0, 0, 0, 6],
            [0, 6, 0, 0, 0, 0, 2, 8, 0],
            [0, 0, 0, 4, 1, 9, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 7, 9],
        ],
        solution: solution
    )

    static let allSources: [Puzzle] = [easy, medium, hard]
}
