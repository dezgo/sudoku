//
//  CoachModeTests.swift
//  SudokuTests
//
//  Validates each Coach scenario actually fires its target technique under
//  the engine's global findHint — guards against regressions where the
//  engine's preference order shifts and a scenario silently breaks.
//

import Testing
@testable import Sudoku

struct CoachModeTests {
    @Test func everyScenarioIsValid() {
        var failures: [String] = []
        for scenario in CoachScenario.all {
            let hint = TutorEngine.findHint(cells: scenario.initialCells)
            if hint?.technique != scenario.technique {
                failures.append("\(scenario.technique.rawValue): got \(String(describing: hint?.technique))")
            }
        }
        #expect(failures.isEmpty, "Failing coach scenarios: \(failures.joined(separator: "; "))")
    }

    @Test func shipsAtLeastSevenScenarios() {
        // v1 ships 7 of the 14 techniques. The remaining 7 (hiddenTriple
        // upward) need hand-crafted boards where the target fires as the
        // first useful move under findHint.
        #expect(CoachScenario.all.count >= 7)
    }
}
