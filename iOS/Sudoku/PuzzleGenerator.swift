//
//  PuzzleGenerator.swift
//  Sudoku
//

import Foundation

/// A real Sudoku puzzle generator: produces an independent solved grid per
/// call, then carves a puzzle out of it by removing cells while keeping the
/// solution unique. Used as the production `PuzzleProvider`.
///
/// To keep "New Game" responsive, generated puzzles are pre-built into a
/// small per-difficulty buffer on a background queue. `nextPuzzle` pops from
/// the buffer; if it's empty (e.g. on first launch before the bg queue has
/// filled it), generation falls back to synchronous on the calling thread.
final class GeneratedPuzzleProvider: PuzzleProvider {
    private let generator = SudokuGridGenerator()
    private let bgQueue = DispatchQueue(label: "sudoku.puzzle-gen", qos: .utility)
    private let lock = NSLock()
    private var queues: [Difficulty: [Puzzle]] = [.easy: [], .medium: [], .hard: []]
    private var dailyCache: [Int: Puzzle] = [:]
    private var nextID: Int = 1000

    /// How many ready-to-go puzzles to keep cached per difficulty. Each
    /// generated puzzle now runs through up-to-25 generate-and-classify
    /// retries (technique-tier validation) so the buffer fill is genuinely
    /// expensive — kept small to avoid CPU saturation on cold start.
    private static let bufferSize = 1

    init() {
        for d in Difficulty.allCases {
            let dCopy = d
            bgQueue.async { [weak self] in self?.refill(difficulty: dCopy) }
        }
        // Pre-warm today's daily so tapping it from home is instant.
        bgQueue.async { [weak self] in
            _ = self?.dailyPuzzle(for: Date())
        }
    }

    func nextPuzzle(difficulty: Difficulty, excluding excludedIDs: Set<Int>) -> Puzzle {
        // ID-based exclusion is meaningless for an infinite generator (every
        // puzzle has a unique fresh ID), so excludedIDs is ignored — we just
        // hand out the next thing in the buffer.
        lock.lock()
        let pre = queues[difficulty]?.popLast()
        lock.unlock()

        // Always trigger a bg refill so the buffer stays warm.
        bgQueue.async { [weak self] in self?.refill(difficulty: difficulty) }

        if let p = pre { return p }
        // Fallback: generate synchronously. This blocks the caller — only
        // expected on the very first New Game / fresh launch before the
        // background buffer has filled.
        return generate(difficulty: difficulty)
    }

    private func refill(difficulty: Difficulty) {
        while true {
            lock.lock()
            let count = queues[difficulty]?.count ?? 0
            lock.unlock()
            if count >= Self.bufferSize { return }
            let p = generate(difficulty: difficulty)
            lock.lock()
            queues[difficulty]?.append(p)
            lock.unlock()
        }
    }

    func dailyPuzzle(for date: Date) -> Puzzle {
        let id = DailyPuzzle.id(for: date)
        lock.lock()
        if let cached = dailyCache[id] {
            lock.unlock()
            return cached
        }
        lock.unlock()

        var rng = SeededRNG(seed: DailyPuzzle.seed(for: date))
        let solution = generator.generateSolution(rng: &rng)
        let givens = generator.makePuzzle(
            from: solution,
            targetGivens: Self.targetGivens(for: DailyPuzzle.difficulty),
            rng: &rng
        )
        let puzzle = Puzzle(
            id: id,
            difficulty: DailyPuzzle.difficulty,
            givens: givens,
            solution: solution
        )

        lock.lock()
        dailyCache[id] = puzzle
        lock.unlock()
        return puzzle
    }

    private func generate(difficulty: Difficulty) -> Puzzle {
        // Generate-and-classify loop: produce candidates and accept only
        // those whose hardest required technique matches the requested
        // tier. Without this, difficulty was decided by clue count alone
        // (a crude proxy that produced "Medium" puzzles needing X-Wings
        // and "Hard" puzzles solvable with naked singles). See SPEC §13.10.
        let target = Self.expectedTier(for: difficulty)
        var rng = SystemRandomNumberGenerator()
        var lastFallback: Puzzle?
        for _ in 0..<25 {
            let solution = generator.generateSolution(rng: &rng)
            let givens = generator.makePuzzle(
                from: solution,
                targetGivens: Self.targetGivens(for: difficulty),
                rng: &rng
            )
            let id = nextIDValue()
            let puzzle = Puzzle(id: id, difficulty: difficulty, givens: givens, solution: solution)
            let cells = Self.cellsFromGivens(givens)
            if TutorEngine.classify(cells: cells) == target {
                return puzzle
            }
            // Hold onto the most recent candidate — used as a graceful
            // fallback if 25 attempts fail to land on-tier (rare; keeps
            // the buffer queue from starving on a slow patch).
            lastFallback = puzzle
        }
        return lastFallback ?? {
            let solution = generator.generateSolution(rng: &rng)
            let givens = generator.makePuzzle(
                from: solution,
                targetGivens: Self.targetGivens(for: difficulty),
                rng: &rng
            )
            return Puzzle(id: nextIDValue(), difficulty: difficulty, givens: givens, solution: solution)
        }()
    }

