package com.derekgillett.sudoku.state

import androidx.lifecycle.ViewModel
import com.derekgillett.sudoku.model.Cell
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Minimal play-state model for a Coach scenario. Mirrors CoachGame.swift.
 * Drops timer, mistakes, save/restore, daily plumbing — Coach is a focus
 * drill, not a normal game. Completion is decided by comparing the user's
 * actions against the engine's expected hint snapshotted at scenario start.
 */
class CoachGame(val scenario: CoachScenario) : ViewModel() {

    data class State(
        val cells: List<List<Cell>>,
        val selected: CellPos? = null,
        val mode: InputMode = InputMode.NORMAL,
        val isComplete: Boolean = false
    )

    private val expected: TutorHint? = scenario.expectedHint?.takeIf {
        it.technique == scenario.technique
    }

    private val initialNotes: List<List<Set<Int>>> =
        scenario.initialCells.map { row -> row.map { it.notes } }

    private val _state = MutableStateFlow(
        State(
            cells = scenario.initialCells,
            mode = if (expected?.placement != null) InputMode.NORMAL else InputMode.PENCIL
        )
    )
    val state: StateFlow<State> = _state.asStateFlow()

    /** True when the scenario is mis-built (no expected hint) — UI can refuse to load. */
    val isLoadable: Boolean get() = expected != null

    fun select(row: Int, col: Int) {
        val s = _state.value
        if (s.selected?.row == row && s.selected.col == col) {
            _state.value = s.copy(selected = null)
        } else {
            _state.value = s.copy(selected = CellPos(row, col))
        }
    }

    fun toggleMode() {
        val s = _state.value
        _state.value = s.copy(mode = if (s.mode == InputMode.NORMAL) InputMode.PENCIL else InputMode.NORMAL)
    }

    fun enter(number: Int) {
        val s = _state.value
        if (s.isComplete) return
        val sel = s.selected ?: return
        val cell = s.cells[sel.row][sel.col]
        if (cell.isFixed) return
        val newCell = when (s.mode) {
            InputMode.NORMAL -> {
                if (cell.value == number) cell.copy(value = null, notes = emptySet())
                else cell.copy(value = number, notes = emptySet())
            }
            InputMode.PENCIL -> {
                val cleared = cell.copy(value = null)
                val newNotes = if (cleared.notes.contains(number)) cleared.notes - number
                else cleared.notes + number
                cleared.copy(notes = newNotes)
            }
        }
        val newCells = s.cells.map { it.toMutableList() }.toMutableList()
        newCells[sel.row][sel.col] = newCell
        _state.value = s.copy(cells = newCells.map { it.toList() })
        recheckCompletion()
    }

    fun clearSelected() {
        val s = _state.value
        if (s.isComplete) return
        val sel = s.selected ?: return
        val cell = s.cells[sel.row][sel.col]
        if (cell.isFixed) return
        val newCells = s.cells.map { it.toMutableList() }.toMutableList()
        newCells[sel.row][sel.col] = cell.copy(value = null, notes = emptySet())
        _state.value = s.copy(cells = newCells.map { it.toList() })
        recheckCompletion()
    }

    fun reset() {
        _state.value = State(
            cells = scenario.initialCells,
            mode = if (expected?.placement != null) InputMode.NORMAL else InputMode.PENCIL
        )
    }

    private fun recheckCompletion() {
        val expected = expected ?: return
        val s = _state.value
        val placement = expected.placement
        if (placement != null) {
            // Placement scenarios complete when the target cell holds the
            // expected value.
            if (s.cells[placement.row][placement.col].value == placement.value) {
                _state.value = s.copy(isComplete = true)
            }
        } else {
            // Elimination scenarios complete when every expected (cell,
            // candidate) pair has been removed from the user's notes.
            // Extra eliminations elsewhere are tolerated.
            for (elim in expected.eliminations) {
                val initial = initialNotes[elim.row][elim.col]
                val current = s.cells[elim.row][elim.col].notes
                if (elim.candidates.intersect(current).isNotEmpty()) return
                if (elim.candidates.intersect(initial).isEmpty()) return
            }
            _state.value = s.copy(isComplete = true)
        }
    }
}
