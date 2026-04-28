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
)
