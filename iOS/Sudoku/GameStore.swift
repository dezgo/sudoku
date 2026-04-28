//
//  GameStore.swift
//  Sudoku
//

import Foundation

/// A snapshot of an in-progress game so it can be resumed later.
struct GameSave: Codable, Identifiable {
    var id: Int { puzzle.id }
    let puzzle: Puzzle
    let cells: [[Cell]]
    let elapsedSeconds: Int
    let mistakeCount: Int
    let lastPlayedAt: Date
}

/// Persists in-progress game saves keyed by puzzle ID. One save per puzzle.
/// Solving a puzzle removes its save (the result lives in PuzzleHistory);
/// resetting a puzzle also removes it (no progress to preserve).
final class GameStore: ObservableObject {
    @Published private(set) var saves: [Int: GameSave] = [:]

    private let storageKey = "sudoku.saves.v1"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func save(_ save: GameSave) {
        saves[save.puzzle.id] = save
        persist()
    }

    func remove(puzzleID: Int) {
        saves.removeValue(forKey: puzzleID)
        persist()
    }

    func load(puzzleID: Int) -> GameSave? {
        saves[puzzleID]
    }

    /// In-progress saves, most-recently-played first.
    var inProgress: [GameSave] {
        Array(saves.values).sorted { $0.lastPlayedAt > $1.lastPlayedAt }
    }

    var mostRecent: GameSave? {
        inProgress.first
    }

    private func load() {
        guard let data = defaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([Int: GameSave].self, from: data)
        else { return }
        saves = decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(saves) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
