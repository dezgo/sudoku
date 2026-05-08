package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable

/**
 * Snapshot of an in-progress game so it can be resumed later. Self-contained
 * — bundles the puzzle data so resuming doesn't depend on the provider.
 *
 * `lastPlayedAt` is epoch milliseconds.
 *
 * `hintsUsed` and `pencilAssistsUsed` track tutor / auto-pencil usage so
 * the leaderboard can mark assisted solves. Defaulted to 0 for backwards
 * compatibility with saves predating the tutor.
 *
 * `highlightMistakesEverOn` and `highlightConstraintsEverOn` are sticky
 * flags: once true during this solve, stay true even if the user toggles
 * the assist off mid-puzzle. Defaulted to true (highlights are on by
 * default) so older saves report honestly as "assists were on" rather
 * than false-claiming a Purist badge.
 */
@Serializable
data class GameSave(
    val puzzle: Puzzle,
    val cells: List<List<Cell>>,
    val elapsedSeconds: Int,
    val mistakeCount: Int,
    val lastPlayedAt: Long,
    val hintsUsed: Int = 0,
    val pencilAssistsUsed: Int = 0,
    val highlightMistakesEverOn: Boolean = true,
    val highlightConstraintsEverOn: Boolean = true
)
