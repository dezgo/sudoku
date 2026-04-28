package com.derekgillett.sudoku.state

/**
 * Pure functions implementing the visual hierarchy described in SPEC §8.
 * Composables call these to decide what tint each cell gets.
 */
object Highlights {

    /** True if the cell is in the selected cell's row, column, or 3×3 box. */
    fun isHighlighted(state: GameState, row: Int, col: Int): Boolean {
        val sel = state.selected ?: return false
        if (sel.row == row && sel.col == col) return false
        if (sel.row == row || sel.col == col) return true
        val boxR = (sel.row / 3) * 3
        val boxC = (sel.col / 3) * 3
        return row in boxR until boxR + 3 && col in boxC until boxC + 3
    }

    /** True if the cell holds the same value as the selected cell. */
    fun isMatchingNumber(state: GameState, row: Int, col: Int): Boolean {
        val sel = state.selected ?: return false
        if (sel.row == row && sel.col == col) return false
        val target = state.cells[sel.row][sel.col].value ?: return false
        return state.cells[row][col].value == target
    }

    /**
     * True if this cell can't legally accept the selected cell's value
     * (because it's already filled OR its row/col/box already contains it).
     * Gated by the `highlightConstraints` preference.
     */
    fun isUnavailableForSelectedValue(state: GameState, row: Int, col: Int): Boolean {
        if (!state.highlightConstraints) return false
        val sel = state.selected ?: return false
        if (sel.row == row && sel.col == col) return false
        val v = state.cells[sel.row][sel.col].value ?: return false
        if (state.cells[row][col].value != null) return true
        for (c in 0 until 9) if (state.cells[row][c].value == v) return true
        for (r in 0 until 9) if (state.cells[r][col].value == v) return true
        val boxR = (row / 3) * 3
        val boxC = (col / 3) * 3
        for (r in boxR until boxR + 3) {
            for (c in boxC until boxC + 3) {
                if (state.cells[r][c].value == v) return true
            }
        }
        return false
    }

    /**
     * For user-entered cells: red if the value doesn't match the puzzle's
     * solution. For fixed cells (or puzzles without a solution), falls back
     * to a row/col/box rule check — only relevant if a generator ever
     * produces a malformed puzzle.
     */
    fun hasConflict(state: GameState, row: Int, col: Int): Boolean {
        val cell = state.cells[row][col]
        val v = cell.value ?: return false

        if (!cell.isFixed) {
            val solution = state.puzzle.solution
            if (solution != null) return v != solution[row][col]
        }

        for (i in 0 until 9) {
            if (i != col && state.cells[row][i].value == v) return true
            if (i != row && state.cells[i][col].value == v) return true
        }
        val boxR = (row / 3) * 3
        val boxC = (col / 3) * 3
        for (r in boxR until boxR + 3) {
            for (c in boxC until boxC + 3) {
                if ((r != row || c != col) && state.cells[r][c].value == v) return true
            }
        }
        return false
    }

    /**
     * Cell is locked: either it's a given, or — when "Highlight mistakes"
     * is on — the user has placed the correct value there.
     */
    fun isLocked(state: GameState, row: Int, col: Int): Boolean {
        val cell = state.cells[row][col]
        if (cell.isFixed) return true
        if (state.highlightMistakes) {
            val solution = state.puzzle.solution ?: return false
            val v = cell.value ?: return false
            return v == solution[row][col]
        }
        return false
    }

    /**
     * Count of correctly-placed instances of `number` (or any instances
     * when "Highlight mistakes" is off). The pad button hides at 9.
     */
    fun completedCount(state: GameState, number: Int): Int {
        var count = 0
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (state.cells[r][c].value != number) continue
                if (state.highlightMistakes && hasConflict(state, r, c)) continue
                count++
            }
        }
        return count
    }

    fun isComplete(state: GameState, number: Int): Boolean = completedCount(state, number) >= 9

    /** Peers of the given cell (row + column + 3x3 box, excluding the cell itself). */
    fun peers(row: Int, col: Int): List<CellPos> {
        val result = mutableListOf<CellPos>()
        for (c in 0 until 9) if (c != col) result.add(CellPos(row, c))
        for (r in 0 until 9) if (r != row) result.add(CellPos(r, col))
        val boxR = (row / 3) * 3
        val boxC = (col / 3) * 3
        for (r in boxR until boxR + 3) {
            for (c in boxC until boxC + 3) {
                if (r != row && c != col) result.add(CellPos(r, c))
            }
        }
        return result
    }
}
