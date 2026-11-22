//
//  PuzzleProvider.swift
//  Sudoku
//

import Foundation

protocol PuzzleProvider {
    func nextPuzzle(difficulty: Difficulty, excluding excludedIDs: Set<Int>) -> Puzzle
    /// The puzzle for a given calendar date — same on every device for the
    /// same date. Currently always at `DailyPuzzle.difficulty`.
    func dailyPuzzle(for date: Date) -> Puzzle
}

/// Holds a fixed pool of puzzles across three difficulty tiers (Easy, Medium,
/// Hard). Each tier starts from a hand-curated source, then generates
/// validity-preserving variants via digit relabel, row/column shuffles within
/// bands and stacks, and an optional transpose. Same transformations apply
/// to givens and solution in lockstep so each variant ships with its own
/// correct solution. Replace with a real difficulty-aware generator without
/// touching SudokuGame.
final class HardcodedPuzzleProvider: PuzzleProvider {
    private let puzzles: [Puzzle]

    /// Variants per source difficulty, including the source itself.
    private static let perDifficulty = 7

    init() {
        var generated: [Puzzle] = []
        var rng = SeededRNG(seed: 0xC0FFEE)
        var nextID = 1

        for source in SudokuPuzzle.allSources {
            // First entry: the source puzzle itself.
            generated.append(Puzzle(
                id: nextID,
                difficulty: source.difficulty,
                givens: source.givens,
                solution: source.solution
            ))
            nextID += 1

            // Then variants.
            for _ in 1..<Self.perDifficulty {
                let t = GridTransform(rng: &rng)
                let g = t.apply(to: source.givens)
                let s = source.solution.map { t.apply(to: $0) }
                generated.append(Puzzle(
                    id: nextID,
                    difficulty: source.difficulty,
                    givens: g,
                    solution: s
                ))
                nextID += 1
            }
        }
        self.puzzles = generated
    }

    func nextPuzzle(difficulty: Difficulty, excluding excludedIDs: Set<Int>) -> Puzzle {
        let inDifficulty = puzzles.filter { $0.difficulty == difficulty }
        let candidates = inDifficulty.filter { !excludedIDs.contains($0.id) }
        if let pick = candidates.randomElement() { return pick }
        // All puzzles in this difficulty are excluded (touched/completed) —
        // fall back to any puzzle of this difficulty so the user still gets
        // something at the requested level.
        return inDifficulty.randomElement() ?? puzzles.first ?? SudokuPuzzle.medium
    }

    /// Hardcoded provider doesn't generate; just hand back the medium
    /// puzzle stamped with the daily ID so completion bookkeeping in the
    /// rest of the app still works the same in previews/tests.
    func dailyPuzzle(for date: Date) -> Puzzle {
        Puzzle(
            id: DailyPuzzle.id(for: date),
            difficulty: DailyPuzzle.difficulty,
            givens: SudokuPuzzle.medium.givens,
            solution: SudokuPuzzle.medium.solution
        )
    }
}

/// A captured set of validity-preserving Sudoku grid transformations.
/// The same instance can be applied to both a puzzle's givens and its
/// solution so the two stay aligned.
private struct GridTransform {
    let digitPerm: [Int]
    let rowOrders: [[Int]]   // 3 bands × 3 rows
    let bandOrder: [Int]
    let colOrders: [[Int]]   // 3 stacks × 3 cols
    let stackOrder: [Int]
    let transpose: Bool

    init(rng: inout SeededRNG) {
        var perm = Array(1...9); perm.shuffle(using: &rng)
        self.digitPerm = perm
        self.rowOrders = (0..<3).map { _ in
            var o = [0, 1, 2]; o.shuffle(using: &rng); return o
        }
        var bo = [0, 1, 2]; bo.shuffle(using: &rng)
        self.bandOrder = bo
        self.colOrders = (0..<3).map { _ in
            var o = [0, 1, 2]; o.shuffle(using: &rng); return o
        }
        var so = [0, 1, 2]; so.shuffle(using: &rng)
        self.stackOrder = so
        self.transpose = (rng.next() % 2 == 0)
    }

    func apply(to grid: [[Int]]) -> [[Int]] {
        var grid = grid

        // 1. Digit relabel.
        grid = grid.map { row in row.map { v in v == 0 ? 0 : digitPerm[v - 1] } }

        // 2. Shuffle rows within each band.
        for band in 0..<3 {
            let base = band * 3
            let rows = (0..<3).map { grid[base + $0] }
            for i in 0..<3 { grid[base + i] = rows[rowOrders[band][i]] }
        }

        // 3. Shuffle the bands themselves.
        var permuted = grid
        for newBand in 0..<3 {
            for r in 0..<3 {
                permuted[newBand * 3 + r] = grid[bandOrder[newBand] * 3 + r]
            }
        }
        grid = permuted

        // 4. Shuffle columns within each stack.
        for stack in 0..<3 {
            let base = stack * 3
            let cols = (0..<3).map { c in grid.map { row in row[base + c] } }
            for i in 0..<3 {
                let col = cols[colOrders[stack][i]]
                for r in 0..<9 { grid[r][base + i] = col[r] }
            }
        }

        // 5. Shuffle the stacks themselves.
        var permuted2 = grid
        for newStack in 0..<3 {
            for c in 0..<3 {
                for r in 0..<9 {
                    permuted2[r][newStack * 3 + c] = grid[r][stackOrder[newStack] * 3 + c]
                }
            }
        }
        grid = permuted2

        // 6. Optional transpose.
        if transpose {
            var t = Array(repeating: Array(repeating: 0, count: 9), count: 9)
            for r in 0..<9 {
                for c in 0..<9 { t[c][r] = grid[r][c] }
            }
            grid = t
        }

        return grid
    }
}