    private static func expectedTier(for difficulty: Difficulty) -> TutorTechnique.Tier {
        switch difficulty {
        case .easy: return .simple
        case .medium: return .medium
        case .hard: return .hard
        }
    }

    private static func cellsFromGivens(_ givens: [[Int]]) -> [[Cell]] {
        givens.map { row in
            row.map { v in
                if v == 0 { return Cell(value: nil, isFixed: false, notes: []) }
                return Cell(value: v, isFixed: true, notes: [])
            }
        }
    }

    private func nextIDValue() -> Int {
        lock.lock()
        defer { lock.unlock() }
        let id = nextID
        nextID += 1
        return id
    }

    private static func targetGivens(for difficulty: Difficulty) -> Int {
        switch difficulty {
        case .easy: return 48
        case .medium: return 32
        case .hard: return 26
        }
    }
}

// MARK: - Generator + solver

/// Generates random complete Sudoku grids and carves puzzles out of them.
private final class SudokuGridGenerator {
    private let solver = SudokuSolver()

    /// Random fully-filled valid 9×9 grid.
    func generateSolution<G: RandomNumberGenerator>(rng: inout G) -> [[Int]] {
        var grid = Array(repeating: Array(repeating: 0, count: 9), count: 9)
        _ = fill(&grid, rng: &rng)
        return grid
    }

    private func fill<G: RandomNumberGenerator>(_ grid: inout [[Int]], rng: inout G) -> Bool {
        guard let (r, c) = firstEmpty(in: grid) else { return true }
        var digits = Array(1...9)
        digits.shuffle(using: &rng)
        for d in digits where canPlace(d, at: r, c, in: grid) {
            grid[r][c] = d
            if fill(&grid, rng: &rng) { return true }
            grid[r][c] = 0
        }
        return false
    }

    /// Remove cells from a solved grid, preserving uniqueness of solution,
    /// until the given target hint count is reached (or no more cells can be
    /// removed without introducing ambiguity).
    func makePuzzle<G: RandomNumberGenerator>(
        from solution: [[Int]],
        targetGivens: Int,
        rng: inout G
    ) -> [[Int]] {
        var grid = solution
        var positions = (0..<81).map { ($0 / 9, $0 % 9) }
        positions.shuffle(using: &rng)
        var givens = 81
        for (r, c) in positions {
            if givens <= targetGivens { break }
            let saved = grid[r][c]
            grid[r][c] = 0
            if solver.hasUniqueSolution(grid) {
                givens -= 1
            } else {
                grid[r][c] = saved
            }
        }
        return grid
    }

    private func firstEmpty(in grid: [[Int]]) -> (row: Int, col: Int)? {
        for r in 0..<9 {
            for c in 0..<9 where grid[r][c] == 0 {
                return (r, c)
            }
        }
        return nil
    }

    private func canPlace(_ d: Int, at r: Int, _ c: Int, in grid: [[Int]]) -> Bool {
        for i in 0..<9 {
            if grid[r][i] == d || grid[i][c] == d { return false }
        }
        let boxR = (r / 3) * 3, boxC = (c / 3) * 3
        for rr in boxR..<boxR + 3 {
            for cc in boxC..<boxC + 3 where grid[rr][cc] == d {
                return false
            }
        }
        return true
    }
}

/// Backtracking Sudoku solver with the Minimum Remaining Values heuristic.
/// Stops once it has found `limit` solutions — used both for actually solving
/// a puzzle (limit=1) and for uniqueness checks (limit=2).
private final class SudokuSolver {
    func hasUniqueSolution(_ grid: [[Int]]) -> Bool {
        var grid = grid
        var solutions: [[[Int]]] = []
        _ = search(&grid, limit: 2, into: &solutions)
        return solutions.count == 1
    }

    private func search(_ grid: inout [[Int]], limit: Int, into results: inout [[[Int]]]) -> Bool {
        if results.count >= limit { return true }
        guard let mrv = mrvCell(grid: grid) else {
            results.append(grid)
            return results.count >= limit
        }
        if mrv.candidates.isEmpty { return false }
        for d in mrv.candidates {
            grid[mrv.row][mrv.col] = d
            if search(&grid, limit: limit, into: &results) {
                grid[mrv.row][mrv.col] = 0
                return results.count >= limit
            }
            grid[mrv.row][mrv.col] = 0
        }
        return false
    }

    private func mrvCell(grid: [[Int]]) -> (row: Int, col: Int, candidates: [Int])? {
        var best: (row: Int, col: Int, candidates: [Int])?
        var bestCount = 10
        for r in 0..<9 {
            for c in 0..<9 where grid[r][c] == 0 {
                let cands = candidates(at: r, c, in: grid)
                if cands.count < bestCount {
                    bestCount = cands.count
                    best = (r, c, cands)
                    if bestCount <= 1 { return best }
                }
            }
        }
        return best
    }

    private func candidates(at r: Int, _ c: Int, in grid: [[Int]]) -> [Int] {
        var available: Set<Int> = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        for i in 0..<9 {
            available.remove(grid[r][i])
            available.remove(grid[i][c])
        }
        let boxR = (r / 3) * 3, boxC = (c / 3) * 3
        for rr in boxR..<boxR + 3 {
            for cc in boxC..<boxC + 3 {
                available.remove(grid[rr][cc])
            }
        }
        return Array(available)
    }
}
