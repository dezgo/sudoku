package com.derekgillett.sudoku.state

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.derekgillett.sudoku.AppContainer
import com.derekgillett.sudoku.audio.SoundManager
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
    private val prefsRepo: PreferencesRepository,
    private val soundManager: SoundManager
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
    private var solveCallback: ((PuzzleResult, Int) -> Unit)? = null

    init {
        viewModelScope.launch { initialize() }
    }

    /**
     * Set a callback to be notified when a puzzle is solved during play.
     * The Composable layer uses this to show the fanfare sheet. Second arg
     * is the mistake count (not stored on PuzzleResult — kept transient).
     */
    fun onSolved(callback: (PuzzleResult, Int) -> Unit) {
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
                hintsUsed = save.hintsUsed,
                pencilAssistsUsed = save.pencilAssistsUsed,
                highlightMistakes = prefs.highlightMistakes,
                highlightConstraints = prefs.highlightConstraints,
                soundEffects = prefs.soundEffects,
                highlightMistakesEverOn = save.highlightMistakesEverOn,
                highlightConstraintsEverOn = save.highlightConstraintsEverOn
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
                highlightConstraints = prefs.highlightConstraints,
                soundEffects = prefs.soundEffects,
                highlightMistakesEverOn = prefs.highlightMistakes,
                highlightConstraintsEverOn = prefs.highlightConstraints
            )
        }
        soundManager.setEnabled(prefs.soundEffects)
        _state.value = initial
        startTimer(initial.elapsedSeconds)

        // Keep prefs in sync if the user changes them in Settings. Note: the
        // sticky `everOn` flags only ratchet UP — toggling on flips them
        // true, toggling off does NOT flip them false.
        viewModelScope.launch {
            prefsRepo.preferences.collect { p ->
                soundManager.setEnabled(p.soundEffects)
                _state.update { s ->
                    if (s == null) return@update null
                    s.copy(
                        highlightMistakes = p.highlightMistakes,
                        highlightConstraints = p.highlightConstraints,
                        soundEffects = p.soundEffects,
                        highlightMistakesEverOn = s.highlightMistakesEverOn || p.highlightMistakes,
                        highlightConstraintsEverOn = s.highlightConstraintsEverOn || p.highlightConstraints
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

    /**
     * Load a daily puzzle that's already been resolved by the caller —
     * typically `DailyPuzzleRepository.ensureToday()`, which handles the
     * server-fetch + offline-fallback logic and returns a ready Puzzle.
     */
    fun startDaily(puzzle: Puzzle) {
        saveProgress()
        viewModelScope.launch {
            loadPuzzle(puzzle)
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
            // Tap-the-already-selected cell = deselect, giving the user an
            // easy "show me the board with no highlights" gesture.
            if (s.selected?.row == row && s.selected.col == col) {
                return@update s.copy(selected = null, lastPlacementInfo = null)
            }
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

        // Mistake counter is solution-based and fires regardless of the
        // "Highlight mistakes" toggle — leaderboard fairness shouldn't depend
        // on whether the player wanted real-time feedback.
        val solution = s.puzzle.solution
        val placedWrong = didPlaceValue && solution != null &&
            solution[sel.row][sel.col] != number
        if (placedWrong) {
            nextState = nextState.copy(mistakeCount = nextState.mistakeCount + 1)
        }
        // Visual + sound feedback still gated on the toggle, and uses the
        // softer "creates a conflict" rule (matches what's drawn in red).
        val isMistake = didPlaceValue && s.highlightMistakes &&
            Highlights.hasConflict(nextState, sel.row, sel.col)

        if (didPlaceValue && nextState.isSolved) {
            timerJob?.cancel()
        }

        _state.value = nextState

        // Sound cues — order matters: solve wins over unit, mistake wins over
        // place. Solve also fires standalone so the fanfare has audio support.
        if (didPlaceValue) {
            when {
                nextState.isSolved -> soundManager.play(SoundManager.Effect.SOLVED)
                isMistake -> soundManager.play(SoundManager.Effect.MISTAKE)
                else -> {
                    val solution = s.puzzle.solution
                    val placedCorrectly = solution != null && solution[sel.row][sel.col] == number
                    // Row/column completion is too subtle to chime on. Box
                    // completion is more visible (3×3 area going complete),
                    // and "all 9 of this digit are now down" is a satisfying
                    // milestone the player can feel.
                    val unitJustCompleted = placedCorrectly && (
                        isBoxCorrect(nextState, sel.row, sel.col) ||
                            Highlights.isComplete(nextState, number)
                        )
                    soundManager.play(
                        if (unitJustCompleted) SoundManager.Effect.UNIT_COMPLETE
                        else SoundManager.Effect.PLACE
                    )
                }
            }
        }

        if (didPlaceValue && nextState.isSolved) {
            handleSolve(nextState)
        }
        saveProgress()
    }

    private fun isBoxCorrect(state: GameState, boxRow: Int, boxCol: Int): Boolean {
        val solution = state.puzzle.solution ?: return false
        val r0 = (boxRow / 3) * 3
        val c0 = (boxCol / 3) * 3
        for (r in r0 until r0 + 3) {
            for (c in c0 until c0 + 3) {
                if (state.cells[r][c].value != solution[r][c]) return false
            }
        }
        return true
    }

    fun clearSelected() {
        val s = _state.value ?: return
        if (s.isPaused) return
        val sel = s.selected ?: return
        if (Highlights.isLocked(s, sel.row, sel.col)) return

        val cellBefore = s.cells[sel.row][sel.col]
        val hadContent = cellBefore.value != null || cellBefore.notes.isNotEmpty()

        val newCells = s.cells.map { it.toMutableList() }.toMutableList()

        val undo = s.lastPlacementInfo
        val isUndoTarget = undo != null && undo.row == sel.row && undo.col == sel.col

        if (undo != null && isUndoTarget) {
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

        if (hadContent) soundManager.play(SoundManager.Effect.ERASE)
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
            hintsUsed = 0,
            pencilAssistsUsed = 0,
            // Re-snapshot sticky flags from current toggle state — fresh
            // attempt = fresh measurement of "did you ever use these assists?"
            highlightMistakesEverOn = s.highlightMistakes,
            highlightConstraintsEverOn = s.highlightConstraints,
            isPaused = false,
            lastPlacementInfo = null
        )
        startTimer(0)
        saveProgress() // hasProgress=false → removes save
    }

    // region Tutor

    /**
     * Returns the easiest applicable hint for the current state, or null if
     * none of the implemented techniques apply.
     */
    fun nextTutorHint(): TutorHint? {
        val s = _state.value ?: return null
        return TutorEngine.findHint(s.cells)
    }

    /**
     * Mark that the user opened the tutor and saw a hint. The "hint used"
     * badge is charged as soon as the user peeks at a suggestion, even if
     * they dismiss the sheet without tapping Apply / Got it — once they've
     * seen it, the information is already in their head.
     */
    fun noteHintViewed() {
        val s = _state.value ?: return
        if (s.isPaused) return
        _state.value = s.copy(hintsUsed = s.hintsUsed + 1)
        saveProgress()
    }

    /**
     * Apply a tutor hint. Placement-style hints fill the deduced cell;
     * elimination-style hints erase the called-out candidates from the
     * user's pencil marks. The `hintsUsed` counter is bumped earlier in
     * `noteHintViewed()` (the moment the sheet shows a hint) so even
     * peek-and-dismiss counts.
     */
    fun applyTutorHint(hint: TutorHint) {
        val s = _state.value ?: return
        if (s.isPaused) return
        if (hint.placement != null) {
            val p = hint.placement
            // Switch to normal mode and select the target so enter() places.
            _state.update { it?.copy(selected = CellPos(p.row, p.col), mode = InputMode.NORMAL) }
            enter(p.value)
        } else if (hint.eliminations.isNotEmpty()) {
            val current = _state.value ?: return
            val newCells = current.cells.map { it.toMutableList() }.toMutableList()
            for (elim in hint.eliminations) {
                val cell = newCells[elim.row][elim.col]
                newCells[elim.row][elim.col] = cell.copy(notes = cell.notes - elim.candidates)
            }
            _state.value = current.copy(cells = newCells.map { it.toList() })
            saveProgress()
        }
    }

    // endregion

    // region Auto-pencil

    /**
     * Reconcile every empty cell's pencil marks with the engine's view:
     * empty cells get filled with engine candidates; cells with existing
     * marks have provably-wrong digits removed (intersection with engine
     * candidates). We never *add back* digits to a cell that already has
     * marks — that would undo eliminations the user (or tutor) has made.
     * Counts as an assist for leaderboard marking.
     */
    fun autoPencil() {
        val s = _state.value ?: return
        if (s.isPaused) return
        val newCells = s.cells.map { it.toMutableList() }.toMutableList()
        var changed = false
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                val cell = newCells[r][c]
                if (cell.value != null) continue
                val cands = engineCandidates(r, c, newCells)
                val current = cell.notes
                val next = if (current.isEmpty()) cands else current.intersect(cands)
                if (next != current) {
                    newCells[r][c] = cell.copy(notes = next)
                    changed = true
                }
            }
        }
        if (!changed) return
        _state.value = s.copy(
            cells = newCells.map { it.toList() },
            pencilAssistsUsed = s.pencilAssistsUsed + 1
        )
        saveProgress()
    }

    private fun engineCandidates(row: Int, col: Int, cells: List<List<Cell>>): Set<Int> {
        val cands = (1..9).toMutableSet()
        for (c in 0 until 9) if (c != col) cells[row][c].value?.let { cands.remove(it) }
        for (r in 0 until 9) if (r != row) cells[r][col].value?.let { cands.remove(it) }
        val boxR = (row / 3) * 3
        val boxC = (col / 3) * 3
        for (r in boxR until boxR + 3) {
            for (c in boxC until boxC + 3) {
                if (r == row && c == col) continue
                cells[r][c].value?.let { cands.remove(it) }
            }
        }
        return cands
    }

    // endregion

    // endregion

    // region Lifecycle

    fun enterBackground() {
        val s = _state.value ?: return
        if (s.isPaused) return
        _state.value = s.copy(isPaused = true)
        wasAutoPaused = true
        // Cancel the timer coroutine entirely so off-screen time can't
        // accumulate even if the isPaused gate fails.
        timerJob?.cancel()
        timerJob = null
        saveProgress()
    }

    fun enterForeground() {
        if (!wasAutoPaused) return
        _state.update { it?.copy(isPaused = false) }
        wasAutoPaused = false
        // Restart the timer from the current elapsed value.
        val current = _state.value?.elapsedSeconds ?: 0
        startTimer(current)
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
        solveCallback?.invoke(result, state.mistakeCount)
    }

    private fun loadPuzzle(puzzle: Puzzle) {
        viewModelScope.launch {
            val saved = saveRepo.load(puzzle.id)
            if (saved != null) {
                loadPuzzleFromSave(saved)
            } else {
                _state.update { s ->
                    if (s == null) return@update null
                    s.copy(
                        puzzle = puzzle,
                        cells = buildCells(puzzle.givens),
                        selected = null,
                        mode = InputMode.NORMAL,
                        elapsedSeconds = 0,
                        mistakeCount = 0,
                        hintsUsed = 0,
                        pencilAssistsUsed = 0,
                        // Snapshot sticky flags from current toggle state.
                        highlightMistakesEverOn = s.highlightMistakes,
                        highlightConstraintsEverOn = s.highlightConstraints,
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
                hintsUsed = save.hintsUsed,
                pencilAssistsUsed = save.pencilAssistsUsed,
                highlightMistakesEverOn = save.highlightMistakesEverOn,
                highlightConstraintsEverOn = save.highlightConstraintsEverOn,
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
                        lastPlayedAt = System.currentTimeMillis(),
                        hintsUsed = s.hintsUsed,
                        pencilAssistsUsed = s.pencilAssistsUsed,
                        highlightMistakesEverOn = s.highlightMistakesEverOn,
                        highlightConstraintsEverOn = s.highlightConstraintsEverOn
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
                prefsRepo = container.prefsRepo,
                soundManager = container.soundManager
            ) as T
        }
    }
}
