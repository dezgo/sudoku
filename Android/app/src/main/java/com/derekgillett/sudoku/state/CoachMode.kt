package com.derekgillett.sudoku.state

import com.derekgillett.sudoku.model.Cell

/**
 * Coach Mode: short scenarios where the user is asked to apply a specific
 * tutor technique on a pre-built board. Mirrors CoachMode.swift on iOS.
 *
 * Scenarios are validated at runtime — `findHint` must return the target
 * technique on the scenario's initial cells, otherwise the scenario is
 * filtered out of the visible list. v1 ships 7; the harder techniques
 * (X-Wing, Swordfish, etc.) need hand-crafted boards in a follow-up.
 */
data class CoachScenario(
    val id: String,                     // matches TutorTechnique.name
    val technique: TutorTechnique,
    val title: String,
    val intro: String,
    val initialCells: List<List<Cell>>
) {
    val expectedHint: TutorHint? get() = TutorEngine.findHint(initialCells)
    val isValid: Boolean get() = expectedHint?.technique == technique

    companion object {
        /** All scenarios in display order. */
        val all: List<CoachScenario> by lazy { build() }

        /** Filtered to those whose target technique actually fires under findHint. */
        val validScenarios: List<CoachScenario> get() = all.filter { it.isValid }

        // TODO: scenarios for hidden triple, X-Wing, XY-Wing, swordfish,
        // naked quad, hidden quad, jellyfish. Need hand-crafted puzzles
        // where the target fires as the *first* useful move under findHint
        // (the test boards use direct find* calls, which lets simpler
        // patterns slip through findHint).
        private fun build(): List<CoachScenario> = listOf(
            nakedSingle(),
            hiddenSingle(),
            nakedPair(),
            pointingPair(),
            boxLineReduction(),
            hiddenPair(),
            nakedTriple()
        )

        // -- Helpers -----------------------------------------------------

        private fun cellsFromGivens(grid: List<List<Int>>): List<List<Cell>> {
            require(grid.size == 9)
            return grid.map { row ->
                require(row.size == 9)
                row.map { v ->
                    if (v == 0) Cell(value = null, isFixed = false, notes = emptySet())
                    else Cell(value = v, isFixed = true, notes = emptySet())
                }
            }
        }

        private fun autoPencil(cells: List<List<Cell>>): List<List<Cell>> {
            val result = cells.map { it.toMutableList() }.toMutableList()
            for (r in 0 until 9) {
                for (c in 0 until 9) {
                    if (result[r][c].value != null) continue
                    result[r][c] = result[r][c].copy(notes = candidates(r, c, result))
                }
            }
            return result.map { it.toList() }
        }

        private fun candidates(row: Int, col: Int, cells: List<List<Cell>>): Set<Int> {
            val cands = (1..9).toMutableSet()
            for (c in 0 until 9) {
                if (c == col) continue
                cells[row][c].value?.let { cands.remove(it) }
            }
            for (r in 0 until 9) {
                if (r == row) continue
                cells[r][col].value?.let { cands.remove(it) }
            }
            val boxR = (row / 3) * 3
            val boxC = (col / 3) * 3
            for (r in boxR until boxR + 3) {
                for (c in boxC until boxC + 3) {
                    if (r == row && c == col) continue
                    cells[r][c].value?.let { cands.remove(it) }
                }
            }
            return cands
        }

        // -- Scenarios ---------------------------------------------------

        private fun nakedSingle(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0] = mutableListOf(1, 2, 3, 4, 5, 6, 7, 8, 0)
            return CoachScenario(
                id = TutorTechnique.NAKED_SINGLE.name,
                technique = TutorTechnique.NAKED_SINGLE,
                title = TutorTechnique.NAKED_SINGLE.label,
                intro = "One empty cell can only hold one digit — find it and place the value.",
                initialCells = cellsFromGivens(grid)
            )
        }

        private fun hiddenSingle(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0][0] = 1; grid[0][1] = 2; grid[0][2] = 3
            grid[1][0] = 4
            grid[2][0] = 6; grid[2][1] = 7
            grid[8][2] = 5
            return CoachScenario(
                id = TutorTechnique.HIDDEN_SINGLE.name,
                technique = TutorTechnique.HIDDEN_SINGLE,
                title = TutorTechnique.HIDDEN_SINGLE.label,
                intro = "In one of the units, a digit can only land in a single cell. Spot it and place the digit.",
                initialCells = cellsFromGivens(grid)
            )
        }

        private fun nakedPair(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0] = mutableListOf(0, 0, 0, 0, 5, 6, 7, 8, 9)
            grid[3][0] = 3
            grid[6][1] = 3
            grid[6][0] = 4
            grid[3][1] = 4
            return CoachScenario(
                id = TutorTechnique.NAKED_PAIR.name,
                technique = TutorTechnique.NAKED_PAIR,
                title = TutorTechnique.NAKED_PAIR.label,
                intro = "Two cells in a unit share the same two candidates. Erase those candidates from every other cell in that unit.",
                initialCells = autoPencil(cellsFromGivens(grid))
            )
        }

        private fun pointingPair(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[1] = mutableListOf(4, 5, 6, 0, 0, 0, 0, 0, 0)
            grid[2] = mutableListOf(7, 8, 9, 0, 0, 0, 0, 0, 0)
            return CoachScenario(
                id = TutorTechnique.POINTING_PAIR.name,
                technique = TutorTechnique.POINTING_PAIR,
                title = TutorTechnique.POINTING_PAIR.label,
                intro = "Inside one box, a candidate is restricted to a single row or column. Erase it from the rest of that line outside the box.",
                initialCells = autoPencil(cellsFromGivens(grid))
            )
        }

        private fun boxLineReduction(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0] = mutableListOf(0, 0, 0, 4, 5, 6, 7, 8, 9)
            return CoachScenario(
                id = TutorTechnique.BOX_LINE_REDUCTION.name,
                technique = TutorTechnique.BOX_LINE_REDUCTION,
                title = TutorTechnique.BOX_LINE_REDUCTION.label,
                intro = "A digit is restricted to a single box within its row or column. Erase that digit from the rest of the box.",
                initialCells = autoPencil(cellsFromGivens(grid))
            )
        }

        private fun hiddenPair(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0] = mutableListOf(0, 0, 0, 0, 0, 6, 7, 8, 9)
            grid[1][5] = 1
            grid[1][6] = 2
            grid[2][0] = 7
            grid[2][1] = 8
            grid[2][5] = 2
            grid[3][2] = 1
            grid[5][2] = 2
            return CoachScenario(
                id = TutorTechnique.HIDDEN_PAIR.name,
                technique = TutorTechnique.HIDDEN_PAIR,
                title = TutorTechnique.HIDDEN_PAIR.label,
                intro = "Two digits live only in two cells of a unit. Erase every *other* candidate from those two cells.",
                initialCells = autoPencil(cellsFromGivens(grid))
            )
        }

        private fun nakedTriple(): CoachScenario {
            val grid = MutableList(9) { MutableList(9) { 0 } }
            grid[0] = mutableListOf(0, 0, 0, 0, 0, 6, 7, 8, 9)
            grid[3][0] = 4
            grid[4][1] = 4
            grid[5][2] = 4
            grid[6][0] = 5
            grid[7][1] = 5
            grid[8][2] = 5
            return CoachScenario(
                id = TutorTechnique.NAKED_TRIPLE.name,
                technique = TutorTechnique.NAKED_TRIPLE,
                title = TutorTechnique.NAKED_TRIPLE.label,
                intro = "Three cells share three candidates between them. Those digits must live in those cells — erase them from the rest of the unit.",
                initialCells = autoPencil(cellsFromGivens(grid))
            )
        }
    }
}
