package com.derekgillett.sudoku.generator

import com.derekgillett.sudoku.model.Difficulty
import java.time.LocalDate

/**
 * Daily puzzle naming and seeding. Same date → same ID and same seed →
 * same puzzle on every device. Currently fixed to a single difficulty.
 *
 * Local-calendar based — what counts as "today" is the user's device date.
 */
object DailyPuzzle {
    val difficulty: Difficulty = Difficulty.MEDIUM

    /** Stable ID for a calendar date: YYYYMMDD packed into an Int. */
    fun id(date: LocalDate = LocalDate.now()): Int {
        return date.year * 10000 + date.monthValue * 100 + date.dayOfMonth
    }

    /**
     * Seed for the deterministic RNG. Spread the date bits through a large
     * multiplier so consecutive days produce visibly different generator
     * outputs.
     */
    fun seed(date: LocalDate = LocalDate.now()): Long {
        // Multiplier is the same bit pattern as the iOS version. Kotlin's
        // Long is signed and 0x9E3779B97F4A7C15 exceeds Long.MAX_VALUE, so
        // we write it as a ULong literal and reinterpret bits to Long. The
        // multiplication itself wraps mod 2^64, matching iOS unchecked
        // overflow operators.
        return id(date).toLong() * 0x9E3779B97F4A7C15uL.toLong()
    }
}
