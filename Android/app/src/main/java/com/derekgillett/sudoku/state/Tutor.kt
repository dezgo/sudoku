package com.derekgillett.sudoku.state

import com.derekgillett.sudoku.model.Cell

/**
 * In-context tutor: finds the easiest applicable next move and produces a
 * step-by-step narration of how to spot it. Mirrors `Tutor.swift` on iOS.
 */
enum class TutorTechnique(val label: String, val tier: Tier) {
    NAKED_SINGLE("Naked Single", Tier.SIMPLE),
    HIDDEN_SINGLE("Hidden Single", Tier.SIMPLE),
    NAKED_PAIR("Naked Pair", Tier.MEDIUM),
    POINTING_PAIR("Pointing Pair", Tier.MEDIUM),
    BOX_LINE_REDUCTION("Box/Line Reduction", Tier.MEDIUM),
    HIDDEN_PAIR("Hidden Pair", Tier.MEDIUM),
    NAKED_TRIPLE("Naked Triple", Tier.HARD),
    HIDDEN_TRIPLE("Hidden Triple", Tier.HARD),
    X_WING("X-Wing", Tier.HARD),
    XY_WING("XY-Wing", Tier.HARD),
    SWORDFISH("Swordfish", Tier.HARD),
    NAKED_QUAD("Naked Quad", Tier.HARD),
    HIDDEN_QUAD("Hidden Quad", Tier.HARD),
    JELLYFISH("Jellyfish", Tier.HARD),
    XYZ_WING("XYZ-Wing", Tier.HARD),
    W_WING("W-Wing", Tier.HARD),
    SKYSCRAPER("Skyscraper", Tier.HARD),
    EMPTY_RECTANGLE("Empty Rectangle", Tier.HARD),
    TWO_STRING_KITE("2-String Kite", Tier.HARD),
    FINNED_X_WING("Finned X-Wing", Tier.HARD),
    FINNED_SWORDFISH("Finned Swordfish", Tier.HARD);

    /** Difficulty bands. Used by the empty-state copy and available for
     * future puzzle-generator calibration. */
    enum class Tier { SIMPLE, MEDIUM, HARD }
}

/**
 * One cell decorated for the tutor's overlay. `candidates` carries digits
 * the tutor wants the cell to call out as pencil-style marks while the
 * highlight is on screen — needed by elimination techniques (pair, pointing).
 * Empty when only a background tint is wanted (focus, target).
 */
data class TutorHighlight(
    val row: Int,
    val col: Int,
    val kind: Kind,
    val candidates: Set<Int> = emptySet()
) {
    enum class Kind { FOCUS, ELIMINATOR, TARGET }
}

data class TutorStep(
    val narration: String,
    val highlights: List<TutorHighlight>
)

/**
 * A hint either *places* a digit (placement-style: naked single, hidden
 * single) or *eliminates* candidates (naked pair, pointing pair, box-line
 * reduction, hidden pair). Both kinds can be applied: placement fills the
 * cell; elimination erases the called-out candidates from user pencil marks.
 */
data class TutorHint(
    val technique: TutorTechnique,
    val placement: Placement?,
    val eliminations: List<Elimination>,
    val steps: List<TutorStep>
) {
    data class Placement(val row: Int, val col: Int, val value: Int)
    data class Elimination(val row: Int, val col: Int, val candidates: Set<Int>)
}

object TutorEngine {

    /**
     * Easiest applicable hint, or null if no implemented technique fits.
     * Order matches escalating difficulty: try the simplest first.
     */
    fun findHint(cells: List<List<Cell>>): TutorHint? {
        findNakedSingle(cells)?.let { return it }
        findHiddenSingle(cells)?.let { return it }
        findNakedPair(cells)?.let { return it }
        findPointingPair(cells)?.let { return it }
        findBoxLineReduction(cells)?.let { return it }
        findHiddenPair(cells)?.let { return it }
        findNakedTriple(cells)?.let { return it }
        findHiddenTriple(cells)?.let { return it }
        findXWing(cells)?.let { return it }
        findXYWing(cells)?.let { return it }
        findSwordfish(cells)?.let { return it }
        findNakedQuad(cells)?.let { return it }
        findHiddenQuad(cells)?.let { return it }
        findJellyfish(cells)?.let { return it }
        findXYZWing(cells)?.let { return it }
        findWWing(cells)?.let { return it }
        findSkyscraper(cells)?.let { return it }
        findTwoStringKite(cells)?.let { return it }
        findEmptyRectangle(cells)?.let { return it }
        findFinnedXWing(cells)?.let { return it }
        findFinnedSwordfish(cells)?.let { return it }
        return null
    }

    /**
     * Solve the puzzle by repeatedly applying engine hints, returning the
     * hardest tier required. null if the engine can't fully solve via the
     * implemented techniques. Used by the puzzle generator to calibrate
     * Easy / Medium / Hard against the techniques actually required,
     * rather than just clue count. Mirrors classify() on iOS.
     */
    fun classify(startCells: List<List<Cell>>): TutorTechnique.Tier? {
        var cells = autoPencil(startCells)
        var maxTier = TutorTechnique.Tier.SIMPLE
        for (attempt in 0 until 400) {
            if (isSolved(cells)) return maxTier
            val hint = findHint(cells) ?: return null
            maxTier = harder(maxTier, hint.technique.tier)
            cells = applyHint(hint, cells)
        }
        return null
    }

    private fun isSolved(cells: List<List<Cell>>): Boolean {
        for (r in 0 until 9) {
            for (c in 0 until 9) if (cells[r][c].value == null) return false
        }
        return true
    }

    private fun harder(a: TutorTechnique.Tier, b: TutorTechnique.Tier): TutorTechnique.Tier =
        when {
            a == TutorTechnique.Tier.HARD || b == TutorTechnique.Tier.HARD -> TutorTechnique.Tier.HARD
            a == TutorTechnique.Tier.MEDIUM || b == TutorTechnique.Tier.MEDIUM -> TutorTechnique.Tier.MEDIUM
            else -> TutorTechnique.Tier.SIMPLE
        }

    private fun applyHint(hint: TutorHint, cells: List<List<Cell>>): List<List<Cell>> {
        val result = cells.map { it.toMutableList() }.toMutableList()
        val placement = hint.placement
        if (placement != null) {
            result[placement.row][placement.col] =
                result[placement.row][placement.col].copy(value = placement.value, notes = emptySet())
            // Auto-clear the placed digit from peers' notes.
            for (c in 0 until 9) if (c != placement.col) {
                result[placement.row][c] = result[placement.row][c].copy(
                    notes = result[placement.row][c].notes - placement.value
                )
            }
            for (r in 0 until 9) if (r != placement.row) {
                result[r][placement.col] = result[r][placement.col].copy(
                    notes = result[r][placement.col].notes - placement.value
                )
            }
            val boxR = (placement.row / 3) * 3
            val boxC = (placement.col / 3) * 3
            for (r in boxR until boxR + 3) {
                for (c in boxC until boxC + 3) {
                    if (r == placement.row && c == placement.col) continue
                    result[r][c] = result[r][c].copy(notes = result[r][c].notes - placement.value)
                }
            }
        } else {
            for (elim in hint.eliminations) {
                result[elim.row][elim.col] =
                    result[elim.row][elim.col].copy(notes = result[elim.row][elim.col].notes - elim.candidates)
            }
        }
        return result.map { it.toList() }
    }

