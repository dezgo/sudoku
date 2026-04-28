package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable

/**
 * Snapshot of an in-progress game so it can be resumed later. Self-contained
 * — bundles the puzzle data so resuming doesn't depend on the provider.
 *
 * `lastPlayedAt` is epoch milliseconds.
 */
@Serializable
data class GameSave(
    val puzzle: Puzzle,
    val cells: List<List<Cell>>,
    val elapsedSeconds: Int,
    val mistakeCount: Int,
    val lastPlayedAt: Long
)
