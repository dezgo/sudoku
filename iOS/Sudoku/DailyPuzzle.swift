//
//  DailyPuzzle.swift
//  Sudoku
//

import Foundation

/// Daily puzzle naming and seeding. Same date → same ID and same seed →
/// same puzzle on every device. Currently fixed to a single difficulty; if
/// we want per-tier dailies later, the seed can fold the difficulty in.
enum DailyPuzzle {
    static let difficulty: Difficulty = .medium

    /// Stable ID for a calendar date: YYYYMMDD packed into an Int. Local
    /// calendar — what counts as "today" is the user's device date.
    static func id(for date: Date) -> Int {
        let cal = Calendar.current
        let c = cal.dateComponents([.year, .month, .day], from: date)
        let y = c.year ?? 2026
        let m = c.month ?? 1
        let d = c.day ?? 1
        return y * 10000 + m * 100 + d
    }

    /// Seed for the deterministic RNG. Spread the date bits through a
    /// large multiplier so consecutive days produce visibly different
    /// generator outputs.
    static func seed(for date: Date) -> UInt64 {
        UInt64(id(for: date)) &* 0x9E37_79B9_7F4A_7C15
    }
}
