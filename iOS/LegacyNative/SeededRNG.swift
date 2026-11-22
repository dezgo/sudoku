//
//  SeededRNG.swift
//  Sudoku
//

import Foundation

/// Linear congruential generator. Deterministic given the seed — used both
/// to produce stable variant transforms in `HardcodedPuzzleProvider` and to
/// deterministically generate daily puzzles in `GeneratedPuzzleProvider`.
struct SeededRNG: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { self.state = seed == 0 ? 1 : seed }
    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
