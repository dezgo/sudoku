//
//  CoachStore.swift
//  Sudoku
//
//  Local-only persistence for Coach Mode completion. One bool per scenario
//  ID stored as a UserDefaults string set. Not synced — Coach progress is a
//  personal achievement track, not a leaderboard signal.
//

import Foundation

@MainActor
final class CoachStore: ObservableObject {
    @Published private(set) var completed: Set<String> = []

    private let key = "sudoku.coach.completed.v1"

    init() {
        if let stored = UserDefaults.standard.array(forKey: key) as? [String] {
            completed = Set(stored)
        }
    }

    func isComplete(_ scenario: CoachScenario) -> Bool {
        completed.contains(scenario.id)
    }

    func markComplete(_ scenario: CoachScenario) {
        guard !completed.contains(scenario.id) else { return }
        completed.insert(scenario.id)
        UserDefaults.standard.set(Array(completed), forKey: key)
    }

    /// True only when every available scenario is done. Used by the home
    /// screen to gate a "Coach Master" celebration once all 14 techniques
    /// land and the user clears the set.
    func hasMasteredAll() -> Bool {
        let allIDs = Set(CoachScenario.all.map { $0.id })
        return allIDs.isSubset(of: completed)
    }
}
