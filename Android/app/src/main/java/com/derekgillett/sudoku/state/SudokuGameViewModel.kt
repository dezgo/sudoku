package com.derekgillett.sudoku.state

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.derekgillett.sudoku.AppContainer
import com.derekgillett.sudoku.data.GameSaveRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.data.PuzzleHistoryRepository
import com.derekgillett.sudoku.generator.PuzzleProvider
import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.model.GameSave
import com.derekgillett.sudoku.model.Puzzle
import com.derekgillett.sudoku.model.PuzzleResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/**
 * Owns all game state. Mirrors `SudokuGame.swift` from the iOS reference.
 *
 * State is exposed as a single `StateFlow<GameState?>` — null while loading
 * (very brief — first read of persisted save or fresh puzzle generation).
 * Composables observe via `collectAsState`.
 */
class SudokuGameViewModel(
    private val provider: PuzzleProvider,
    private val historyRepo: PuzzleHistoryRepository,
    private val saveRepo: GameSaveRepository,
    private val prefsRepo: PreferencesRepository
) : ViewModel() {

    private val _state = MutableStateFlow<GameState?>(null)
    val state: StateFlow<GameState?> = _state.asStateFlow()

    /** All in-progress saves, observed for UI use (Home, Games sheet). */
    val saves get() = saveRepo.saves
    val inProgressSaves get() = saveRepo.inProgress
    val mostRecentSave get() = saveRepo.mostRecent

    /** Completion history, observed for UI use. */
    val history get() = historyRepo.results

    suspend fun clearHistory() = historyRepo.clear()

    private var timerJob: Job? = null
    private var wasAutoPaused: Boolean = false
    private var solveCallback: ((PuzzleResult) -> Unit)? = null

    init {
        viewModelScope.launch { initialize() }
    }

    /**
     * Set a callback to be notified when a puzzle is solved during play.
     * The Composable layer uses this to show the fanfare sheet.
     */
    fun onSolved(callback: (PuzzleResult) -> Unit) {
        solveCallback = callback
    }

    private suspend fun initialize() {
        val prefs = prefsRepo.preferences.first()
        val save = saveRepo.mostRecent.first()
        val initial = if (save != null) {
            GameState(
                phase = Phase.HOME,
                puzzle = save.puzzle,
                cells = save.cells,
                elapsedSeconds = save.elapsedSeconds,
                mistakeCount = save.mistakeCount,
                highlightMistakes = prefs.highlightMistakes,
                highlightConstraints = prefs.highlightConstraints
            )
        } else {
            val puzzle = withContext(Dispatchers.Default) {
                provider.nextPuzzle(prefs.difficulty, emptySet())
            }
            GameState(
                phase = Phase.HOME,
                puzzle = puzzle,
                cells = buildCells(puzzle.givens),
                highlightMistakes = prefs.highlightMistakes,
                highlightConstraints = prefs.highlightConstraints
            )
        }
        _state.value = initial
        startTimer(initial.elapsedSeconds)

        // Keep highlight prefs in sync if the user changes them in Settings.
        viewModelScope.launch {
            prefsRepo.preferences.collect { p ->
                _state.update { s ->
                    s?.copy(
                        highlightMistakes = p.highlightMistakes,
                        highlightConstraints = p.highlightConstraints
                    )
                }
            }
        }
    }

    // region Phase transitions

    fun goHome() {
        _state.update { s ->
            if (s == null) return@update null
            // Pause the timer if running so off-screen time doesn't accumulate.
            val paused = if (!s.isPaused) s.copy(isPaused = true) else s
            paused.copy(phase = Phase.HOME)
        }
        saveProgress()
    }

    fun continueMostRecent() {
        viewModelScope.launch {
            val save = saveRepo.mostRecent.first() ?: return@launch
            resume(save)
        }
    }

    fun resume(save: GameSave) {
        saveProgress()
        loadPuzzleFromSave(save)
        _state.update { it?.copy(phase = Phase.PLAYING) }
    }

    fun newGame(difficulty: Difficulty) {
        saveProgress()
        viewModelScope.launch {
            val excluded = excludedIds()
            val current = _state.value?.puzzle?.id
            val excludedPlusCurrent = if (current != null) excluded + current else excluded
            val next = withContext(Dispatchers.Default) {
                provider.nextPuzzle(difficulty, excludedPlusCurrent)
            }
            loadPuzzle(next)
            _state.update { it?.copy(phase = Phase.PLAYING) }
        }
    }

    fun startDaily(date: LocalDate = LocalDate.now()) {
        saveProgress()
        viewModelScope.launch {
            val daily = withContext(Dispatchers.Default) { provider.dailyPuzzle(date) }
            loadPuzzle(daily)
            _state.update { it?.copy(phase = Phase.PLAYING) }
        }
    }

    private suspend fun excludedIds(): Set<Int> {
        val completed = historyRepo.results.first().map { it.puzzleID }.toSet()
        val inProgress = saveRepo.saves.first().keys
        return completed + inProgress
    }

    // endregion

    // region User input

    fun select(row: Int, col: Int) {
        _state.update { s ->
            if (s == null) return@update null
            // Clear lastPlacementInfo when navigating to a different cell.
            val cleared = s.lastPlacementInfo?.let {
                if (it.row != row || it.col != col) s.copy(lastPlacementInfo = null) else s
            } ?: s
            cleared.copy(selected = CellPos(row, col))
        }
    }

    fun enter(number: Int) {
        val s = _state.value ?: return
        if (s.isPaused) return

        // Tap-to-highlight: no selection, or selected cell already has a value.
        val sel = s.selected
        val shouldNavigate = sel == null || s.cells[sel.row][sel.col].value != null
        if (shouldNavigate) {
            firstCell(s.cells, number)?.let { (r, c) -> select(r, c) }
            return
        }

        if (Highlights.isLocked(s, sel.row, sel.col)) return

        val oldCell = s.cells[sel.row][sel.col]
        val previousNotes = oldCell.notes
        var didPlaceValue = false

        val newCell: Cell = when (s.mode) {
            InputMode.NORMAL -> {
                if (oldCell.value == number) {
                    // Toggle-clear (effectively unreachable since filled cells
                    // hit the navigate branch above; kept for symmetry).
                    oldCell.copy(value = null, notes = emptySet())
                } else {
                    didPlaceValue = true
                    oldCell.copy(value = number, notes = emptySet())
                }
            }

            InputMode.PENCIL -> {
                val cleared = oldCell.copy(value = null)
                val newNotes = if (cleared.notes.contains(number)) {
                    cleared.notes - number
                } else {
                    cleared.notes + number
                }
                cleared.copy(notes = newNotes)
            }
        }

        // Build new cells with the placed cell + auto-cleared peers.
        val newCells = s.cells.map { it.toMutableList() }.toMutableList()
        newCells[sel.row][sel.col] = newCell

        val autoClearedPeers = mutableListOf<CellPos>()
        if (s.mode == InputMode.NORMAL && didPlaceValue) {
            for (peer in Highlights.peers(sel.row, sel.col)) {
                val pc = newCells[peer.row][peer.col]
                if (pc.notes.contains(number)) {
                    newCells[peer.row][peer.col] = pc.copy(notes = pc.notes - number)
                    autoClearedPeers.add(peer)
                }
            }
        }

        val frozenCells = newCells.map { it.toList() }

        val newLastPlacement = when {
            s.mode == InputMode.NORMAL && didPlaceValue -> PlacementUndo(
                row = sel.row,
                col = sel.col,
                placedValue = number,
                previousNotes = previousNotes,
                autoClearedPeers = autoClearedPeers
            )
            s.mode == InputMode.NORMAL && !didPlaceValue ->
                if (s.lastPlacementInfo?.row == sel.row && s.lastPlacementInfo.col == sel.col) null
                else s.lastPlacementInfo
            else -> s.lastPlacementInfo
        }

        var nextState = s.copy(cells = frozenCells, lastPlacementInfo = newLastPlacement)

        if (didPlaceValue && s.highlightMistakes &&
            Highlights.hasConflict(nextState, sel.row, sel.col)
        ) {
            nextState = nextState.copy(mistakeCount = nextState.mistakeCount + 1)
        }

        if (didPlaceValue && nextState.isSolved) {
            timerJob?.cancel()
        }

        _state.value = nextState

        if (didPlaceValue && nextState.isSolved) {
            handleSolve(nextState)
        }
        saveProgress()
    }

    fun clearSelected() {
        val s = _state.value ?: return
        if (s.isPaused) return
        val sel = s.selected ?: return
        if (Highlights.isLocked(s, sel.row, sel.col)) return

        val newCells = s.cells.map { it.toMutableList() }.toMutableList()

        val undo = s.lastPlacementInfo
        val isUndoTarget = undo != null && undo.row == sel.row && undo.col == sel.col

        if (isUndoTarget && undo != null) {
            // Restore prior notes on the selected cell, and put back any
            // pencil marks we auto-cleared from peers.
            newCells[sel.row][sel.col] = newCells[sel.row][sel.col]
                .copy(value = null, notes = undo.previousNotes)
            for (peer in undo.autoClearedPeers) {
                val pc = newCells[peer.row][peer.col]
                newCells[peer.row][peer.col] = pc.copy(notes = pc.notes + undo.placedValue)
            }
        } else {
            newCells[sel.row][sel.col] = newCells[sel.row][sel.col]
                .copy(value = null, notes = emptySet())
        }

        _state.value = s.copy(
            cells = newCells.map { it.toList() },
            lastPlacementInfo = if (isUndoTarget) null else s.lastPlacementInfo
        )
        saveProgress()
    }

    fun toggleMode() {
        _state.update { s ->
            s?.copy(mode = if (s.mode == InputMode.NORMAL) InputMode.PENCIL else InputMode.NORMAL)
        }
    }

    fun togglePause() {
        _state.update { it?.copy(isPaused = it.isPaused.not()) }
        wasAutoPaused = false
        saveProgress()
    }

    fun reset() {
        val s = _state.value ?: return
        _state.value = s.copy(
            cells = buildCells(s.puzzle.givens),
            selected = null,
            mode = InputMode.NORMAL,
            elapsedSeconds = 0,
            mistakeCount = 0,
            isPaused = false,
            lastPlacementInfo = null
        )
        startTimer(0)
        saveProgress() // hasProgress=false → removes save
    }

    // endregion

    // region Lifecycle

    fun enterBackground() {
        val s = _state.value ?: return
        if (s.isPaused) return
        _state.value = s.copy(isPaused = true)
        wasAutoPaused = true
        saveProgress()
    }

    fun enterForeground() {
        if (!wasAutoPaused) return
        _state.update { it?.copy(isPaused = false) }
        wasAutoPaused = false
    }

    // endregion

    // region Settings setters (instant + persist)

    fun setHighlightMistakes(value: Boolean) {
        _state.update { it?.copy(highlightMistakes = value) }
        viewModelScope.launch { prefsRepo.setHighlightMistakes(value) }
    }

    fun setHighlightConstraints(value: Boolean) {
        _state.update { it?.copy(highlightConstraints = value) }
        viewModelScope.launch { prefsRepo.setHighlightConstraints(value) }
    }

    // endregion

    // region Internal helpers

    private fun firstCell(cells: List<List<Cell>>, value: Int): Pair<Int, Int>? {
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (cells[r][c].value == value) return r to c
            }
        }
        return null
    }

    private fun handleSolve(state: GameState) {
        val result = PuzzleResult(
            puzzleID = state.puzzleID,
            completedAt = System.currentTimeMillis(),
            elapsedSeconds = state.elapsedSeconds,
            puzzle = state.puzzle
        )
        viewModelScope.launch {
            historyRepo.record(result)
            saveRepo.remove(state.puzzleID)
        }
        solveCallback?.invoke(result)
    }

    private fun loadPuzzle(puzzle: Puzzle) {
        viewModelScope.launch {
            val saved = saveRepo.load(puzzle.id)
            if (saved != null) {
                loadPuzzleFromSave(saved)
            } else {
                _state.update { s ->
                    s?.copy(
                        puzzle = puzzle,
                        cells = buildCells(puzzle.givens),
                        selected = null,
                        mode = InputMode.NORMAL,
                        elapsedSeconds = 0,
                        mistakeCount = 0,
                        isPaused = false,
                        lastPlacementInfo = null
                    )
                }
                startTimer(0)
            }
        }
    }

    private fun loadPuzzleFromSave(save: GameSave) {
        _state.update { s ->
            s?.copy(
                puzzle = save.puzzle,
                cells = save.cells,
                selected = null,
                mode = InputMode.NORMAL,
                elapsedSeconds = save.elapsedSeconds,
                mistakeCount = save.mistakeCount,
                isPaused = false,
                lastPlacementInfo = null
            )
        }
        startTimer(save.elapsedSeconds)
    }

    private fun startTimer(fromSeconds: Int) {
        timerJob?.cancel()
        _state.update { it?.copy(elapsedSeconds = fromSeconds) }
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                val s = _state.value ?: continue
                if (!s.isPaused && !s.isSolved) {
                    _state.update { it?.copy(elapsedSeconds = it.elapsedSeconds + 1) }
                }
            }
        }
    }

    private fun saveProgress() {
        val s = _state.value ?: return
        viewModelScope.launch {
            if (s.hasProgress && !s.isSolved) {
                saveRepo.save(
                    GameSave(
                        puzzle = s.puzzle,
                        cells = s.cells,
                        elapsedSeconds = s.elapsedSeconds,
                        mistakeCount = s.mistakeCount,
                        lastPlayedAt = System.currentTimeMillis()
                    )
                )
            } else {
                saveRepo.remove(s.puzzle.id)
            }
        }
    }

    private fun buildCells(givens: List<List<Int>>): List<List<Cell>> = givens.map { row ->
        row.map { v ->
            if (v == 0) Cell(value = null, isFixed = false, notes = emptySet())
            else Cell(value = v, isFixed = true, notes = emptySet())
        }
    }

    // endregion

    // region Erase button affordance

    fun canEraseSelected(state: GameState): Boolean {
        val sel = state.selected ?: return false
        if (Highlights.isLocked(state, sel.row, sel.col)) return false
        val cell = state.cells[sel.row][sel.col]
        return cell.value != null || cell.notes.isNotEmpty()
    }

    /** "Undo" if the selected cell is the most-recent placement and undoable; otherwise "Erase". */
    fun eraseLabel(state: GameState): String {
        if (!state.highlightMistakes) return "Erase"
        val sel = state.selected ?: return "Erase"
        val last = state.lastPlacementInfo ?: return "Erase"
        if (sel.row != last.row || sel.col != last.col) return "Erase"
        if (Highlights.isLocked(state, sel.row, sel.col)) return "Erase"
        return "Undo"
    }

    // endregion

    /** Factory used to instantiate this ViewModel with the AppContainer. */
    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SudokuGameViewModel(
                provider = container.provider,
                historyRepo = container.historyRepo,
                saveRepo = container.saveRepo,
                prefsRepo = container.prefsRepo
            ) as T
        }
    }
}
