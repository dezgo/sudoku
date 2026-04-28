package com.derekgillett.sudoku.generator

import kotlin.random.Random

/**
 * Linear congruential generator. Deterministic given the seed — used for
 * daily-puzzle seeding so the same date produces the same puzzle on every
 * device.
 *
 * Same constants as the iOS implementation so cross-platform output matches
 * for any given seed (when generation runs in equivalent order — note that
 * subtle iteration-order differences between platforms can still produce
 * different puzzles for the same seed; this is acceptable for a daily
 * puzzle as long as a *given device family* sees the same puzzle for a
 * given date).
 */
class SeededRng(seed: Long) : Random() {
    private var state: Long = if (seed == 0L) 1L else seed

    private fun next(): Long {
        // Long arithmetic in Kotlin/JVM wraps mod 2^64, matching iOS
        // unchecked-overflow operators.
        state = state * 6364136223846793005L + 1442695040888963407L
        return state
    }

    override fun nextBits(bitCount: Int): Int {
        if (bitCount == 0) return 0
        // Take the high `bitCount` bits of the next 64-bit output.
        val raw = next()
        return (raw ushr (64 - bitCount)).toInt() and ((1 shl bitCount) - 1)
    }
}
