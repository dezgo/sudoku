package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * A completed-puzzle record. Persisted to PuzzleHistory; matches the iOS
 * structure so a future shared backend can ingest from both platforms.
 *
 * `completedAt` is epoch milliseconds.
 */
@Serializable
data class PuzzleResult(
    val id: String = UUID.randomUUID().toString(),
    val puzzleID: Int,
    val completedAt: Long,
    val elapsedSeconds: Int,
    /** Optional snapshot so the completed grid can be displayed later. */
    val puzzle: Puzzle? = null
)