    private fun autoPencil(cells: List<List<Cell>>): List<List<Cell>> {
        val result = cells.map { it.toMutableList() }.toMutableList()
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (result[r][c].value != null) continue
                result[r][c] = result[r][c].copy(notes = candidates(r, c, result))
            }
        }
        return result.map { it.toList() }
    }

    // region Naked single

    private fun findNakedSingle(cells: List<List<Cell>>): TutorHint? {
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (cells[r][c].value != null) continue
                val cands = candidates(r, c, cells)
                if (cands.size == 1) {
                    val v = cands.first()
                    return buildNakedSingle(r, c, v, cells)
                }
            }
        }
        return null
    }

    private fun buildNakedSingle(row: Int, col: Int, value: Int, cells: List<List<Cell>>): TutorHint {
        val used = peerValues(row, col, cells).sorted()
        val usedList = used.joinToString(", ")
        val target = TutorHighlight(row, col, TutorHighlight.Kind.TARGET)
        val eliminators = peers(row, col)
            .filter { cells[it.row][it.col].value != null }
            .map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR) }

        return TutorHint(
            technique = TutorTechnique.NAKED_SINGLE,
            placement = TutorHint.Placement(row, col, value),
            eliminations = emptyList(),
            steps = listOf(
                TutorStep(
                    narration = "Take a look at this empty cell. We're going to figure out what number can go here.",
                    highlights = listOf(target)
                ),
                TutorStep(
                    narration = "Its row, column, and 3×3 box already use $usedList. Each of those is ruled out for this cell.",
                    highlights = listOf(target) + eliminators
                ),
                TutorStep(
                    narration = "That leaves only $value. It must go in this cell.",
                    highlights = listOf(target)
                )
            )
        )
    }

    // endregion

    // region Hidden single

    private sealed class UnitKind {
        data class Row(val r: Int) : UnitKind()
        data class Column(val c: Int) : UnitKind()
        data class Box(val rowBlock: Int, val colBlock: Int) : UnitKind()

        val label: String
            get() = when (this) {
                is Row -> "row"
                is Column -> "column"
                is Box -> "3×3 box"
            }
    }

    private fun findHiddenSingle(cells: List<List<Cell>>): TutorHint? {
        for (r in 0 until 9) {
            hiddenSingleInUnit(unitCells(UnitKind.Row(r)), UnitKind.Row(r), cells)?.let { return it }
        }
        for (c in 0 until 9) {
            hiddenSingleInUnit(unitCells(UnitKind.Column(c)), UnitKind.Column(c), cells)?.let { return it }
        }
        for (br in 0 until 3) {
            for (bc in 0 until 3) {
                val kind = UnitKind.Box(br, bc)
                hiddenSingleInUnit(unitCells(kind), kind, cells)?.let { return it }
            }
        }
        return null
    }

    private fun hiddenSingleInUnit(
        unit: List<CellPos>,
        kind: UnitKind,
        cells: List<List<Cell>>
    ): TutorHint? {
        val unitValues = unit.mapNotNull { cells[it.row][it.col].value }.toSet()
        val missing = (1..9).toSet() - unitValues
        for (v in missing.sorted()) {
            val cands = unit.filter {
                cells[it.row][it.col].value == null
                    && candidates(it.row, it.col, cells).contains(v)
            }
            if (cands.size != 1) continue
            val target = cands.first()

            val eliminators = mutableSetOf<TutorHighlight>()
            for (cell in unit) {
                if (cells[cell.row][cell.col].value != null) continue
                if (cell == target) continue
                for (peer in peers(cell.row, cell.col)) {
                    if (unit.contains(peer)) continue
                    if (cells[peer.row][peer.col].value == v) {
                        eliminators.add(TutorHighlight(peer.row, peer.col, TutorHighlight.Kind.ELIMINATOR))
                    }
                }
            }

            val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
            val targetHL = TutorHighlight(target.row, target.col, TutorHighlight.Kind.TARGET)

            return TutorHint(
                technique = TutorTechnique.HIDDEN_SINGLE,
                placement = TutorHint.Placement(target.row, target.col, v),
                eliminations = emptyList(),
                steps = listOf(
                    TutorStep(
                        narration = "Look at this ${kind.label}. It's missing the digit $v.",
                        highlights = focus
                    ),
                    TutorStep(
                        narration = "$v already appears in the rows, columns, or boxes of every other empty cell in this ${kind.label} — so $v can't go in any of them.",
                        highlights = focus + eliminators.toList()
                    ),
                    TutorStep(
                        narration = "Only this cell is left. $v must go here.",
                        highlights = focus + listOf(targetHL)
                    )
                )
            )
        }
        return null
    }

    // endregion

    // region Naked pair

    private fun findNakedPair(cells: List<List<Cell>>): TutorHint? {
        val units = allUnits()
        for ((kind, unit) in units) {
            val empties = unit.filter { cells[it.row][it.col].value == null }
            // Pair cells: user's pencil marks must equal the engine's
            // candidates for the cell AND have size 2. Engine validation
            // prevents wrong tips from under-pencilling; user-mark gating
            // prevents spoilers in cells the user hasn't engaged with.
            val pairCandidates = empties.filter {
                val notes = cells[it.row][it.col].notes
                notes.size == 2 && notes == candidates(it.row, it.col, cells)
            }
            for (i in pairCandidates.indices) {
                val a = pairCandidates[i]
                val aMarks = cells[a.row][a.col].notes
                for (j in (i + 1) until pairCandidates.size) {
                    val b = pairCandidates[j]
                    val bMarks = cells[b.row][b.col].notes
                    if (aMarks != bMarks) continue
                    val pairCands = aMarks
                    val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                    for (other in empties) {
                        if (other == a || other == b) continue
                        val intersect = cells[other.row][other.col].notes.intersect(pairCands)
                        if (intersect.isNotEmpty()) {
                            eliminations.add(other to intersect)
                        }
                    }
                    if (eliminations.isEmpty()) continue
                    return buildNakedPair(unit, kind, a to b, pairCands, eliminations)
                }
            }
        }
        return null
    }

    private fun buildNakedPair(
        unit: List<CellPos>,
        kind: UnitKind,
        pair: Pair<CellPos, CellPos>,
        pairCands: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val pairList = pairCands.sorted().joinToString(" and ")
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val pairHLs = listOf(
            TutorHighlight(pair.first.row, pair.first.col, TutorHighlight.Kind.TARGET, pairCands),
            TutorHighlight(pair.second.row, pair.second.col, TutorHighlight.Kind.TARGET, pairCands)
        )
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }

        return TutorHint(
            technique = TutorTechnique.NAKED_PAIR,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this ${kind.label}. These two cells can each only hold $pairList.",
                    highlights = focus + pairHLs
                ),
                TutorStep(
                    narration = "Together they must take $pairList in some order — so $pairList can be ruled out everywhere else in this ${kind.label}.",
                    highlights = focus + pairHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to erase those candidates from these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Pointing pair

    private fun findPointingPair(cells: List<List<Cell>>): TutorHint? {
        for (br in 0 until 3) {
            for (bc in 0 until 3) {
                val box = unitCells(UnitKind.Box(br, bc))
                val placedInBox = box.mapNotNull { cells[it.row][it.col].value }.toSet()
                for (d in 1..9) {
                    if (placedInBox.contains(d)) continue
                    val engineCandidates = box.filter {
                        cells[it.row][it.col].value == null
                            && candidates(it.row, it.col, cells).contains(d)
                    }
                    if (engineCandidates.size < 2) continue
                    // Validation: user has pencilled d in every box cell where
                    // the engine sees d as a candidate, otherwise the user
                    // hasn't seen the pattern.
                    val userCovered = engineCandidates.all { cells[it.row][it.col].notes.contains(d) }
                    if (!userCovered) continue

                    val rows = engineCandidates.map { it.row }.toSet()
                    val cols = engineCandidates.map { it.col }.toSet()
                    if (rows.size == 1) {
                        val r = rows.first()
                        val eliminators = (0 until 9)
                            .filter { c -> c < bc * 3 || c >= bc * 3 + 3 }
                            .filter { c -> cells[r][c].value == null && cells[r][c].notes.contains(d) }
                            .map { c -> CellPos(r, c) }
                        if (eliminators.isNotEmpty()) {
                            return buildPointingPair(box, engineCandidates, UnitKind.Row(r), d, eliminators)
                        }
                    } else if (cols.size == 1) {
                        val c = cols.first()
                        val eliminators = (0 until 9)
                            .filter { r -> r < br * 3 || r >= br * 3 + 3 }
                            .filter { r -> cells[r][c].value == null && cells[r][c].notes.contains(d) }
                            .map { r -> CellPos(r, c) }
                        if (eliminators.isNotEmpty()) {
                            return buildPointingPair(box, engineCandidates, UnitKind.Column(c), d, eliminators)
                        }
                    }
                }
            }
        }
        return null
    }

    private fun buildPointingPair(
        box: List<CellPos>,
        candidateCells: List<CellPos>,
        lineKind: UnitKind,
        digit: Int,
        eliminators: List<CellPos>
    ): TutorHint {
        val lineLabel = when (lineKind) {
            is UnitKind.Row -> "row"
            is UnitKind.Column -> "column"
            is UnitKind.Box -> "box"
        }
        val boxFocus = box.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val candidateHLs = candidateCells.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, setOf(digit))
        }
        val eliminatorHLs = eliminators.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit))
        }

        return TutorHint(
            technique = TutorTechnique.POINTING_PAIR,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this 3×3 box — where can the digit $digit go inside it?",
                    highlights = boxFocus
                ),
                TutorStep(
                    narration = "Inside the box, $digit can only land in this $lineLabel. It has to be one of these cells.",
                    highlights = boxFocus + candidateHLs
                ),
                TutorStep(
                    narration = "Since $digit must take one of those positions, it can't appear anywhere else in this $lineLabel outside the box.",
                    highlights = candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $digit off the candidates of these outside cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Box-line reduction

    private fun findBoxLineReduction(cells: List<List<Cell>>): TutorHint? {
        for (r in 0 until 9) {
            boxLineFromLine(unitCells(UnitKind.Row(r)), UnitKind.Row(r), cells)?.let { return it }
        }
        for (c in 0 until 9) {
            boxLineFromLine(unitCells(UnitKind.Column(c)), UnitKind.Column(c), cells)?.let { return it }
        }
        return null
    }

    private fun boxLineFromLine(
        line: List<CellPos>,
        lineKind: UnitKind,
        cells: List<List<Cell>>
    ): TutorHint? {
        val placedInLine = line.mapNotNull { cells[it.row][it.col].value }.toSet()
        for (d in 1..9) {
            if (placedInLine.contains(d)) continue
            val engineCands = line.filter {
                cells[it.row][it.col].value == null
                    && candidates(it.row, it.col, cells).contains(d)
            }
            if (engineCands.size < 2) continue
            val boxRows = engineCands.map { it.row / 3 }.toSet()
            val boxCols = engineCands.map { it.col / 3 }.toSet()
            if (boxRows.size != 1 || boxCols.size != 1) continue
            val br = boxRows.first()
            val bc = boxCols.first()
            // Validation: user has pencilled d in every line-candidate cell.
            if (!engineCands.all { cells[it.row][it.col].notes.contains(d) }) continue

            val box = unitCells(UnitKind.Box(br, bc))
            val eliminators = box.filter { pos ->
                if (cells[pos.row][pos.col].value != null) return@filter false
                if (!cells[pos.row][pos.col].notes.contains(d)) return@filter false
                when (lineKind) {
                    is UnitKind.Row -> pos.row != lineKind.r
                    is UnitKind.Column -> pos.col != lineKind.c
                    is UnitKind.Box -> false
                }
            }
            if (eliminators.isEmpty()) continue
            return buildBoxLineReduction(line, lineKind, engineCands, d, eliminators)
        }
        return null
    }

    private fun buildBoxLineReduction(
        line: List<CellPos>,
        lineKind: UnitKind,
        candidateCells: List<CellPos>,
        digit: Int,
        eliminators: List<CellPos>
    ): TutorHint {
        val lineLabel = when (lineKind) {
            is UnitKind.Row -> "row"
            is UnitKind.Column -> "column"
            is UnitKind.Box -> "box"
        }
        val lineFocus = line.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val candidateHLs = candidateCells.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, setOf(digit))
        }
        val eliminatorHLs = eliminators.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit))
        }

        return TutorHint(
            technique = TutorTechnique.BOX_LINE_REDUCTION,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this $lineLabel — where can the digit $digit go in it?",
                    highlights = lineFocus
                ),
                TutorStep(
                    narration = "Every spot for $digit in this $lineLabel lands inside the same 3×3 box.",
                    highlights = lineFocus + candidateHLs
                ),
                TutorStep(
                    narration = "Since $digit has to take one of those line cells, it can't go in any other cell of that box.",
                    highlights = candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $digit off these box cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Hidden pair

    private fun findHiddenPair(cells: List<List<Cell>>): TutorHint? {
        for ((kind, unit) in allUnits()) {
            val unitValues = unit.mapNotNull { cells[it.row][it.col].value }.toSet()
            val missing = ((1..9).toSet() - unitValues).sorted()
            if (missing.size < 2) continue

            for (i in missing.indices) {
                for (j in (i + 1) until missing.size) {
                    val a = missing[i]
                    val b = missing[j]
                    val aCells = unit.filter {
                        cells[it.row][it.col].value == null
                            && candidates(it.row, it.col, cells).contains(a)
                    }
                    val bCells = unit.filter {
                        cells[it.row][it.col].value == null
                            && candidates(it.row, it.col, cells).contains(b)
                    }
                    if (aCells.size != 2 || bCells.size != 2) continue
                    if (aCells.toSet() != bCells.toSet()) continue

                    val pairCells = aCells
                    val pairValid = pairCells.all { pos ->
                        val notes = cells[pos.row][pos.col].notes
                        notes.contains(a) && notes.contains(b)
                    }
                    if (!pairValid) continue

                    val pairDigits = setOf(a, b)
                    val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                    for (pos in pairCells) {
                        val extras = cells[pos.row][pos.col].notes - pairDigits
                        if (extras.isNotEmpty()) eliminations.add(pos to extras)
                    }
                    if (eliminations.isEmpty()) continue

                    return buildHiddenPair(unit, kind, pairCells, pairDigits, eliminations)
                }
            }
        }
        return null
    }

    private fun buildHiddenPair(
        unit: List<CellPos>,
        kind: UnitKind,
        pairCells: List<CellPos>,
        pairDigits: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val pairList = pairDigits.sorted().joinToString(" and ")
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val pairTargetHLs = pairCells.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, pairDigits)
        }
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }

        return TutorHint(
            technique = TutorTechnique.HIDDEN_PAIR,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this ${kind.label}. Both $pairList can only land in the same two cells.",
                    highlights = focus
                ),
                TutorStep(
                    narration = "Since these two cells must hold $pairList (in some order), no other digit can go in either of them.",
                    highlights = focus + pairTargetHLs
                ),
                TutorStep(
                    narration = "The other candidates in those cells can be eliminated — only $pairList remains.",
                    highlights = pairTargetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to clear those candidates.",
                    highlights = pairTargetHLs + eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Naked triple

    private fun findNakedTriple(cells: List<List<Cell>>): TutorHint? {
        for ((kind, unit) in allUnits()) {
            val empties = unit.filter { cells[it.row][it.col].value == null }
            // Eligible cells: user pencil marks of size 2 or 3 matching engine
            // candidates exactly. Engine-validation prevents wrong tips from
            // under-pencilling; user-mark gating prevents spoilers.
            val eligible = empties.filter { pos ->
                val notes = cells[pos.row][pos.col].notes
                (notes.size == 2 || notes.size == 3) && notes == candidates(pos.row, pos.col, cells)
            }
            for (i in eligible.indices) {
                for (j in (i + 1) until eligible.size) {
                    for (k in (j + 1) until eligible.size) {
                        val a = eligible[i]; val b = eligible[j]; val c = eligible[k]
                        val union = cells[a.row][a.col].notes +
                            cells[b.row][b.col].notes +
                            cells[c.row][c.col].notes
                        if (union.size != 3) continue
                        val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                        for (other in empties) {
                            if (other == a || other == b || other == c) continue
                            val intersect = cells[other.row][other.col].notes.intersect(union)
                            if (intersect.isNotEmpty()) eliminations.add(other to intersect)
                        }
                        if (eliminations.isEmpty()) continue
                        return buildNakedTriple(unit, kind, listOf(a, b, c), union, eliminations)
                    }
                }
            }
        }
        return null
    }

    private fun buildNakedTriple(
        unit: List<CellPos>,
        kind: UnitKind,
        triple: List<CellPos>,
        tripleDigits: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val digitList = tripleDigits.sorted().joinToString(", ")
        val kindLabel = when (kind) { is UnitKind.Row -> "row"; is UnitKind.Column -> "column"; is UnitKind.Box -> "3×3 box" }
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val tripleHLs = triple.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, tripleDigits)
        }
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }
        return TutorHint(
            technique = TutorTechnique.NAKED_TRIPLE,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this $kindLabel. These three cells together can only hold $digitList.",
                    highlights = focus + tripleHLs
                ),
                TutorStep(
                    narration = "Together they must take $digitList in some order — so those digits can be ruled out everywhere else in this $kindLabel.",
                    highlights = focus + tripleHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to erase those candidates from these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Hidden triple

    private fun findHiddenTriple(cells: List<List<Cell>>): TutorHint? {
        for ((kind, unit) in allUnits()) {
            val unitValues = unit.mapNotNull { cells[it.row][it.col].value }.toSet()
            val missing = ((1..9).toSet() - unitValues).sorted()
            if (missing.size < 3) continue

            val digitCells = mutableMapOf<Int, Set<CellPos>>()
            for (d in missing) {
                val candCells = unit.filter {
                    cells[it.row][it.col].value == null
                        && candidates(it.row, it.col, cells).contains(d)
                }
                if (candCells.size == 2 || candCells.size == 3) {
                    digitCells[d] = candCells.toSet()
                }
            }
            val eligible = digitCells.keys.sorted()
            if (eligible.size < 3) continue

            for (i in eligible.indices) {
                for (j in (i + 1) until eligible.size) {
                    for (k in (j + 1) until eligible.size) {
                        val a = eligible[i]; val b = eligible[j]; val c = eligible[k]
                        val union = digitCells[a]!! + digitCells[b]!! + digitCells[c]!!
                        if (union.size != 3) continue

                        // Validation: user has pencilled each of a, b, c
                        // exactly where the engine sees them — no spoilers.
                        val triplet = setOf(a, b, c)
                        val valid = triplet.all { d ->
                            val userCells = unit.filter { cells[it.row][it.col].notes.contains(d) }.toSet()
                            userCells == digitCells[d]!!
                        }
                        if (!valid) continue

                        val tripleDigits = setOf(a, b, c)
                        val tripleCells = union.sortedWith(compareBy({ it.row }, { it.col }))
                        val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                        for (pos in tripleCells) {
                            val extras = cells[pos.row][pos.col].notes - tripleDigits
                            if (extras.isNotEmpty()) eliminations.add(pos to extras)
                        }
                        if (eliminations.isEmpty()) continue

                        return buildHiddenTriple(unit, kind, tripleCells, tripleDigits, eliminations)
                    }
                }
            }
        }
        return null
    }

    private fun buildHiddenTriple(
        unit: List<CellPos>,
        kind: UnitKind,
        tripleCells: List<CellPos>,
        tripleDigits: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val digitList = tripleDigits.sorted().joinToString(", ")
        val kindLabel = when (kind) { is UnitKind.Row -> "row"; is UnitKind.Column -> "column"; is UnitKind.Box -> "3×3 box" }
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val targetHLs = tripleCells.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, tripleDigits)
        }
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }
        return TutorHint(
            technique = TutorTechnique.HIDDEN_TRIPLE,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this $kindLabel. The digits $digitList can only land in the same three cells.",
                    highlights = focus
                ),
                TutorStep(
                    narration = "Since these three cells must hold $digitList in some order, no other digit can go in any of them.",
                    highlights = focus + targetHLs
                ),
                TutorStep(
                    narration = "The other candidates in those cells can be eliminated — only $digitList remains.",
                    highlights = targetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to clear those candidates.",
                    highlights = targetHLs + eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region X-Wing / Swordfish (shared orientation)

    private enum class WingOrientation { ROWS, COLUMNS }

    private fun findXWing(cells: List<List<Cell>>): TutorHint? {
        for (d in 1..9) {
            xWingFor(d, WingOrientation.ROWS, cells)?.let { return it }
            xWingFor(d, WingOrientation.COLUMNS, cells)?.let { return it }
        }
        return null
    }

    private fun xWingFor(d: Int, orientation: WingOrientation, cells: List<List<Cell>>): TutorHint? {
        val lineCross = mutableMapOf<Int, Set<Int>>()
        for (primary in 0 until 9) {
            val placed = (0 until 9).any { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == d
            }
            if (placed) continue

            val engineCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && candidates(row, col, cells).contains(d)
            }
            val userCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && cells[row][col].notes.contains(d)
            }
            if (engineCross.size == 2 && engineCross.toSet() == userCross.toSet()) {
                lineCross[primary] = engineCross.toSet()
            }
        }

        val lines = lineCross.keys.sorted()
        for (i in lines.indices) {
            for (j in (i + 1) until lines.size) {
                val l1 = lines[i]; val l2 = lines[j]
                if (lineCross[l1] != lineCross[l2]) continue
                val crossArr = lineCross[l1]!!.sorted()
                val (x1, x2) = crossArr[0] to crossArr[1]
                val eliminators = mutableListOf<CellPos>()
                for (primary in 0 until 9) {
                    if (primary == l1 || primary == l2) continue
                    for (cross in listOf(x1, x2)) {
                        val (row, col) = if (orientation == WingOrientation.ROWS) primary to cross else cross to primary
                        if (cells[row][col].value == null && cells[row][col].notes.contains(d)) {
                            eliminators.add(CellPos(row, col))
                        }
                    }
                }
                if (eliminators.isEmpty()) continue
                return buildXWing(orientation, l1 to l2, x1 to x2, d, eliminators)
            }
        }
        return null
    }

    private fun buildXWing(
        orientation: WingOrientation,
        lines: Pair<Int, Int>,
        cross: Pair<Int, Int>,
        digit: Int,
        eliminators: List<CellPos>
    ): TutorHint {
        val lineLabel = if (orientation == WingOrientation.ROWS) "rows" else "columns"
        val crossLabel = if (orientation == WingOrientation.ROWS) "columns" else "rows"
        val cornerCoords: List<CellPos> = if (orientation == WingOrientation.ROWS) {
            listOf(
                CellPos(lines.first, cross.first), CellPos(lines.first, cross.second),
                CellPos(lines.second, cross.first), CellPos(lines.second, cross.second)
            )
        } else {
            listOf(
                CellPos(cross.first, lines.first), CellPos(cross.first, lines.second),
                CellPos(cross.second, lines.first), CellPos(cross.second, lines.second)
            )
        }
        val lineFocus: List<TutorHighlight> = if (orientation == WingOrientation.ROWS) {
            (0 until 9).flatMap { c -> listOf(
                TutorHighlight(lines.first, c, TutorHighlight.Kind.FOCUS),
                TutorHighlight(lines.second, c, TutorHighlight.Kind.FOCUS)
            ) }
        } else {
            (0 until 9).flatMap { r -> listOf(
                TutorHighlight(r, lines.first, TutorHighlight.Kind.FOCUS),
                TutorHighlight(r, lines.second, TutorHighlight.Kind.FOCUS)
            ) }
        }
        val cornerHLs = cornerCoords.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, setOf(digit)) }
        val eliminatorHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }

        return TutorHint(
            technique = TutorTechnique.X_WING,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at these two $lineLabel. The digit $digit can only land in two cells in each — and they share the same two $crossLabel.",
                    highlights = lineFocus + cornerHLs
                ),
                TutorStep(
                    narration = "$digit must take exactly one cell in each ${lineLabel.dropLast(1)} — one per ${crossLabel.dropLast(1)}. So $digit can't appear in those $crossLabel anywhere else.",
                    highlights = cornerHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $digit off these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region XY-Wing

    private fun findXYWing(cells: List<List<Cell>>): TutorHint? {
        // Bivalue cells where user marks match engine candidates exactly.
        data class Bivalue(val pos: CellPos, val notes: Set<Int>)
        val bivalue = mutableListOf<Bivalue>()
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                val cell = cells[r][c]
                if (cell.value != null || cell.notes.size != 2) continue
                val engine = candidates(r, c, cells)
                if (cell.notes != engine) continue
                bivalue.add(Bivalue(CellPos(r, c), cell.notes))
            }
        }

        for (pivot in bivalue) {
            val pivotArr = pivot.notes.sorted()
            val a = pivotArr[0]
            val b = pivotArr[1]
            val pincers = bivalue.filter { it.pos != pivot.pos && sees(it.pos, pivot.pos) }

            for (i in pincers.indices) {
                for (j in (i + 1) until pincers.size) {
                    val p1 = pincers[i]; val p2 = pincers[j]
                    val shared = p1.notes.intersect(p2.notes)
                    if (shared.size != 1) continue
                    val cVal = shared.first()
                    if (pivot.notes.contains(cVal)) continue
                    val p1IsAC = p1.notes.contains(a) && !p1.notes.contains(b)
                    val p1IsBC = !p1.notes.contains(a) && p1.notes.contains(b)
                    val p2IsAC = p2.notes.contains(a) && !p2.notes.contains(b)
                    val p2IsBC = !p2.notes.contains(a) && p2.notes.contains(b)
                    if (!((p1IsAC && p2IsBC) || (p1IsBC && p2IsAC))) continue

                    val eliminators = mutableListOf<CellPos>()
                    for (r in 0 until 9) {
                        for (c in 0 until 9) {
                            val pos = CellPos(r, c)
                            if (pos == pivot.pos || pos == p1.pos || pos == p2.pos) continue
                            if (cells[r][c].value != null) continue
                            if (!cells[r][c].notes.contains(cVal)) continue
                            if (!sees(pos, p1.pos) || !sees(pos, p2.pos)) continue
                            eliminators.add(pos)
                        }
                    }
                    if (eliminators.isEmpty()) continue

                    return buildXYWing(pivot.pos, p1.pos, p2.pos, a, b, cVal, p1IsAC, eliminators)
                }
            }
        }
        return null
    }

    private fun buildXYWing(
        pivot: CellPos, pincer1: CellPos, pincer2: CellPos,
        a: Int, b: Int, c: Int, p1IsAC: Boolean,
        eliminators: List<CellPos>
    ): TutorHint {
        val (acPincer, bcPincer) = if (p1IsAC) pincer1 to pincer2 else pincer2 to pincer1
        val pivotHL = TutorHighlight(pivot.row, pivot.col, TutorHighlight.Kind.TARGET, setOf(a, b))
        val acPincerHL = TutorHighlight(acPincer.row, acPincer.col, TutorHighlight.Kind.TARGET, setOf(a, c))
        val bcPincerHL = TutorHighlight(bcPincer.row, bcPincer.col, TutorHighlight.Kind.TARGET, setOf(b, c))
        val eliminatorHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(c)) }

        return TutorHint(
            technique = TutorTechnique.XY_WING,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(c)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this 'pivot' cell — it can only be $a or $b.",
                    highlights = listOf(pivotHL)
                ),
                TutorStep(
                    narration = "These two neighbors both see the pivot. One has candidates $a and $c; the other has $b and $c.",
                    highlights = listOf(pivotHL, acPincerHL, bcPincerHL)
                ),
                TutorStep(
                    narration = "If the pivot is $a, the first neighbor must be $c. If it's $b, the other neighbor must be $c. Either way, one of them is $c — so any cell that sees both can't be $c.",
                    highlights = listOf(pivotHL, acPincerHL, bcPincerHL) + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $c off these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    /** Two cells "see" each other if they share a row, column, or 3×3 box
     * (and aren't the same cell). */
    private fun sees(a: CellPos, b: CellPos): Boolean {
        if (a == b) return false
        if (a.row == b.row || a.col == b.col) return true
        return (a.row / 3 == b.row / 3) && (a.col / 3 == b.col / 3)
    }

    // endregion

    // region XYZ-Wing
    //
    // Pivot is trivalue {a,b,c}; pincers are bivalue {a,c} and {b,c}, both
    // seeing the pivot. Common digit `c` can be eliminated from cells that
    // see the pivot AND both pincers (narrower than XY-Wing — pivot also
    // contains c). Mirrors Tutor.swift findXYZWing.
    private fun findXYZWing(cells: List<List<Cell>>): TutorHint? {
        data class Cand(val pos: CellPos, val notes: Set<Int>)
        val trivalue = mutableListOf<Cand>()
        val bivalue = mutableListOf<Cand>()
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                val cell = cells[r][c]
                if (cell.value != null) continue
                val engine = candidates(r, c, cells)
                if (cell.notes != engine) continue
                if (cell.notes.size == 3) trivalue += Cand(CellPos(r, c), cell.notes)
                if (cell.notes.size == 2) bivalue += Cand(CellPos(r, c), cell.notes)
            }
        }
        for (pivot in trivalue) {
            val pincers = bivalue.filter { sees(it.pos, pivot.pos) && pivot.notes.containsAll(it.notes) }
            for (i in pincers.indices) {
                for (j in i + 1 until pincers.size) {
                    val p1 = pincers[i]
                    val p2 = pincers[j]
                    val shared = p1.notes.intersect(p2.notes)
                    if (shared.size != 1) continue
                    val c = shared.first()
                    if ((p1.notes + p2.notes) != pivot.notes) continue
                    val eliminators = mutableListOf<CellPos>()
                    for (r in 0 until 9) {
                        for (col in 0 until 9) {
                            val pos = CellPos(r, col)
                            if (pos == pivot.pos || pos == p1.pos || pos == p2.pos) continue
                            if (cells[r][col].value != null) continue
                            if (!cells[r][col].notes.contains(c)) continue
                            if (!sees(pos, pivot.pos) || !sees(pos, p1.pos) || !sees(pos, p2.pos)) continue
                            eliminators += pos
                        }
                    }
                    if (eliminators.isEmpty()) continue
                    return buildXYZWing(pivot.pos, p1.pos, p2.pos, c, eliminators)
                }
            }
        }
        return null
    }

    private fun buildXYZWing(
        pivot: CellPos, p1: CellPos, p2: CellPos, c: Int, eliminators: List<CellPos>
    ): TutorHint {
        val pivotHL = TutorHighlight(pivot.row, pivot.col, TutorHighlight.Kind.TARGET, setOf(c))
        val p1HL = TutorHighlight(p1.row, p1.col, TutorHighlight.Kind.TARGET, setOf(c))
        val p2HL = TutorHighlight(p2.row, p2.col, TutorHighlight.Kind.TARGET, setOf(c))
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(c)) }
        return TutorHint(
            technique = TutorTechnique.XYZ_WING,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(c)) },
            steps = listOf(
                TutorStep(
                    "This trivalue cell is the pivot. The two neighbours each share two of its candidates and both have $c.",
                    listOf(pivotHL, p1HL, p2HL)
                ),
                TutorStep(
                    "Whatever the pivot ends up being, one of these three cells must hold $c. So any cell that sees all three can't be $c.",
                    listOf(pivotHL, p1HL, p2HL) + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $c off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region W-Wing
    //
    // Two bivalue cells with the same {a,b} candidates that don't see
    // each other. Connected by a strong link on `a`: a unit where `a` has
    // exactly two candidate cells, one seeing each bivalue. Eliminate
    // `b` from cells that see both bivalues.
    private fun findWWing(cells: List<List<Cell>>): TutorHint? {
        data class Bi(val pos: CellPos, val notes: Set<Int>)
        val bivalue = mutableListOf<Bi>()
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                val cell = cells[r][c]
                if (cell.value != null || cell.notes.size != 2) continue
                val engine = candidates(r, c, cells)
                if (cell.notes != engine) continue
                bivalue += Bi(CellPos(r, c), cell.notes)
            }
        }
        for (i in bivalue.indices) {
            for (j in i + 1 until bivalue.size) {
                val a = bivalue[i]
                val b = bivalue[j]
                if (a.notes != b.notes) continue
                if (sees(a.pos, b.pos)) continue
                val candArr = a.notes.sorted()
                for (elimDigit in candArr) {
                    val linkDigit = candArr.first { it != elimDigit }
                    val link = findStrongLink(linkDigit, a.pos, b.pos, cells) ?: continue
                    val eliminators = mutableListOf<CellPos>()
                    for (r in 0 until 9) {
                        for (c in 0 until 9) {
                            val pos = CellPos(r, c)
                            if (pos == a.pos || pos == b.pos) continue
                            if (cells[r][c].value != null) continue
                            if (!cells[r][c].notes.contains(elimDigit)) continue
                            if (!sees(pos, a.pos) || !sees(pos, b.pos)) continue
                            eliminators += pos
                        }
                    }
                    if (eliminators.isEmpty()) continue
                    return buildWWing(a.pos, b.pos, elimDigit, linkDigit, link, eliminators)
                }
            }
        }
        return null
    }

    private fun findStrongLink(
        linkDigit: Int, a: CellPos, b: CellPos, cells: List<List<Cell>>
    ): Pair<CellPos, CellPos>? {
        val units = mutableListOf<List<CellPos>>()
        for (r in 0 until 9) units += (0 until 9).map { CellPos(r, it) }
        for (c in 0 until 9) units += (0 until 9).map { CellPos(it, c) }
        for (br in 0 until 3) for (bc in 0 until 3) {
            val box = mutableListOf<CellPos>()
            for (r in (br * 3) until (br * 3 + 3))
                for (c in (bc * 3) until (bc * 3 + 3)) box += CellPos(r, c)
            units += box
        }
        for (unit in units) {
            val candidatesInUnit = unit.filter {
                cells[it.row][it.col].value == null && cells[it.row][it.col].notes.contains(linkDigit)
            }
            if (candidatesInUnit.size != 2) continue
            val l1 = candidatesInUnit[0]
            val l2 = candidatesInUnit[1]
            if (l1 == a || l1 == b || l2 == a || l2 == b) continue
            if (sees(l1, a) && sees(l2, b)) return l1 to l2
            if (sees(l2, a) && sees(l1, b)) return l2 to l1
        }
        return null
    }

    private fun buildWWing(
        biA: CellPos, biB: CellPos,
        elimDigit: Int, linkDigit: Int,
        link: Pair<CellPos, CellPos>,
        eliminators: List<CellPos>
    ): TutorHint {
        val aHL = TutorHighlight(biA.row, biA.col, TutorHighlight.Kind.TARGET, setOf(linkDigit, elimDigit))
        val bHL = TutorHighlight(biB.row, biB.col, TutorHighlight.Kind.TARGET, setOf(linkDigit, elimDigit))
        val l1HL = TutorHighlight(link.first.row, link.first.col, TutorHighlight.Kind.FOCUS, setOf(linkDigit))
        val l2HL = TutorHighlight(link.second.row, link.second.col, TutorHighlight.Kind.FOCUS, setOf(linkDigit))
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(elimDigit)) }
        return TutorHint(
            technique = TutorTechnique.W_WING,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(elimDigit)) },
            steps = listOf(
                TutorStep(
                    "These two cells each have only $linkDigit and $elimDigit as candidates.",
                    listOf(aHL, bHL)
                ),
                TutorStep(
                    "In a unit between them, $linkDigit can only land in two cells — one seeing each. So whichever of those is $linkDigit, the matching bivalue cell must be $elimDigit.",
                    listOf(aHL, bHL, l1HL, l2HL)
                ),
                TutorStep(
                    "Either way, exactly one of the two bivalue cells is $elimDigit. Any cell that sees both can't be $elimDigit.",
                    listOf(aHL, bHL) + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $elimDigit off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region Skyscraper
    //
    // Single-digit pattern. Two rows where d has exactly 2 candidate cells,
    // sharing one column (the "base"). The two unshared cells (the "tops")
    // form a strong-link pair — one of them must be d. Eliminate d from
    // any cell that sees both tops. Symmetric for cols.
    private fun findSkyscraper(cells: List<List<Cell>>): TutorHint? {
        for (digit in 1..9) {
            val rowPairs = mutableListOf<Pair<Int, List<Int>>>()
            for (r in 0 until 9) {
                val cols = (0 until 9).filter { c ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }
                if (cols.size == 2) rowPairs += r to cols
            }
            for (i in rowPairs.indices) {
                for (j in i + 1 until rowPairs.size) {
                    val a = rowPairs[i]
                    val b = rowPairs[j]
                    val shared = a.second.toSet().intersect(b.second.toSet())
                    if (shared.size != 1) continue
                    val baseCol = shared.first()
                    val aTopCol = a.second.first { it != baseCol }
                    val bTopCol = b.second.first { it != baseCol }
                    val top1 = CellPos(a.first, aTopCol)
                    val top2 = CellPos(b.first, bTopCol)
                    val eliminators = mutableListOf<CellPos>()
                    for (r in 0 until 9) for (c in 0 until 9) {
                        val pos = CellPos(r, c)
                        if (pos == top1 || pos == top2) continue
                        if (cells[r][c].value != null) continue
                        if (!cells[r][c].notes.contains(digit)) continue
                        if (!sees(pos, top1) || !sees(pos, top2)) continue
                        eliminators += pos
                    }
                    if (eliminators.isEmpty()) continue
                    return buildSkyscraper(
                        digit,
                        CellPos(a.first, baseCol), CellPos(b.first, baseCol),
                        top1, top2, eliminators, true
                    )
                }
            }
            val colPairs = mutableListOf<Pair<Int, List<Int>>>()
            for (c in 0 until 9) {
                val rows = (0 until 9).filter { r ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }
                if (rows.size == 2) colPairs += c to rows
            }
            for (i in colPairs.indices) {
                for (j in i + 1 until colPairs.size) {
                    val a = colPairs[i]
                    val b = colPairs[j]
                    val shared = a.second.toSet().intersect(b.second.toSet())
                    if (shared.size != 1) continue
                    val baseRow = shared.first()
                    val aTopRow = a.second.first { it != baseRow }
                    val bTopRow = b.second.first { it != baseRow }
                    val top1 = CellPos(aTopRow, a.first)
                    val top2 = CellPos(bTopRow, b.first)
                    val eliminators = mutableListOf<CellPos>()
                    for (r in 0 until 9) for (c in 0 until 9) {
                        val pos = CellPos(r, c)
                        if (pos == top1 || pos == top2) continue
                        if (cells[r][c].value != null) continue
                        if (!cells[r][c].notes.contains(digit)) continue
                        if (!sees(pos, top1) || !sees(pos, top2)) continue
                        eliminators += pos
                    }
                    if (eliminators.isEmpty()) continue
                    return buildSkyscraper(
                        digit,
                        CellPos(baseRow, a.first), CellPos(baseRow, b.first),
                        top1, top2, eliminators, false
                    )
                }
            }
        }
        return null
    }

    private fun buildSkyscraper(
        digit: Int,
        base1: CellPos, base2: CellPos,
        top1: CellPos, top2: CellPos,
        eliminators: List<CellPos>,
        rowForm: Boolean
    ): TutorHint {
        val lineLabel = if (rowForm) "row" else "column"
        val baseLabel = if (rowForm) "column" else "row"
        val base1HL = TutorHighlight(base1.row, base1.col, TutorHighlight.Kind.FOCUS, setOf(digit))
        val base2HL = TutorHighlight(base2.row, base2.col, TutorHighlight.Kind.FOCUS, setOf(digit))
        val top1HL = TutorHighlight(top1.row, top1.col, TutorHighlight.Kind.TARGET, setOf(digit))
        val top2HL = TutorHighlight(top2.row, top2.col, TutorHighlight.Kind.TARGET, setOf(digit))
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }
        return TutorHint(
            technique = TutorTechnique.SKYSCRAPER,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    "In two ${lineLabel}s, $digit can only go in two cells each, sharing one $baseLabel (the 'base').",
                    listOf(base1HL, base2HL, top1HL, top2HL)
                ),
                TutorStep(
                    "Whichever of the two base cells is $digit, the other $lineLabel's 'top' must be $digit. So one of the two tops is $digit — any cell seeing both can't be.",
                    listOf(top1HL, top2HL) + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $digit off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region Empty Rectangle
    //
    // In a box, candidates for d lie in a single row or column ("the pivot
    // line"). Combined with a strong link on d in another column (or row),
    // we get an elimination at the intersection. Mirrors findEmptyRectangle
    // on iOS — see that for the construction reasoning.
    private fun findEmptyRectangle(cells: List<List<Cell>>): TutorHint? {
        for (digit in 1..9) {
            for (br in 0 until 3) for (bc in 0 until 3) {
                val boxCandidates = mutableListOf<CellPos>()
                for (r in (br * 3) until (br * 3 + 3))
                    for (c in (bc * 3) until (bc * 3 + 3))
                        if (cells[r][c].value == null && cells[r][c].notes.contains(digit))
                            boxCandidates += CellPos(r, c)
                if (boxCandidates.size < 2) continue
                for (pivotRow in (br * 3) until (br * 3 + 3)) {
                    val inPivotRow = boxCandidates.filter { it.row == pivotRow }
                    val outsidePivotRow = boxCandidates.filter { it.row != pivotRow }
                    if (inPivotRow.isEmpty() || outsidePivotRow.isEmpty()) continue
                    val outsideCols = outsidePivotRow.map { it.col }.toSet()
                    if (outsideCols.size != 1) continue
                    val pivotColInBox = outsideCols.first()
                    for (extCol in 0 until 9) {
                        if (extCol in (bc * 3) until (bc * 3 + 3)) continue
                        val colCandidates = (0 until 9).filter { r ->
                            cells[r][extCol].value == null && cells[r][extCol].notes.contains(digit)
                        }
                        if (colCandidates.size != 2) continue
                        if (!colCandidates.contains(pivotRow)) continue
                        val otherRow = colCandidates.first { it != pivotRow }
                        val elimPos = CellPos(otherRow, pivotColInBox)
                        if (elimPos.row in (br * 3) until (br * 3 + 3)) continue
                        if (cells[elimPos.row][elimPos.col].value != null) continue
                        if (!cells[elimPos.row][elimPos.col].notes.contains(digit)) continue
                        return buildEmptyRectangle(
                            digit, br, bc, pivotRow, pivotColInBox,
                            extCol, otherRow, elimPos
                        )
                    }
                }
            }
        }
        return null
    }

    private fun buildEmptyRectangle(
        digit: Int,
        boxRow: Int, boxCol: Int,
        pivotRow: Int, pivotCol: Int,
        strongLinkCol: Int, strongLinkOtherRow: Int,
        eliminator: CellPos
    ): TutorHint {
        val boxHLs = mutableListOf<TutorHighlight>()
        for (r in (boxRow * 3) until (boxRow * 3 + 3))
            for (c in (boxCol * 3) until (boxCol * 3 + 3))
                boxHLs += TutorHighlight(r, c, TutorHighlight.Kind.FOCUS, setOf(digit))
        val pivotHL = TutorHighlight(pivotRow, pivotCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val l1HL = TutorHighlight(pivotRow, strongLinkCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val l2HL = TutorHighlight(strongLinkOtherRow, strongLinkCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val elimHL = TutorHighlight(eliminator.row, eliminator.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit))
        return TutorHint(
            technique = TutorTechnique.EMPTY_RECTANGLE,
            placement = null,
            eliminations = listOf(TutorHint.Elimination(eliminator.row, eliminator.col, setOf(digit))),
            steps = listOf(
                TutorStep(
                    "In this 3×3 box, $digit is restricted such that it must land in the highlighted row or column inside the box.",
                    boxHLs + pivotHL
                ),
                TutorStep(
                    "In another column, $digit has only two candidate cells — one on the same row as the pivot. So one end of the link is $digit, forcing a placement either at the box's pivot or at the link's far cell.",
                    listOf(pivotHL, l1HL, l2HL)
                ),
                TutorStep(
                    "Whichever way it resolves, the marked cell can't be $digit — it'd violate the chain.",
                    listOf(pivotHL, l1HL, l2HL, elimHL)
                ),
                TutorStep(
                    "Tap Got it to cross $digit off this cell.",
                    listOf(elimHL)
                )
            )
        )
    }
    // endregion

    // region 2-String Kite
    //
    // Single-digit pattern. d has 2 candidate cells in some row + 2 in
    // some column; one row-cell and one col-cell share a box (joint),
    // so the unjoined cells (tips) form a strong-link pair. Mirrors
    // findTwoStringKite on iOS.
    private fun findTwoStringKite(cells: List<List<Cell>>): TutorHint? {
        for (digit in 1..9) {
            val rowPairs = mutableListOf<Pair<Int, List<CellPos>>>()
            for (r in 0 until 9) {
                val cs = (0 until 9).filter { c ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }.map { CellPos(r, it) }
                if (cs.size == 2) rowPairs += r to cs
            }
            val colPairs = mutableListOf<Pair<Int, List<CellPos>>>()
            for (c in 0 until 9) {
                val cs = (0 until 9).filter { r ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }.map { CellPos(it, c) }
                if (cs.size == 2) colPairs += c to cs
            }
            for (rp in rowPairs) {
                for (cp in colPairs) {
                    for (jointR in rp.second) {
                        for (jointC in cp.second) {
                            if (jointR == jointC) continue
                            if (jointR.row / 3 != jointC.row / 3) continue
                            if (jointR.col / 3 != jointC.col / 3) continue
                            val tipR = rp.second.first { it != jointR }
                            val tipC = cp.second.first { it != jointC }
                            if (tipR == tipC) continue
                            val eliminators = mutableListOf<CellPos>()
                            for (r in 0 until 9) for (c in 0 until 9) {
                                val pos = CellPos(r, c)
                                if (pos == tipR || pos == tipC || pos == jointR || pos == jointC) continue
                                if (cells[r][c].value != null) continue
                                if (!cells[r][c].notes.contains(digit)) continue
                                if (!sees(pos, tipR) || !sees(pos, tipC)) continue
                                eliminators += pos
                            }
                            if (eliminators.isEmpty()) continue
                            return buildTwoStringKite(digit, jointR, jointC, tipR, tipC, eliminators)
                        }
                    }
                }
            }
        }
        return null
    }

    private fun buildTwoStringKite(
        digit: Int,
        jointR: CellPos, jointC: CellPos,
        tipR: CellPos, tipC: CellPos,
        eliminators: List<CellPos>
    ): TutorHint {
        val jointRHL = TutorHighlight(jointR.row, jointR.col, TutorHighlight.Kind.FOCUS, setOf(digit))
        val jointCHL = TutorHighlight(jointC.row, jointC.col, TutorHighlight.Kind.FOCUS, setOf(digit))
        val tipRHL = TutorHighlight(tipR.row, tipR.col, TutorHighlight.Kind.TARGET, setOf(digit))
        val tipCHL = TutorHighlight(tipC.row, tipC.col, TutorHighlight.Kind.TARGET, setOf(digit))
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }
        return TutorHint(
            technique = TutorTechnique.TWO_STRING_KITE,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    "$digit is restricted to two cells in this row and two cells in this column. The 'joint' cells share a 3×3 box.",
                    listOf(jointRHL, jointCHL, tipRHL, tipCHL)
                ),
                TutorStep(
                    "Whichever joint cell is $digit forces the other to not be — and the other tip must take $digit instead. Either way one of the two tips is $digit, so cells seeing both can't be.",
                    listOf(tipRHL, tipCHL) + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $digit off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region Finned X-Wing
    //
    // X-Wing where one row has the two corners + extra "fin" cells, all
    // confined to the same box as one corner. Eliminations are restricted
    // to the OTHER column AND in the same box as the fin (so they see
    // the entire fin). Mirrors findFinnedXWing on iOS.
    private fun findFinnedXWing(cells: List<List<Cell>>): TutorHint? {
        for (digit in 1..9) {
            val rowCands = mutableListOf<Pair<Int, List<Int>>>()
            for (r in 0 until 9) {
                val cs = (0 until 9).filter { c ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }
                if (cs.size >= 2) rowCands += r to cs
            }
            for (i in rowCands.indices) {
                for (j in rowCands.indices) {
                    if (i == j) continue
                    val clean = rowCands[i]
                    val finned = rowCands[j]
                    if (clean.second.size != 2) continue
                    if (finned.second.size <= 2) continue
                    if (!clean.second.all { it in finned.second }) continue
                    val xCols = clean.second
                    val fin = finned.second.filter { it !in xCols }.map { CellPos(finned.first, it) }
                    if (fin.isEmpty()) continue
                    var finCornerCol = -1
                    for (cornerCol in xCols) {
                        if (fin.all { it.col / 3 == cornerCol / 3 }) {
                            finCornerCol = cornerCol; break
                        }
                    }
                    if (finCornerCol < 0) continue
                    val elimCol = xCols.first { it != finCornerCol }
                    val finBoxRow = finned.first / 3
                    val eliminators = mutableListOf<CellPos>()
                    for (r in (finBoxRow * 3) until (finBoxRow * 3 + 3)) {
                        if (r == clean.first || r == finned.first) continue
                        if (cells[r][elimCol].value != null) continue
                        if (!cells[r][elimCol].notes.contains(digit)) continue
                        eliminators += CellPos(r, elimCol)
                    }
                    if (eliminators.isEmpty()) continue
                    return buildFinnedXWing(
                        digit, clean.first, finned.first,
                        finCornerCol, elimCol, fin, eliminators
                    )
                }
            }
        }
        return null
    }

    private fun buildFinnedXWing(
        digit: Int,
        cleanRow: Int, finnedRow: Int,
        finCol: Int, elimCol: Int,
        fin: List<CellPos>,
        eliminators: List<CellPos>
    ): TutorHint {
        val cleanFinHL = TutorHighlight(cleanRow, finCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val cleanElimHL = TutorHighlight(cleanRow, elimCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val finnedFinHL = TutorHighlight(finnedRow, finCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val finnedElimHL = TutorHighlight(finnedRow, elimCol, TutorHighlight.Kind.TARGET, setOf(digit))
        val finHLs = fin.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS, setOf(digit)) }
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }
        return TutorHint(
            technique = TutorTechnique.FINNED_X_WING,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    "Almost an X-Wing on $digit — but one row has extra candidate cells (the 'fin'), all in the same box as one corner.",
                    listOf(cleanFinHL, cleanElimHL, finnedFinHL, finnedElimHL) + finHLs
                ),
                TutorStep(
                    "Either the X-Wing fires (eliminating $digit from the other column elsewhere), or the fin holds $digit. Either way, cells in the other column that share the fin's box can't be $digit.",
                    listOf(finnedFinHL, finnedElimHL) + finHLs + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $digit off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region Finned Swordfish
    //
    // Swordfish where one row has the three corners + fin cells confined
    // to one box. Mirrors findFinnedSwordfish on iOS.
    private fun findFinnedSwordfish(cells: List<List<Cell>>): TutorHint? {
        for (digit in 1..9) {
            val rowCands = mutableListOf<Pair<Int, List<Int>>>()
            for (r in 0 until 9) {
                val cs = (0 until 9).filter { c ->
                    cells[r][c].value == null && cells[r][c].notes.contains(digit)
                }
                if (cs.size in 2..6) rowCands += r to cs
            }
            for (finnedIdx in rowCands.indices) {
                for (i in rowCands.indices) {
                    if (i == finnedIdx) continue
                    for (j in (i + 1) until rowCands.size) {
                        if (j == finnedIdx) continue
                        val finned = rowCands[finnedIdx]
                        val r1 = rowCands[i]
                        val r2 = rowCands[j]
                        if (r1.second.size > 3 || r2.second.size > 3) continue
                        val cleanCols = (r1.second + r2.second).toSet()
                        if (cleanCols.size != 3) continue
                        if (!cleanCols.all { it in finned.second }) continue
                        val fin = finned.second.filter { it !in cleanCols }.map { CellPos(finned.first, it) }
                        if (fin.isEmpty()) continue
                        val finBoxCols = fin.map { it.col / 3 }.toSet()
                        if (finBoxCols.size != 1) continue
                        val finBoxCol = finBoxCols.first()
                        val finCornerCol = cleanCols.firstOrNull { it / 3 == finBoxCol } ?: continue
                        val elimCols = cleanCols.filter { it != finCornerCol }
                        val finBoxRow = finned.first / 3
                        val swordfishRows = setOf(finned.first, r1.first, r2.first)
                        val eliminators = mutableListOf<CellPos>()
                        for (elimCol in elimCols) {
                            for (r in (finBoxRow * 3) until (finBoxRow * 3 + 3)) {
                                if (r in swordfishRows) continue
                                if (cells[r][elimCol].value != null) continue
                                if (!cells[r][elimCol].notes.contains(digit)) continue
                                eliminators += CellPos(r, elimCol)
                            }
                        }
                        if (eliminators.isEmpty()) continue
                        return buildFinnedSwordfish(
                            digit,
                            listOf(r1.first, r2.first, finned.first),
                            cleanCols.sorted(),
                            fin, eliminators
                        )
                    }
                }
            }
        }
        return null
    }

    private fun buildFinnedSwordfish(
        digit: Int,
        rows: List<Int>,
        cols: List<Int>,
        fin: List<CellPos>,
        eliminators: List<CellPos>
    ): TutorHint {
        val cornerHLs = mutableListOf<TutorHighlight>()
        for (r in rows) for (c in cols) {
            cornerHLs += TutorHighlight(r, c, TutorHighlight.Kind.TARGET, setOf(digit))
        }
        val finHLs = fin.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS, setOf(digit)) }
        val elimHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }
        return TutorHint(
            technique = TutorTechnique.FINNED_SWORDFISH,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    "Almost a Swordfish on $digit across three rows — but one row has extra candidate cells (the 'fin'), confined to one box.",
                    cornerHLs + finHLs
                ),
                TutorStep(
                    "Either the Swordfish fires, eliminating $digit from the three columns elsewhere, or the fin takes $digit. Either way, cells that share the fin's box and sit in the unfinned columns can't be $digit.",
                    cornerHLs + finHLs + elimHLs
                ),
                TutorStep(
                    "Tap Got it to cross $digit off these cells.",
                    elimHLs
                )
            )
        )
    }
    // endregion

    // region Swordfish

    private fun findSwordfish(cells: List<List<Cell>>): TutorHint? {
        for (d in 1..9) {
            swordfishFor(d, WingOrientation.ROWS, cells)?.let { return it }
            swordfishFor(d, WingOrientation.COLUMNS, cells)?.let { return it }
        }
        return null
    }

    private fun swordfishFor(d: Int, orientation: WingOrientation, cells: List<List<Cell>>): TutorHint? {
        val lineCross = mutableMapOf<Int, Set<Int>>()
        for (primary in 0 until 9) {
            val placed = (0 until 9).any { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == d
            }
            if (placed) continue

            val engineCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && candidates(row, col, cells).contains(d)
            }
            val userCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && cells[row][col].notes.contains(d)
            }
            if ((engineCross.size == 2 || engineCross.size == 3)
                && engineCross.toSet() == userCross.toSet()
            ) {
                lineCross[primary] = engineCross.toSet()
            }
        }

        val lines = lineCross.keys.sorted()
        if (lines.size < 3) return null
        for (i in 0 until lines.size - 2) {
            for (j in (i + 1) until lines.size - 1) {
                for (k in (j + 1) until lines.size) {
                    val l1 = lines[i]; val l2 = lines[j]; val l3 = lines[k]
                    val union = lineCross[l1]!! + lineCross[l2]!! + lineCross[l3]!!
                    if (union.size != 3) continue
                    val crossArr = union.sorted()

                    val eliminators = mutableListOf<CellPos>()
                    for (primary in 0 until 9) {
                        if (primary == l1 || primary == l2 || primary == l3) continue
                        for (cross in crossArr) {
                            val (row, col) = if (orientation == WingOrientation.ROWS) primary to cross else cross to primary
                            if (cells[row][col].value == null && cells[row][col].notes.contains(d)) {
                                eliminators.add(CellPos(row, col))
                            }
                        }
                    }
                    if (eliminators.isEmpty()) continue

                    val candidateCells = mutableListOf<CellPos>()
                    for (l in listOf(l1, l2, l3)) {
                        for (c in lineCross[l]!!) {
                            candidateCells.add(if (orientation == WingOrientation.ROWS) CellPos(l, c) else CellPos(c, l))
                        }
                    }
                    return buildSwordfish(orientation, Triple(l1, l2, l3), Triple(crossArr[0], crossArr[1], crossArr[2]), d, candidateCells, eliminators)
                }
            }
        }
        return null
    }

    private fun buildSwordfish(
        orientation: WingOrientation,
        lines: Triple<Int, Int, Int>,
        cross: Triple<Int, Int, Int>,
        digit: Int,
        candidateCells: List<CellPos>,
        eliminators: List<CellPos>
    ): TutorHint {
        val lineLabel = if (orientation == WingOrientation.ROWS) "rows" else "columns"
        val crossLabel = if (orientation == WingOrientation.ROWS) "columns" else "rows"

        val lineList = listOf(lines.first, lines.second, lines.third)
        val crossList = listOf(cross.first, cross.second, cross.third)
        val intersections: List<CellPos> = lineList.flatMap { l ->
            crossList.map { c -> if (orientation == WingOrientation.ROWS) CellPos(l, c) else CellPos(c, l) }
        }

        val lineFocus = intersections.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val candidateHLs = candidateCells.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, setOf(digit)) }
        val eliminatorHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }

        return TutorHint(
            technique = TutorTechnique.SWORDFISH,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at these three $lineLabel. The digit $digit can only land in the same three $crossLabel across all of them.",
                    highlights = lineFocus + candidateHLs
                ),
                TutorStep(
                    narration = "$digit must take one cell in each ${lineLabel.dropLast(1)} — and within those three $crossLabel. So $digit can't appear in those $crossLabel anywhere else.",
                    highlights = candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $digit off these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Naked quad

    private fun findNakedQuad(cells: List<List<Cell>>): TutorHint? {
        for ((kind, unit) in allUnits()) {
            val empties = unit.filter { cells[it.row][it.col].value == null }
            val eligible = empties.filter { pos ->
                val notes = cells[pos.row][pos.col].notes
                notes.size in 2..4 && notes == candidates(pos.row, pos.col, cells)
            }
            if (eligible.size < 4) continue

            for (i in eligible.indices) {
                for (j in (i + 1) until eligible.size) {
                    for (k in (j + 1) until eligible.size) {
                        for (l in (k + 1) until eligible.size) {
                            val a = eligible[i]; val b = eligible[j]
                            val c = eligible[k]; val d = eligible[l]
                            val union = cells[a.row][a.col].notes +
                                cells[b.row][b.col].notes +
                                cells[c.row][c.col].notes +
                                cells[d.row][d.col].notes
                            if (union.size != 4) continue
                            val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                            for (other in empties) {
                                if (other == a || other == b || other == c || other == d) continue
                                val intersect = cells[other.row][other.col].notes.intersect(union)
                                if (intersect.isNotEmpty()) eliminations.add(other to intersect)
                            }
                            if (eliminations.isEmpty()) continue
                            return buildNakedQuad(unit, kind, listOf(a, b, c, d), union, eliminations)
                        }
                    }
                }
            }
        }
        return null
    }

    private fun buildNakedQuad(
        unit: List<CellPos>,
        kind: UnitKind,
        quad: List<CellPos>,
        quadDigits: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val digitList = quadDigits.sorted().joinToString(", ")
        val kindLabel = when (kind) { is UnitKind.Row -> "row"; is UnitKind.Column -> "column"; is UnitKind.Box -> "3×3 box" }
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val quadHLs = quad.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, quadDigits)
        }
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }
        return TutorHint(
            technique = TutorTechnique.NAKED_QUAD,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this $kindLabel. These four cells together can only hold $digitList.",
                    highlights = focus + quadHLs
                ),
                TutorStep(
                    narration = "Together they must take $digitList in some order — so those digits can be ruled out everywhere else in this $kindLabel.",
                    highlights = focus + quadHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to erase those candidates from these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Hidden quad

    private fun findHiddenQuad(cells: List<List<Cell>>): TutorHint? {
        for ((kind, unit) in allUnits()) {
            val unitValues = unit.mapNotNull { cells[it.row][it.col].value }.toSet()
            val missing = ((1..9).toSet() - unitValues).sorted()
            if (missing.size < 4) continue

            val digitCells = mutableMapOf<Int, Set<CellPos>>()
            for (d in missing) {
                val candCells = unit.filter {
                    cells[it.row][it.col].value == null
                        && candidates(it.row, it.col, cells).contains(d)
                }
                if (candCells.size in 2..4) {
                    digitCells[d] = candCells.toSet()
                }
            }
            val eligible = digitCells.keys.sorted()
            if (eligible.size < 4) continue

            for (i in eligible.indices) {
                for (j in (i + 1) until eligible.size) {
                    for (k in (j + 1) until eligible.size) {
                        for (l in (k + 1) until eligible.size) {
                            val a = eligible[i]; val b = eligible[j]
                            val c = eligible[k]; val d = eligible[l]
                            val union = digitCells[a]!! +
                                digitCells[b]!! +
                                digitCells[c]!! +
                                digitCells[d]!!
                            if (union.size != 4) continue

                            val quadrant = setOf(a, b, c, d)
                            val valid = quadrant.all { dig ->
                                val userCells = unit.filter { cells[it.row][it.col].notes.contains(dig) }.toSet()
                                userCells == digitCells[dig]!!
                            }
                            if (!valid) continue

                            val quadDigits = setOf(a, b, c, d)
                            val quadCells = union.sortedWith(compareBy({ it.row }, { it.col }))
                            val eliminations = mutableListOf<Pair<CellPos, Set<Int>>>()
                            for (pos in quadCells) {
                                val extras = cells[pos.row][pos.col].notes - quadDigits
                                if (extras.isNotEmpty()) eliminations.add(pos to extras)
                            }
                            if (eliminations.isEmpty()) continue

                            return buildHiddenQuad(unit, kind, quadCells, quadDigits, eliminations)
                        }
                    }
                }
            }
        }
        return null
    }

    private fun buildHiddenQuad(
        unit: List<CellPos>,
        kind: UnitKind,
        quadCells: List<CellPos>,
        quadDigits: Set<Int>,
        eliminations: List<Pair<CellPos, Set<Int>>>
    ): TutorHint {
        val digitList = quadDigits.sorted().joinToString(", ")
        val kindLabel = when (kind) { is UnitKind.Row -> "row"; is UnitKind.Column -> "column"; is UnitKind.Box -> "3×3 box" }
        val focus = unit.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val targetHLs = quadCells.map {
            TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, quadDigits)
        }
        val eliminatorHLs = eliminations.map {
            TutorHighlight(it.first.row, it.first.col, TutorHighlight.Kind.ELIMINATOR, it.second)
        }
        return TutorHint(
            technique = TutorTechnique.HIDDEN_QUAD,
            placement = null,
            eliminations = eliminations.map { TutorHint.Elimination(it.first.row, it.first.col, it.second) },
            steps = listOf(
                TutorStep(
                    narration = "Look at this $kindLabel. The digits $digitList can only land in the same four cells.",
                    highlights = focus
                ),
                TutorStep(
                    narration = "Since these four cells must hold $digitList in some order, no other digit can go in any of them.",
                    highlights = focus + targetHLs
                ),
                TutorStep(
                    narration = "The other candidates in those cells can be eliminated — only $digitList remains.",
                    highlights = targetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to clear those candidates.",
                    highlights = targetHLs + eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Jellyfish

    private fun findJellyfish(cells: List<List<Cell>>): TutorHint? {
        for (d in 1..9) {
            jellyfishFor(d, WingOrientation.ROWS, cells)?.let { return it }
            jellyfishFor(d, WingOrientation.COLUMNS, cells)?.let { return it }
        }
        return null
    }

    private fun jellyfishFor(d: Int, orientation: WingOrientation, cells: List<List<Cell>>): TutorHint? {
        val lineCross = mutableMapOf<Int, Set<Int>>()
        for (primary in 0 until 9) {
            val placed = (0 until 9).any { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == d
            }
            if (placed) continue

            val engineCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && candidates(row, col, cells).contains(d)
            }
            val userCross = (0 until 9).filter { other ->
                val (row, col) = if (orientation == WingOrientation.ROWS) primary to other else other to primary
                cells[row][col].value == null && cells[row][col].notes.contains(d)
            }
            if (engineCross.size in 2..4 && engineCross.toSet() == userCross.toSet()) {
                lineCross[primary] = engineCross.toSet()
            }
        }

        val lines = lineCross.keys.sorted()
        if (lines.size < 4) return null
        for (i in 0 until lines.size - 3) {
            for (j in (i + 1) until lines.size - 2) {
                for (k in (j + 1) until lines.size - 1) {
                    for (m in (k + 1) until lines.size) {
                        val l1 = lines[i]; val l2 = lines[j]; val l3 = lines[k]; val l4 = lines[m]
                        val union = lineCross[l1]!! + lineCross[l2]!! + lineCross[l3]!! + lineCross[l4]!!
                        if (union.size != 4) continue
                        val crossArr = union.sorted()

                        val eliminators = mutableListOf<CellPos>()
                        for (primary in 0 until 9) {
                            if (primary == l1 || primary == l2 || primary == l3 || primary == l4) continue
                            for (cross in crossArr) {
                                val (row, col) = if (orientation == WingOrientation.ROWS) primary to cross else cross to primary
                                if (cells[row][col].value == null && cells[row][col].notes.contains(d)) {
                                    eliminators.add(CellPos(row, col))
                                }
                            }
                        }
                        if (eliminators.isEmpty()) continue

                        val candidateCells = mutableListOf<CellPos>()
                        for (l in listOf(l1, l2, l3, l4)) {
                            for (c in lineCross[l]!!) {
                                candidateCells.add(if (orientation == WingOrientation.ROWS) CellPos(l, c) else CellPos(c, l))
                            }
                        }
                        return buildJellyfish(
                            orientation,
                            listOf(l1, l2, l3, l4),
                            crossArr,
                            d,
                            candidateCells,
                            eliminators
                        )
                    }
                }
            }
        }
        return null
    }

    private fun buildJellyfish(
        orientation: WingOrientation,
        lines: List<Int>,
        cross: List<Int>,
        digit: Int,
        candidateCells: List<CellPos>,
        eliminators: List<CellPos>
    ): TutorHint {
        val lineLabel = if (orientation == WingOrientation.ROWS) "rows" else "columns"
        val crossLabel = if (orientation == WingOrientation.ROWS) "columns" else "rows"

        val intersections: List<CellPos> = lines.flatMap { l ->
            cross.map { c -> if (orientation == WingOrientation.ROWS) CellPos(l, c) else CellPos(c, l) }
        }
        val lineFocus = intersections.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.FOCUS) }
        val candidateHLs = candidateCells.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.TARGET, setOf(digit)) }
        val eliminatorHLs = eliminators.map { TutorHighlight(it.row, it.col, TutorHighlight.Kind.ELIMINATOR, setOf(digit)) }

        return TutorHint(
            technique = TutorTechnique.JELLYFISH,
            placement = null,
            eliminations = eliminators.map { TutorHint.Elimination(it.row, it.col, setOf(digit)) },
            steps = listOf(
                TutorStep(
                    narration = "Look at these four $lineLabel. The digit $digit can only land in the same four $crossLabel across all of them.",
                    highlights = lineFocus + candidateHLs
                ),
                TutorStep(
                    narration = "$digit must take one cell in each ${lineLabel.dropLast(1)} — and within those four $crossLabel. So $digit can't appear in those $crossLabel anywhere else.",
                    highlights = candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration = "Tap Got it to cross $digit off these cells.",
                    highlights = eliminatorHLs
                )
            )
        )
    }

    // endregion

    // region Helpers

    private fun allUnits(): List<Pair<UnitKind, List<CellPos>>> {
        val list = mutableListOf<Pair<UnitKind, List<CellPos>>>()
        for (r in 0 until 9) list.add(UnitKind.Row(r) to unitCells(UnitKind.Row(r)))
        for (c in 0 until 9) list.add(UnitKind.Column(c) to unitCells(UnitKind.Column(c)))
        for (br in 0 until 3) {
            for (bc in 0 until 3) {
                list.add(UnitKind.Box(br, bc) to unitCells(UnitKind.Box(br, bc)))
            }
        }
        return list
    }

    private fun unitCells(kind: UnitKind): List<CellPos> = when (kind) {
        is UnitKind.Row -> (0 until 9).map { CellPos(kind.r, it) }
        is UnitKind.Column -> (0 until 9).map { CellPos(it, kind.c) }
        is UnitKind.Box -> {
            val list = mutableListOf<CellPos>()
            for (r in (kind.rowBlock * 3) until (kind.rowBlock * 3 + 3)) {
                for (c in (kind.colBlock * 3) until (kind.colBlock * 3 + 3)) {
                    list.add(CellPos(r, c))
                }
            }
            list
        }
    }

    private fun candidates(row: Int, col: Int, cells: List<List<Cell>>): Set<Int> {
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

    private fun peers(row: Int, col: Int): List<CellPos> {
        val out = mutableListOf<CellPos>()
        for (c in 0 until 9) if (c != col) out.add(CellPos(row, c))
        for (r in 0 until 9) if (r != row) out.add(CellPos(r, col))
        val boxR = (row / 3) * 3
        val boxC = (col / 3) * 3
        for (r in boxR until boxR + 3) {
            for (c in boxC until boxC + 3) {
                if (r != row && c != col) out.add(CellPos(r, c))
            }
        }
        return out
    }

    private fun peerValues(row: Int, col: Int, cells: List<List<Cell>>): Set<Int> {
        val out = mutableSetOf<Int>()
        for (peer in peers(row, col)) {
            cells[peer.row][peer.col].value?.let { out.add(it) }
        }
        return out
    }

    // endregion
}
