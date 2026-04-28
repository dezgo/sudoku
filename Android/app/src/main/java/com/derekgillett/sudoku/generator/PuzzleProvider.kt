package com.derekgillett.sudoku.generator

import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.model.Puzzle
import java.time.LocalDate

/**
 * Source of puzzles for the game. Production implementation is
 * `GeneratedPuzzleProvider`; previews/tests can drop in a stub.
 */
interface PuzzleProvider {
    /** Fresh puzzle for the requested difficulty, excluding the given IDs. */
    fun nextPuzzle(difficulty: Difficulty, excludingIDs: Set<Int>): Puzzle

    /**
     * The puzzle for a given calendar date — same on every device for the
     * same date. Always at `DailyPuzzle.difficulty`.
     */
    fun dailyPuzzle(date: LocalDate): Puzzle
}
