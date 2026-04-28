package com.derekgillett.sudoku.state

import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.model.Puzzle

/**
 * Snapshot of all game state the UI cares about. Immutable; updates
 * produce a new instance via `copy()`.
 */
data class GameState(
    val phase: Phase,
    val puzzle: Puzzle,
    val cells: List<List<Cell>>,
    val selected: CellPos? = null,
    val mode: InputMode = InputMode.NORMAL,
    val elapsedSeconds: Int = 0,
    val mistakeCount: Int = 0,
    val isPaused: Boolean = false,
    val highlightMistakes: Boolean = true,
    val highlightConstraints: Boolean = true,
    val lastPlacementInfo: PlacementUndo? = null
) {
    val puzzleID: Int get() = puzzle.id
    val difficulty: Difficulty get() = puzzle.difficulty

    val isSolved: Boolean
        get() {
            for (r in 0 until 9) {
                val seen = HashSet<Int>(9)
                for (c in 0 until 9) {
                    val v = cells[r][c].value ?: return false
                    seen.add(v)
                }
                if (seen.size != 9) return false
            }
            for (c in 0 until 9) {
                val seen = HashSet<Int>(9)
                for (r in 0 until 9) {
                    val v = cells[r][c].value ?: return false
                    seen.add(v)
                }
                if (seen.size != 9) return false
            }
            for (boxR in 0 until 9 step 3) {
                for (boxC in 0 until 9 step 3) {
                    val seen = HashSet<Int>(9)
                    for (r in boxR until boxR + 3) {
                        for (c in boxC until boxC + 3) {
                            val v = cells[r][c].value ?: return false
                            seen.add(v)
                        }
                    }
                    if (seen.size != 9) return false
                }
            }
            return true
        }

    val hasProgress: Boolean
        get() = cells.any { row ->
            row.any { !it.isFixed && (it.value != null || it.notes.isNotEmpty()) }
        }

    /** Formatted MM:SS string of `elapsedSeconds`. */
    val formattedTime: String
        get() = "%02d:%02d".format(elapsedSeconds / 60, elapsedSeconds % 60)
}
