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
    val hintsUsed: Int = 0,
    val pencilAssistsUsed: Int = 0,
    val isPaused: Boolean = false,
    val highlightMistakes: Boolean = true,
    val highlightConstraints: Boolean = true,
    val soundEffects: Boolean = true,
    /** Sticky flags: once true during a solve, stay true even after the
     * user toggles the assist off. Persisted in GameSave so a multi-session
     * solve can't lose track. Drives the "Purist" leaderboard badge. */
    val highlightMistakesEverOn: Boolean = true,
    val highlightConstraintsEverOn: Boolean = true,
    val lastPlacementInfo: PlacementUndo? = null
) {
    val puzzleID: Int get() = puzzle.id
    val difficulty: Difficulty get() = puzzle.difficulty

    /** True if any empty cell has at least one pencil mark. Used by the
     * tutor's empty-state copy so it can tell whether the user needs to
     * pencil first or has hit our technique vocabulary. */
    val hasAnyPencilMarks: Boolean
        get() = cells.any { row -> row.any { it.notes.isNotEmpty() } }

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
