package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable

/**
 * A Sudoku puzzle. Generated puzzles use IDs ≥ 1000; daily puzzles use
 * `YYYYMMDD` (see DailyPuzzle).
 *
 * `givens` is a 9x9 grid where 0 means blank. `solution` is the completed
 * grid; optional only for puzzles where it isn't known.
 */
@Serializable
data class Puzzle(
    val id: Int,
    val difficulty: Difficulty,
    val givens: List<List<Int>>,
    val solution: List<List<Int>>? = null
) {
    /** True if this puzzle's ID looks like a daily (YYYYMMDD-shaped Int). */
    val isDaily: Boolean get() = id in 19700101..99991231

    /**
     * Human-readable label for headers / lists. Dailies show as
     * "Daily · Apr 29"; generated puzzles show their difficulty alone
     * (the puzzle ID is an internal counter that no player cares about).
     */
    val displayLabel: String
        get() {
            if (isDaily) {
                val year = id / 10000
                val month = (id / 100) % 100
                val day = id % 100
                return runCatching {
                    val date = java.time.LocalDate.of(year, month, day)
                    val fmt = java.time.format.DateTimeFormatter.ofPattern("MMM d")
                    "Daily · ${date.format(fmt)}"
                }.getOrDefault(difficulty.label)
            }
            return difficulty.label
        }
}
