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
    let hintsUsed: Int
    let pencilAssistsUsed: Int
    /// Sticky: once true during this solve, stays true. Persisted so a
    /// background-and-resume-next-day session doesn't reset honesty about
    /// what assists were enabled. Defaults to true (highlights are on by
    /// default) so a user has to explicitly turn them off to earn the badge.
    let highlightMistakesEverOn: Bool
    let highlightConstraintsEverOn: Bool

    init(
        puzzle: Puzzle,
        cells: [[Cell]],
        elapsedSeconds: Int,
        mistakeCount: Int,
        lastPlayedAt: Date,
        hintsUsed: Int = 0,
        pencilAssistsUsed: Int = 0,
        highlightMistakesEverOn: Bool = true,
        highlightConstraintsEverOn: Bool = true
    ) {
        self.puzzle = puzzle
        self.cells = cells
        self.elapsedSeconds = elapsedSeconds
        self.mistakeCount = mistakeCount
        self.lastPlayedAt = lastPlayedAt
        self.hintsUsed = hintsUsed
        self.pencilAssistsUsed = pencilAssistsUsed
        self.highlightMistakesEverOn = highlightMistakesEverOn
        self.highlightConstraintsEverOn = highlightConstraintsEverOn
    }

    enum CodingKeys: String, CodingKey {
        case puzzle, cells, elapsedSeconds, mistakeCount, lastPlayedAt
        case hintsUsed, pencilAssistsUsed
        case highlightMistakesEverOn, highlightConstraintsEverOn
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        puzzle = try c.decode(Puzzle.self, forKey: .puzzle)
        cells = try c.decode([[Cell]].self, forKey: .cells)
        elapsedSeconds = try c.decode(Int.self, forKey: .elapsedSeconds)
        mistakeCount = try c.decode(Int.self, forKey: .mistakeCount)
        lastPlayedAt = try c.decode(Date.self, forKey: .lastPlayedAt)
        // Older saves predate these counters — default to zero.
        hintsUsed = try c.decodeIfPresent(Int.self, forKey: .hintsUsed) ?? 0
        pencilAssistsUsed = try c.decodeIfPresent(Int.self, forKey: .pencilAssistsUsed) ?? 0
        // Older saves predate the sticky flags — default to true (assists on)
        // since that's the default toggle state and the safe assumption for
        // unknown-history games.
        highlightMistakesEverOn = try c.decodeIfPresent(Bool.self, forKey: .highlightMistakesEverOn) ?? true
        highlightConstraintsEverOn = try c.decodeIfPresent(Bool.self, forKey: .highlightConstraintsEverOn) ?? true
    }
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
