//
//  PuzzleHistory.swift
//  Sudoku
//

import Foundation

struct PuzzleResult: Codable, Identifiable {
    var id: UUID = UUID()
    let puzzleID: Int
    let completedAt: Date
    let elapsedSeconds: Int
    /// Snapshot of the puzzle so the completed board can be displayed.
    /// Optional for backwards compatibility with v1 records that didn't
    /// include it.
    let puzzle: Puzzle?
}

/// Persists completed-puzzle records to UserDefaults. Survives launches.
final class PuzzleHistory: ObservableObject {
    @Published private(set) var results: [PuzzleResult] = []

    private let storageKey = "sudoku.history.v1"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func record(_ result: PuzzleResult) {
        results.insert(result, at: 0)
        save()
    }

    func clear() {
        results = []
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([PuzzleResult].self, from: data)
        else { return }
        results = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(results) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
