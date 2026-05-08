//
//  SudokuGame.swift
//  Sudoku
//

import Foundation
import Combine

struct Cell: Equatable, Codable {
    var value: Int?
    var isFixed: Bool
    var notes: Set<Int>
}

enum InputMode {
    case normal
    case pencil
}

final class SudokuGame: ObservableObject {
    @Published private(set) var cells: [[Cell]]
    @Published var selected: (row: Int, col: Int)?
    @Published var mode: InputMode = .normal
    @Published var highlightMistakes: Bool = true {
        didSet { if highlightMistakes { highlightMistakesEverOn = true } }
    }
    @Published var highlightConstraints: Bool = true {
        didSet { if highlightConstraints { highlightConstraintsEverOn = true } }
    }
    /// Sticky flags: once `true` during a solve, stay `true` even after the
    /// user toggles the assist off. The leaderboard records assistance
    /// honestly — flipping mistakes-highlighting off mid-puzzle doesn't
    /// erase the help you got earlier. Reset on `reset()` / `loadPuzzle()`.
    @Published private(set) var highlightMistakesEverOn: Bool = true
    @Published private(set) var highlightConstraintsEverOn: Bool = true
    @Published private(set) var elapsedSeconds: Int = 0
    @Published private(set) var mistakeCount: Int = 0
    @Published private(set) var hintsUsed: Int = 0
    @Published private(set) var pencilAssistsUsed: Int = 0
    @Published var isPaused: Bool = false
    @Published private var lastPlacementInfo: PlacementUndo?

    /// Public coordinate-only view of the most recent placement.
    var lastPlacement: (row: Int, col: Int)? {
        lastPlacementInfo.map { ($0.row, $0.col) }
    }

    /// Snapshot captured when a value is placed so Undo can restore both the
    /// cell's prior notes and any pencil marks we auto-cleared from peers.
    private struct PlacementUndo {
        let row: Int
        let col: Int
        let placedValue: Int
        let previousNotes: Set<Int>
        let autoClearedPeers: [(row: Int, col: Int)]
    }

    private let provider: PuzzleProvider
    private let history: PuzzleHistory?
    private let store: GameStore?
    private var puzzle: Puzzle
    private var timer: AnyCancellable?

    var puzzleID: Int { puzzle.id }

    var currentPuzzle: Puzzle { puzzle }

    var isSolved: Bool {
        for r in 0..<9 {
            var seen = Set<Int>()
            for c in 0..<9 {
                guard let v = cells[r][c].value else { return false }
                seen.insert(v)
            }
            if seen.count != 9 { return false }
        }
        for c in 0..<9 {
            var seen = Set<Int>()
            for r in 0..<9 {
                guard let v = cells[r][c].value else { return false }
                seen.insert(v)
            }
            if seen.count != 9 { return false }
        }
        for boxR in stride(from: 0, to: 9, by: 3) {
            for boxC in stride(from: 0, to: 9, by: 3) {
                var seen = Set<Int>()
                for r in boxR..<boxR + 3 {
                    for c in boxC..<boxC + 3 {
                        guard let v = cells[r][c].value else { return false }
                        seen.insert(v)
                    }
                }
                if seen.count != 9 { return false }
            }
        }
        return true
    }

    init(provider: PuzzleProvider = HardcodedPuzzleProvider(),
         history: PuzzleHistory? = nil,
         store: GameStore? = nil,
         initialDifficulty: Difficulty = .medium) {
        self.provider = provider
        self.history = history
        self.store = store

        // Resume the most recently played in-progress save if there is one.
        // If no save, hold a tiny placeholder puzzle so init returns instantly
        // — generating a real puzzle here would block the main thread for
        // several seconds on cold start (see PuzzleGenerator's classify loop).
        // The home screen never reads `cells` from this state; the first time
        // we need a real puzzle is when the user taps Daily / New Game, which
        // generates on a background thread by then.
        if let save = store?.mostRecent {
            self.puzzle = save.puzzle
            self.cells = save.cells
            self.mistakeCount = save.mistakeCount
            self.hintsUsed = save.hintsUsed
            self.pencilAssistsUsed = save.pencilAssistsUsed
            self.highlightMistakesEverOn = save.highlightMistakesEverOn
            self.highlightConstraintsEverOn = save.highlightConstraintsEverOn
            startTimer(from: save.elapsedSeconds)
        } else {
            self.puzzle = Self.placeholderPuzzle
            self.cells = SudokuGame.buildCells(from: Self.placeholderPuzzle.givens)
            startTimer()
        }
    }

