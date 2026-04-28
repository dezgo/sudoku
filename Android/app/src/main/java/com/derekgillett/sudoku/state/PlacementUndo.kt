package com.derekgillett.sudoku.state

/**
 * Snapshot captured when a value is placed so Undo can restore both the
 * cell's prior notes and any pencil marks auto-cleared from peers.
 * Lives in-memory only — not part of GameSave persistence.
 */
data class PlacementUndo(
    val row: Int,
    val col: Int,
    val placedValue: Int,
    val previousNotes: Set<Int>,
    val autoClearedPeers: List<CellPos>
)