    /// Empty 9×9 puzzle used while we wait for the first real generation.
    /// The home screen never displays this — it's only readable when phase
    /// is .playing, and we always generate-and-swap a real puzzle before
    /// going there. See SudokuGame.init for the rationale.
    private static let placeholderPuzzle = Puzzle(
        id: 0,
        difficulty: .easy,
        givens: Array(repeating: Array(repeating: 0, count: 9), count: 9),
        solution: nil
    )

    private var completedPuzzleIDs: Set<Int> {
        Set((history?.results ?? []).map(\.puzzleID))
    }

    private var inProgressPuzzleIDs: Set<Int> {
        guard let saves = store?.saves else { return [] }
        return Set(saves.keys)
    }

    // MARK: - Timer

    private func startTimer(from initialSeconds: Int = 0) {
        timer?.cancel()
        elapsedSeconds = initialSeconds
        timer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, !self.isPaused else { return }
                self.elapsedSeconds += 1
            }
    }

    // MARK: - Save / restore

    /// Persists the current game state via the GameStore if there's progress
    /// to remember. Removes the save when there's nothing to remember
    /// (cleared, solved, untouched).
    private func saveProgress() {
        guard let store else { return }
        if hasProgress && !isSolved {
            store.save(GameSave(
                puzzle: puzzle,
                cells: cells,
                elapsedSeconds: elapsedSeconds,
                mistakeCount: mistakeCount,
                lastPlayedAt: Date(),
                hintsUsed: hintsUsed,
                pencilAssistsUsed: pencilAssistsUsed,
                highlightMistakesEverOn: highlightMistakesEverOn,
                highlightConstraintsEverOn: highlightConstraintsEverOn
            ))
        } else {
            store.remove(puzzleID: puzzle.id)
        }
    }

    /// Switch to a specific in-progress save (called from the games list).
    func resume(_ save: GameSave) {
        saveProgress()
        loadPuzzle(save.puzzle)
    }

    /// Load a puzzle into the game. If a save exists for it, restore that
    /// state; otherwise start fresh from the givens.
    private func loadPuzzle(_ p: Puzzle) {
        puzzle = p
        if let save = store?.load(puzzleID: p.id) {
            cells = save.cells
            mistakeCount = save.mistakeCount
            hintsUsed = save.hintsUsed
            pencilAssistsUsed = save.pencilAssistsUsed
            highlightMistakesEverOn = save.highlightMistakesEverOn
            highlightConstraintsEverOn = save.highlightConstraintsEverOn
            startTimer(from: save.elapsedSeconds)
        } else {
            cells = SudokuGame.buildCells(from: p.givens)
            mistakeCount = 0
            hintsUsed = 0
            pencilAssistsUsed = 0
            // Initialize sticky flags from the user's current toggle state
            // (typically the prefs defaults). They'll only flip true if the
            // user explicitly turns them on at any point in the solve.
            highlightMistakesEverOn = highlightMistakes
            highlightConstraintsEverOn = highlightConstraints
            startTimer()
        }
        selected = nil
        mode = .normal
        isPaused = false
        lastPlacementInfo = nil
    }

    func togglePause() {
        isPaused.toggle()
        // Manual toggle — clear the auto-pause flag so foregrounding doesn't
        // override the user's choice.
        wasAutoPaused = false
        saveProgress()
    }

    // MARK: - App lifecycle

    private var wasAutoPaused = false

    /// Called when the app moves to background/inactive. Pauses the timer
    /// if the game was running so off-screen time doesn't accumulate.
    /// Also cancels the underlying Timer publisher — belt-and-braces against
    /// run-loop quirks where queued ticks could fire all at once on
    /// resumption (see iOS Combine + suspended run-loop behaviour).
    func enterBackground() {
        guard !isPaused else { return }
        isPaused = true
        wasAutoPaused = true
        timer?.cancel()
        timer = nil
        saveProgress()
    }

    /// Called when the app returns to active. Resumes only if we were the
    /// ones who paused — leaves a manually-paused game paused. Restarts the
    /// timer publisher from the current elapsed value.
    func enterForeground() {
        guard wasAutoPaused else { return }
        isPaused = false
        wasAutoPaused = false
        startTimer(from: elapsedSeconds)
    }

    var formattedTime: String {
        let m = elapsedSeconds / 60
        let s = elapsedSeconds % 60
        return String(format: "%02d:%02d", m, s)
    }

    // MARK: - Selection

    func select(row: Int, col: Int) {
        // Tap-the-already-selected cell = deselect — gives the user an easy
        // "show me the board with no highlights" gesture.
        if let sel = selected, sel.row == row && sel.col == col {
            selected = nil
            lastPlacementInfo = nil
            return
        }
        if let last = lastPlacementInfo, last.row != row || last.col != col {
            lastPlacementInfo = nil
        }
        selected = (row, col)
    }

    var canEraseSelected: Bool {
        guard let sel = selected else { return false }
        if isLocked(row: sel.row, col: sel.col) { return false }
        let cell = cells[sel.row][sel.col]
        return cell.value != nil || !cell.notes.isEmpty
    }

    /// Label for the Erase button. Becomes "Undo" when the selected cell is
    /// the most recent placement and is still undoable (not locked) — only
    /// applies when "Highlight mistakes" is on, since that's the mode that
    /// gives placements an undoable identity.
    var eraseLabel: String {
        guard highlightMistakes,
              let sel = selected,
              let last = lastPlacement,
              sel.row == last.row, sel.col == last.col,
              !isLocked(row: sel.row, col: sel.col)
        else { return "Erase" }
        return "Undo"
    }

    // MARK: - Input

    /// True if the cell can't be changed: either it's a given, or — when
    /// "Highlight mistakes" is on — the user has placed the correct value.
    /// With the toggle off, no auto-locking; only fixed cells are immutable.
    func isLocked(row: Int, col: Int) -> Bool {
        let cell = cells[row][col]
        if cell.isFixed { return true }
        if highlightMistakes,
           let solution = puzzle.solution,
           let v = cell.value,
           v == solution[row][col] {
            return true
        }
        return false
    }

    func enter(_ number: Int) {
        guard !isPaused else { return }

        // Tap-to-highlight: with no selection, or when the selected cell is
        // already filled, treat a pad tap as a navigation to a cell with
        // that number — same effect as tapping a board cell with the number.
        let shouldNavigate: Bool = {
            guard let sel = selected else { return true }
            return cells[sel.row][sel.col].value != nil
        }()
        if shouldNavigate {
            if let target = firstCell(withValue: number) {
                select(row: target.row, col: target.col)
            }
            return
        }

        guard let sel = selected else { return }
        guard !isLocked(row: sel.row, col: sel.col) else { return }
        var cell = cells[sel.row][sel.col]
        let previousNotes = cell.notes

        var didPlaceValue = false
        switch mode {
        case .normal:
            // Tapping the same number clears it. (Only reachable when cell is
            // empty given the navigation guard above, so this is effectively
            // dead code in normal mode now — kept for symmetry.)
            if cell.value == number {
                cell.value = nil
            } else {
                cell.value = number
                cell.notes.removeAll()
                didPlaceValue = true
            }
        case .pencil:
            // Notes only meaningful when no value is set.
            if cell.value != nil { cell.value = nil }
            if cell.notes.contains(number) {
                cell.notes.remove(number)
            } else {
                cell.notes.insert(number)
            }
        }
        cells[sel.row][sel.col] = cell

        // Auto-clear peers' pencil marks of the placed value, capturing what
        // we cleared so Undo can put them back.
        var autoClearedPeers: [(row: Int, col: Int)] = []
        if mode == .normal && didPlaceValue {
            for peer in peers(row: sel.row, col: sel.col)
                where cells[peer.row][peer.col].notes.contains(number) {
                cells[peer.row][peer.col].notes.remove(number)
                autoClearedPeers.append(peer)
            }
        }

        if mode == .normal {
            if didPlaceValue {
                lastPlacementInfo = PlacementUndo(
                    row: sel.row,
                    col: sel.col,
                    placedValue: number,
                    previousNotes: previousNotes,
                    autoClearedPeers: autoClearedPeers
                )
            } else if let last = lastPlacementInfo, last.row == sel.row, last.col == sel.col {
                lastPlacementInfo = nil
            }
        }

        // Mistake counter is solution-based and fires regardless of the
        // "Highlight mistakes" toggle — leaderboard fairness shouldn't depend
        // on whether the player wanted real-time feedback.
        if didPlaceValue,
           let solution = puzzle.solution,
           solution[sel.row][sel.col] != number {
            mistakeCount += 1
        }
        // Visual + sound feedback still gated on the toggle, and uses the
        // softer "creates a conflict" rule (matches what's drawn in red).
        let isMistake = didPlaceValue && highlightMistakes && hasConflict(row: sel.row, col: sel.col)

        if didPlaceValue && isSolved {
            timer?.cancel()
        }

        saveProgress()

        // Sound cues — order matters: solve wins over unit, mistake wins over
        // place. Solve also fires standalone so the fanfare has audio support.
        if didPlaceValue {
            if isSolved {
                SoundManager.shared.play(.solved)
            } else if isMistake {
                SoundManager.shared.play(.mistake)
            } else {
                let placedCorrectly = puzzle.solution.map { $0[sel.row][sel.col] == number } ?? false
                // Row/column completion is too subtle to chime on — too easy
                // to do without noticing. Box completion is more visible
                // (3×3 area going complete), and "all 9 of this digit are now
                // down" is a satisfying milestone you can feel.
                let unitJustCompleted = placedCorrectly && (
                    isUnitCorrect(boxRow: sel.row, boxCol: sel.col) ||
                    isComplete(number)
                )
                SoundManager.shared.play(unitJustCompleted ? .unitComplete : .place)
            }
        }
    }

    /// True if every cell in the row is filled with the solution's value.
    /// Returns false if the puzzle has no known solution.
    private func isUnitCorrect(row: Int) -> Bool {
        guard let solution = puzzle.solution else { return false }
        for c in 0..<9 where cells[row][c].value != solution[row][c] { return false }
        return true
    }

    private func isUnitCorrect(col: Int) -> Bool {
        guard let solution = puzzle.solution else { return false }
        for r in 0..<9 where cells[r][col].value != solution[r][col] { return false }
        return true
    }

    private func isUnitCorrect(boxRow: Int, boxCol: Int) -> Bool {
        guard let solution = puzzle.solution else { return false }
        let r0 = (boxRow / 3) * 3
        let c0 = (boxCol / 3) * 3
        for r in r0..<r0 + 3 {
            for c in c0..<c0 + 3 where cells[r][c].value != solution[r][c] { return false }
        }
        return true
    }

    private func firstCell(withValue v: Int) -> (row: Int, col: Int)? {
        for r in 0..<9 {
            for c in 0..<9 where cells[r][c].value == v {
                return (r, c)
            }
        }
        return nil
    }

    /// All cells that share a row, column, or 3×3 box with the given cell,
    /// excluding the cell itself. 20 entries.
    private func peers(row: Int, col: Int) -> [(row: Int, col: Int)] {
        var result: [(Int, Int)] = []
        for c in 0..<9 where c != col {
            result.append((row, c))
        }
        for r in 0..<9 where r != row {
            result.append((r, col))
        }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 where r != row && c != col {
                result.append((r, c))
            }
        }
        return result
    }

    func clearSelected() {
        guard !isPaused else { return }
        guard let sel = selected else { return }
        guard !isLocked(row: sel.row, col: sel.col) else { return }

        let cellBefore = cells[sel.row][sel.col]
        let hadContent = cellBefore.value != nil || !cellBefore.notes.isEmpty

        // If clearing the most recent placement, treat as Undo: restore the
        // cell's prior notes and put back any pencil marks we auto-cleared
        // from peers.
        if let last = lastPlacementInfo, last.row == sel.row, last.col == sel.col {
            var cell = cells[sel.row][sel.col]
            cell.value = nil
            cell.notes = last.previousNotes
            cells[sel.row][sel.col] = cell
            for peer in last.autoClearedPeers {
                cells[peer.row][peer.col].notes.insert(last.placedValue)
            }
            lastPlacementInfo = nil
        } else {
            var cell = cells[sel.row][sel.col]
            cell.value = nil
            cell.notes.removeAll()
            cells[sel.row][sel.col] = cell
        }
        saveProgress()

        if hadContent { SoundManager.shared.play(.erase) }
    }

    func toggleMode() {
        mode = (mode == .normal) ? .pencil : .normal
    }

    // MARK: - Tutor

    /// Returns the easiest applicable hint for the current state, or nil if
    /// none of the v1 techniques (naked single, hidden single) apply.
    func nextTutorHint() -> TutorHint? {
        TutorEngine.findHint(cells: cells)
    }

    /// Mark that the user opened the tutor and saw a hint. We charge the
    /// "hint used" badge as soon as the user peeks at a suggestion, even
    /// if they dismiss the sheet without tapping Apply / Got it — the
    /// information is already in their head at that point.
    func noteHintViewed() {
        guard !isPaused else { return }
        hintsUsed += 1
        saveProgress()
    }

    /// Reconcile every empty cell's pencil marks with the engine's view:
    /// - Cells with no marks get filled with engine candidates.
    /// - Cells with existing marks have any provably-wrong digits removed
    ///   (digits no longer possible per row/col/box).
    ///
    /// Crucially we don't *add back* digits to a cell that already has
    /// marks — that would undo eliminations the user (or the tutor) has
    /// already made. To get a fresh fill on a cell, erase its marks first
    /// and tap again. Counts as an assist for leaderboard marking.
    func autoPencil() {
        guard !isPaused else { return }
        var changed = false
        for r in 0..<9 {
            for c in 0..<9 {
                guard cells[r][c].value == nil else { continue }
                let cands = engineCandidates(row: r, col: c)
                let current = cells[r][c].notes
                let next = current.isEmpty ? cands : current.intersection(cands)
                if next != current {
                    var copy = cells[r][c]
                    copy.notes = next
                    cells[r][c] = copy
                    changed = true
                }
            }
        }
        guard changed else { return }
        pencilAssistsUsed += 1
        saveProgress()
    }

    /// Constraint-derived candidates for a cell — digits 1...9 minus those
    /// already placed in the cell's row, column, or 3×3 box.
    private func engineCandidates(row: Int, col: Int) -> Set<Int> {
        var cands = Set(1...9)
        for c in 0..<9 where c != col {
            if let v = cells[row][c].value { cands.remove(v) }
        }
        for r in 0..<9 where r != row {
            if let v = cells[r][col].value { cands.remove(v) }
        }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 where !(r == row && c == col) {
                if let v = cells[r][c].value { cands.remove(v) }
            }
        }
        return cands
    }

    /// Apply a tutor hint. Placement-style hints (naked / hidden single)
    /// fill the deduced cell; elimination-style hints (naked / pointing pair)
    /// erase the called-out candidates from the user's pencil marks. The
    /// `hintsUsed` counter is bumped earlier in `noteHintViewed()` (the
    /// moment the sheet shows a hint) so even peek-and-dismiss counts.
    func applyTutorHint(_ hint: TutorHint) {
        guard !isPaused else { return }
        if let p = hint.placement {
            selected = (p.row, p.col)
            mode = .normal
            enter(p.value)
        } else if !hint.eliminations.isEmpty {
            for elim in hint.eliminations {
                var cell = cells[elim.row][elim.col]
                cell.notes.subtract(elim.candidates)
                cells[elim.row][elim.col] = cell
            }
            saveProgress()
        }
    }

    // MARK: - Reset / New game

    /// True if any empty cell has at least one pencil mark. Used by the
    /// tutor's empty-state copy so it can tell whether the user needs to
    /// pencil first or has hit the limit of our technique vocabulary.
    var hasAnyPencilMarks: Bool {
        for row in cells {
            for cell in row where !cell.notes.isEmpty {
                return true
            }
        }
        return false
    }

    var hasProgress: Bool {
        for row in cells {
            for cell in row where !cell.isFixed {
                if cell.value != nil || !cell.notes.isEmpty { return true }
            }
        }
        return false
    }

    func reset() {
        cells = SudokuGame.buildCells(from: puzzle.givens)
        selected = nil
        mode = .normal
        mistakeCount = 0
        hintsUsed = 0
        pencilAssistsUsed = 0
        // Re-snapshot sticky flags from current toggle state — fresh attempt
        // means a fresh measurement of "did you ever use these assists?"
        highlightMistakesEverOn = highlightMistakes
        highlightConstraintsEverOn = highlightConstraints
        isPaused = false
        lastPlacementInfo = nil
        startTimer()
        saveProgress() // hasProgress is false → removes any save for this puzzle
    }

    func newGame(difficulty: Difficulty = .medium) {
        saveProgress() // checkpoint current game's state before switching
        var excluded = completedPuzzleIDs.union(inProgressPuzzleIDs)
        excluded.insert(puzzle.id)
        let next = provider.nextPuzzle(difficulty: difficulty, excluding: excluded)
        loadPuzzle(next)
    }

    /// Load the daily puzzle for the given date. If the user has already
    /// started or completed today's daily, `loadPuzzle` will pick up the
    /// existing save / cells from the store.
    func startDaily(date: Date = Date()) {
        saveProgress()
        let next = provider.dailyPuzzle(for: date)
        loadPuzzle(next)
    }

    /// Load a daily puzzle that's already been resolved by the caller —
    /// typically `DailyPuzzleStore.ensureToday()`, which handles the
    /// server-fetch + offline-fallback logic and returns a ready `Puzzle`.
    func startDaily(puzzle: Puzzle) {
        saveProgress()
        loadPuzzle(puzzle)
    }

    // MARK: - Highlight helpers

    func isHighlighted(row: Int, col: Int) -> Bool {
        guard highlightConstraints, let sel = selected else { return false }
        if sel.row == row && sel.col == col { return false }
        if sel.row == row || sel.col == col { return true }
        let boxR = (sel.row / 3) * 3
        let boxC = (sel.col / 3) * 3
        return (boxR..<boxR + 3).contains(row) && (boxC..<boxC + 3).contains(col)
    }

    func isComplete(_ number: Int) -> Bool {
        var count = 0
        for r in 0..<9 {
            for c in 0..<9 where cells[r][c].value == number {
                if highlightMistakes && hasConflict(row: r, col: c) { continue }
                count += 1
            }
        }
        return count >= 9
    }

    func hasConflict(row: Int, col: Int) -> Bool {
        let cell = cells[row][col]
        guard let v = cell.value else { return false }
        if cell.isFixed { return false }

        // Solution-based check for user-entered cells: any value that doesn't
        // match the puzzle's solution is wrong, even if it doesn't yet violate
        // a row/col/box rule. This catches placements that create unsolvable
        // states without an immediate duplicate.
        if let solution = puzzle.solution {
            return v != solution[row][col]
        }

        // Rule-based fallback (puzzles without a known solution).
        for i in 0..<9 {
            if i != col && cells[row][i].value == v { return true }
            if i != row && cells[i][col].value == v { return true }
        }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 {
                if (r != row || c != col) && cells[r][c].value == v { return true }
            }
        }
        return false
    }

    func isMatchingNumber(row: Int, col: Int) -> Bool {
        guard let sel = selected else { return false }
        if sel.row == row && sel.col == col { return false }
        let target = cells[sel.row][sel.col].value
        guard let t = target else { return false }
        return cells[row][col].value == t
    }

    /// True if this cell sits in a row, column, or 3×3 box that already
    /// contains the selected cell's value — i.e. that value can't go here
    /// under direct Sudoku rules. Entirely gated by the constraints toggle.
    func isUnavailableForSelectedValue(row: Int, col: Int) -> Bool {
        guard highlightConstraints else { return false }
        guard let sel = selected else { return false }
        if sel.row == row && sel.col == col { return false }
        guard let v = cells[sel.row][sel.col].value else { return false }
        // Any filled cell is unavailable — its slot is taken regardless of value.
        // (Matching cells still pick up their own tint via isMatching, which
        // sits above isHighlighted in the background ladder.)
        if cells[row][col].value != nil { return true }
        for c in 0..<9 where cells[row][c].value == v { return true }
        for r in 0..<9 where cells[r][col].value == v { return true }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 {
                if cells[r][c].value == v { return true }
            }
        }
        return false
    }

    // MARK: - Building

    private static func buildCells(from givens: [[Int]]) -> [[Cell]] {
        givens.map { row in
            row.map { v in
                v == 0
                    ? Cell(value: nil, isFixed: false, notes: [])
                    : Cell(value: v, isFixed: true, notes: [])
            }
        }
    }
}
