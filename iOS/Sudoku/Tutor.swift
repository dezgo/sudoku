//
//  Tutor.swift
//  Sudoku
//

import Foundation

/// In-context tutor: finds the easiest applicable next move and produces a
/// step-by-step narration of how to spot it.
enum TutorTechnique: String, CaseIterable {
    case nakedSingle
    case hiddenSingle
    case nakedPair
    case pointingPair
    case boxLineReduction
    case hiddenPair
    case nakedTriple
    case hiddenTriple
    case xWing
    case xyWing
    case swordfish
    case nakedQuad
    case hiddenQuad
    case jellyfish
    case xyzWing
    case wWing
    case skyscraper
    case emptyRectangle
    case twoStringKite
    case finnedXWing
    case finnedSwordfish
    case uniqueRectangle

    /// Difficulty bands roughly match how a human solver progresses. Used by
    /// the empty-state copy ("we tried up through <hardest tier>") and is
    /// available for puzzle-generator calibration in future ("Hard puzzles
    /// must be solvable using techniques up to tier X").
    enum Tier: String {
        case simple, medium, hard
    }

    var tier: Tier {
        switch self {
        case .nakedSingle, .hiddenSingle:
            return .simple
        case .nakedPair, .pointingPair, .boxLineReduction, .hiddenPair:
            return .medium
        case .nakedTriple, .hiddenTriple, .xWing, .xyWing, .swordfish, .nakedQuad, .hiddenQuad, .jellyfish,
             .xyzWing, .wWing, .skyscraper, .emptyRectangle,
             .twoStringKite, .finnedXWing, .finnedSwordfish, .uniqueRectangle:
            return .hard
        }
    }

    var label: String {
        switch self {
        case .nakedSingle: return "Naked Single"
        case .hiddenSingle: return "Hidden Single"
        case .nakedPair: return "Naked Pair"
        case .pointingPair: return "Pointing Pair"
        case .boxLineReduction: return "Box/Line Reduction"
        case .hiddenPair: return "Hidden Pair"
        case .nakedTriple: return "Naked Triple"
        case .hiddenTriple: return "Hidden Triple"
        case .xWing: return "X-Wing"
        case .xyWing: return "XY-Wing"
        case .swordfish: return "Swordfish"
        case .nakedQuad: return "Naked Quad"
        case .hiddenQuad: return "Hidden Quad"
        case .jellyfish: return "Jellyfish"
        case .xyzWing: return "XYZ-Wing"
        case .wWing: return "W-Wing"
        case .skyscraper: return "Skyscraper"
        case .emptyRectangle: return "Empty Rectangle"
        case .twoStringKite: return "2-String Kite"
        case .finnedXWing: return "Finned X-Wing"
        case .finnedSwordfish: return "Finned Swordfish"
        case .uniqueRectangle: return "Unique Rectangle"
        }
    }
}

/// One cell decorated for the tutor's overlay rendering.
///
/// `candidates` carries digits the tutor wants the cell to display as
/// pencil-style marks while the highlight is on screen — used by elimination
/// techniques (pair / pointing) to show the user "these are the candidates
/// I'm reasoning about." Empty for highlights that only need a background
/// tint (focus, target).
struct TutorHighlight: Hashable {
    enum Kind: Hashable {
        case focus
        case eliminator
        case target
    }
    let row: Int
    let col: Int
    let kind: Kind
    let candidates: Set<Int>

    init(row: Int, col: Int, kind: Kind, candidates: Set<Int> = []) {
        self.row = row
        self.col = col
        self.kind = kind
        self.candidates = candidates
    }
}

struct TutorStep {
    let narration: String
    let highlights: [TutorHighlight]
}

/// A hint either *places* a digit (placement-style: naked single, hidden
/// single) or *eliminates* candidates (naked pair, pointing pair). Both
/// kinds can be applied: placement fills the cell; elimination erases the
/// called-out candidates from the user's pencil marks.
struct TutorHint {
    struct Placement {
        let row: Int
        let col: Int
        let value: Int
    }

    struct Elimination {
        let row: Int
        let col: Int
        let candidates: Set<Int>
    }

    let technique: TutorTechnique
    let placement: Placement?
    let eliminations: [Elimination]
    let steps: [TutorStep]
}

enum TutorEngine {
    /// Easiest applicable hint, or nil if no implemented technique fits.
    /// Order matches escalating difficulty: try the simplest first.
    static func findHint(cells: [[Cell]]) -> TutorHint? {
        if let h = findNakedSingle(cells: cells) { return h }
        if let h = findHiddenSingle(cells: cells) { return h }
        if let h = findNakedPair(cells: cells) { return h }
        if let h = findPointingPair(cells: cells) { return h }
        if let h = findBoxLineReduction(cells: cells) { return h }
        if let h = findHiddenPair(cells: cells) { return h }
        if let h = findNakedTriple(cells: cells) { return h }
        if let h = findHiddenTriple(cells: cells) { return h }
        if let h = findXWing(cells: cells) { return h }
        if let h = findXYWing(cells: cells) { return h }
        if let h = findSwordfish(cells: cells) { return h }
        if let h = findNakedQuad(cells: cells) { return h }
        if let h = findHiddenQuad(cells: cells) { return h }
        if let h = findJellyfish(cells: cells) { return h }
        if let h = findXYZWing(cells: cells) { return h }
        if let h = findWWing(cells: cells) { return h }
        if let h = findSkyscraper(cells: cells) { return h }
        if let h = findTwoStringKite(cells: cells) { return h }
        if let h = findEmptyRectangle(cells: cells) { return h }
        if let h = findFinnedXWing(cells: cells) { return h }
        if let h = findFinnedSwordfish(cells: cells) { return h }
        if let h = findUniqueRectangle(cells: cells) { return h }
        return nil
    }

    /// Solve the puzzle by repeatedly applying engine hints, returning the
    /// hardest tier required. nil if the engine can't fully solve via the
    /// implemented techniques (some puzzles need chain reasoning or guess +
    /// backtrack — those are beyond what we want to ship anyway). Used by
    /// the puzzle generator to calibrate Easy / Medium / Hard against the
    /// techniques actually required, rather than just clue count.
    static func classify(cells startCells: [[Cell]]) -> TutorTechnique.Tier? {
        var cells = autoPencil(startCells)
        var maxTier: TutorTechnique.Tier = .simple
        // Safety cap: an 81-cell puzzle finishes in well under 200 hint
        // applications. Cap protects against pathological loops in misbuilt
        // tests / future technique additions.
        for _ in 0..<400 {
            if isSolved(cells) { return maxTier }
            guard let hint = findHint(cells: cells) else { return nil }
            maxTier = harder(maxTier, hint.technique.tier)
            apply(hint: hint, to: &cells)
        }
        return nil
    }

    private static func isSolved(_ cells: [[Cell]]) -> Bool {
        for r in 0..<9 {
            for c in 0..<9 where cells[r][c].value == nil { return false }
        }
        return true
    }

    private static func harder(_ a: TutorTechnique.Tier, _ b: TutorTechnique.Tier) -> TutorTechnique.Tier {
        switch (a, b) {
        case (_, .hard), (.hard, _): return .hard
        case (_, .medium), (.medium, _): return .medium
        default: return .simple
        }
    }

    private static func apply(hint: TutorHint, to cells: inout [[Cell]]) {
        if let p = hint.placement {
            cells[p.row][p.col].value = p.value
            cells[p.row][p.col].notes = []
            // Auto-clear placed value from peer notes so the next findHint
            // sees a consistent board (matches what the user UI does).
            for c in 0..<9 where c != p.col { cells[p.row][c].notes.remove(p.value) }
            for r in 0..<9 where r != p.row { cells[r][p.col].notes.remove(p.value) }
            let boxR = (p.row / 3) * 3
            let boxC = (p.col / 3) * 3
            for r in boxR..<boxR + 3 {
                for c in boxC..<boxC + 3 where !(r == p.row && c == p.col) {
                    cells[r][c].notes.remove(p.value)
                }
            }
        } else {
            for elim in hint.eliminations {
                cells[elim.row][elim.col].notes.subtract(elim.candidates)
            }
        }
    }

    private static func autoPencil(_ cells: [[Cell]]) -> [[Cell]] {
        var result = cells
        for r in 0..<9 {
            for c in 0..<9 where result[r][c].value == nil {
                result[r][c].notes = candidates(row: r, col: c, cells: result)
            }
        }
        return result
    }

    // MARK: - Naked single

    static func findNakedSingle(cells: [[Cell]]) -> TutorHint? {
        for r in 0..<9 {
            for c in 0..<9 {
                guard cells[r][c].value == nil else { continue }
                let cands = candidates(row: r, col: c, cells: cells)
                if cands.count == 1, let v = cands.first {
                    return buildNakedSingle(row: r, col: c, value: v, cells: cells)
                }
            }
        }
        return nil
    }

    private static func buildNakedSingle(row: Int, col: Int, value: Int, cells: [[Cell]]) -> TutorHint {
        let used = peerValues(row: row, col: col, cells: cells).sorted()
        let usedList = used.map(String.init).joined(separator: ", ")
        let target = TutorHighlight(row: row, col: col, kind: .target)

        var eliminators: [TutorHighlight] = []
        for peer in peers(row: row, col: col) where cells[peer.row][peer.col].value != nil {
            eliminators.append(TutorHighlight(row: peer.row, col: peer.col, kind: .eliminator))
        }

        return TutorHint(
            technique: .nakedSingle,
            placement: .init(row: row, col: col, value: value),
            eliminations: [],
            steps: [
                TutorStep(
                    narration: "Take a look at this empty cell. We're going to figure out what number can go here.",
                    highlights: [target]
                ),
                TutorStep(
                    narration: "Its row, column, and 3×3 box already use \(usedList). Each of those is ruled out for this cell.",
                    highlights: [target] + eliminators
                ),
                TutorStep(
                    narration: "That leaves only \(value). It must go in this cell.",
                    highlights: [target]
                )
            ]
        )
    }

    // MARK: - Hidden single

    private enum UnitKind {
        case row(Int)
        case column(Int)
        case box(rowBlock: Int, colBlock: Int)

        var label: String {
            switch self {
            case .row: return "row"
            case .column: return "column"
            case .box: return "3×3 box"
            }
        }
    }

    static func findHiddenSingle(cells: [[Cell]]) -> TutorHint? {
        for r in 0..<9 {
            if let h = hiddenSingleInUnit(unitCells(.row(r)), kind: .row(r), cells: cells) { return h }
        }
        for c in 0..<9 {
            if let h = hiddenSingleInUnit(unitCells(.column(c)), kind: .column(c), cells: cells) { return h }
        }
        for br in 0..<3 {
            for bc in 0..<3 {
                let kind = UnitKind.box(rowBlock: br, colBlock: bc)
                if let h = hiddenSingleInUnit(unitCells(kind), kind: kind, cells: cells) { return h }
            }
        }
        return nil
    }

    private static func hiddenSingleInUnit(_ unit: [(row: Int, col: Int)], kind: UnitKind, cells: [[Cell]]) -> TutorHint? {
        let unitValues = Set(unit.compactMap { cells[$0.row][$0.col].value })
        let missing = Set(1...9).subtracting(unitValues)

        for v in missing.sorted() {
            let candidates = unit.filter { pos in
                cells[pos.row][pos.col].value == nil && self.candidates(row: pos.row, col: pos.col, cells: cells).contains(v)
            }
            guard candidates.count == 1, let target = candidates.first else { continue }

            var eliminators: [TutorHighlight] = []
            for cell in unit where cells[cell.row][cell.col].value == nil && cell != target {
                for peer in peers(row: cell.row, col: cell.col)
                    where !contains(unit: unit, peer) && cells[peer.row][peer.col].value == v
                {
                    eliminators.append(TutorHighlight(row: peer.row, col: peer.col, kind: .eliminator))
                }
            }
            eliminators = Array(Set(eliminators))

            let focusHighlights = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
            let targetHL = TutorHighlight(row: target.row, col: target.col, kind: .target)

            return TutorHint(
                technique: .hiddenSingle,
                placement: .init(row: target.row, col: target.col, value: v),
                eliminations: [],
                steps: [
                    TutorStep(
                        narration: "Look at this \(kind.label). It's missing the digit \(v).",
                        highlights: focusHighlights
                    ),
                    TutorStep(
                        narration: "\(v) already appears in the rows, columns, or boxes of every other empty cell in this \(kind.label) — so \(v) can't go in any of them.",
                        highlights: focusHighlights + eliminators
                    ),
                    TutorStep(
                        narration: "Only this cell is left. \(v) must go here.",
                        highlights: focusHighlights + [targetHL]
                    )
                ]
            )
        }
        return nil
    }

    // MARK: - Naked pair
    //
    // Two empty cells in a unit each have exactly the same two candidates
    // {a, b}. They must take a and b in some order, so a and b are
    // eliminated as candidates from every other cell of the unit.

    static func findNakedPair(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let empties = unit.filter { cells[$0.row][$0.col].value == nil }
            // Naked pair is a pencil-mark technique: it fires when the user
            // has pencilled exactly two candidates in the cell, and those
            // marks are a valid subset of the engine's view (no invented
            // digits). We trust the user's restrictions — earlier tutor or
            // manual eliminations may have narrowed notes below the engine
            // baseline, and rejecting those would block subsequent
            // techniques that depend on them.
            let pairCandidates = empties.filter { pos in
                let userMarks = cells[pos.row][pos.col].notes
                guard userMarks.count == 2 else { return false }
                return userMarks.isSubset(of: candidates(row: pos.row, col: pos.col, cells: cells))
            }
            for i in 0..<pairCandidates.count {
                let a = pairCandidates[i]
                let aMarks = cells[a.row][a.col].notes
                for j in (i + 1)..<pairCandidates.count {
                    let b = pairCandidates[j]
                    let bMarks = cells[b.row][b.col].notes
                    guard aMarks == bMarks else { continue }
                    let pairCands = aMarks
                    var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                    for other in empties {
                        if other == a || other == b { continue }
                        let intersect = cells[other.row][other.col].notes.intersection(pairCands)
                        if !intersect.isEmpty {
                            eliminations.append((other, intersect))
                        }
                    }
                    guard !eliminations.isEmpty else { continue }
                    return buildNakedPair(unit: unit, kind: kind, pair: (a, b), pairCands: pairCands, eliminations: eliminations)
                }
            }
        }
        return nil
    }

    private static func buildNakedPair(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        pair: ((row: Int, col: Int), (row: Int, col: Int)),
        pairCands: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let pairList = pairCands.sorted().map(String.init).joined(separator: " and ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let pairHLs = [
            TutorHighlight(row: pair.0.row, col: pair.0.col, kind: .target, candidates: pairCands),
            TutorHighlight(row: pair.1.row, col: pair.1.col, kind: .target, candidates: pairCands)
        ]
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .nakedPair,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). These two cells can each only hold \(pairList).",
                    highlights: focus + pairHLs
                ),
                TutorStep(
                    narration: "Together they must take \(pairList) in some order — so \(pairList) can be ruled out everywhere else in this \(kind.label).",
                    highlights: focus + pairHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to erase those candidates from these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Pointing pair
    //
    // Within a 3×3 box, all empty cells that could hold a digit lie in a
    // single row or column. The digit must therefore appear in that row/col
    // *inside* the box, ruling it out for cells in the same row/col outside
    // the box.

    static func findPointingPair(cells: [[Cell]]) -> TutorHint? {
        for br in 0..<3 {
            for bc in 0..<3 {
                let box = unitCells(.box(rowBlock: br, colBlock: bc))
                let placedInBox = Set(box.compactMap { cells[$0.row][$0.col].value })
                for d in (1...9) where !placedInBox.contains(d) {
                    // Engine view: every empty cell in the box where d could go.
                    let engineCandidates = box.filter {
                        cells[$0.row][$0.col].value == nil
                            && candidates(row: $0.row, col: $0.col, cells: cells).contains(d)
                    }
                    guard engineCandidates.count >= 2 else { continue }
                    // Validation: the user must have pencilled d in every one of
                    // those cells. Otherwise the user hasn't seen the pattern
                    // yet and the technique would be a spoiler / could mislead.
                    let userCovered = engineCandidates.allSatisfy { cells[$0.row][$0.col].notes.contains(d) }
                    guard userCovered else { continue }

                    let rows = Set(engineCandidates.map(\.row))
                    let cols = Set(engineCandidates.map(\.col))
                    if rows.count == 1, let r = rows.first {
                        let eliminators = (0..<9).compactMap { c -> (row: Int, col: Int)? in
                            guard !(c >= bc * 3 && c < bc * 3 + 3) else { return nil }
                            guard cells[r][c].value == nil,
                                  cells[r][c].notes.contains(d)
                            else { return nil }
                            return (r, c)
                        }
                        if !eliminators.isEmpty {
                            return buildPointingPair(box: box, candidateCells: engineCandidates, lineKind: .row(r), digit: d, eliminators: eliminators)
                        }
                    } else if cols.count == 1, let c = cols.first {
                        let eliminators = (0..<9).compactMap { r -> (row: Int, col: Int)? in
                            guard !(r >= br * 3 && r < br * 3 + 3) else { return nil }
                            guard cells[r][c].value == nil,
                                  cells[r][c].notes.contains(d)
                            else { return nil }
                            return (r, c)
                        }
                        if !eliminators.isEmpty {
                            return buildPointingPair(box: box, candidateCells: engineCandidates, lineKind: .column(c), digit: d, eliminators: eliminators)
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func buildPointingPair(
        box: [(row: Int, col: Int)],
        candidateCells: [(row: Int, col: Int)],
        lineKind: UnitKind,
        digit: Int,
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let lineLabel: String
        switch lineKind {
        case .row: lineLabel = "row"
        case .column: lineLabel = "column"
        case .box: lineLabel = "box" // unreachable
        }

        let boxFocus = box.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let candidateHLs = candidateCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [digit])
        }
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit])
        }

        return TutorHint(
            technique: .pointingPair,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit])
            },
            steps: [
                TutorStep(
                    narration: "Look at this 3×3 box — where can the digit \(digit) go inside it?",
                    highlights: boxFocus
                ),
                TutorStep(
                    narration: "Inside the box, \(digit) can only land in this \(lineLabel). It has to be one of these cells.",
                    highlights: boxFocus + candidateHLs
                ),
                TutorStep(
                    narration: "Since \(digit) must take one of those positions, it can't appear anywhere else in this \(lineLabel) outside the box.",
                    highlights: candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off the candidates of these outside cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Box-line reduction
    //
    // Inverse of pointing pair. Within a row or column, all empty cells where
    // a digit could go lie inside a single 3×3 box. The digit must therefore
    // appear in that line *inside* the box, ruling it out for the box's other
    // cells (those not on the line).

    static func findBoxLineReduction(cells: [[Cell]]) -> TutorHint? {
        // Rows first, then columns.
        for r in 0..<9 {
            let line = unitCells(.row(r))
            if let hint = boxLineFromLine(line: line, lineKind: .row(r), cells: cells) {
                return hint
            }
        }
        for c in 0..<9 {
            let line = unitCells(.column(c))
            if let hint = boxLineFromLine(line: line, lineKind: .column(c), cells: cells) {
                return hint
            }
        }
        return nil
    }

    private static func boxLineFromLine(
        line: [(row: Int, col: Int)],
        lineKind: UnitKind,
        cells: [[Cell]]
    ) -> TutorHint? {
        let placedInLine = Set(line.compactMap { cells[$0.row][$0.col].value })
        for d in (1...9) where !placedInLine.contains(d) {
            // Engine view: where d could go in the line.
            let engineCands = line.filter {
                cells[$0.row][$0.col].value == nil
                    && candidates(row: $0.row, col: $0.col, cells: cells).contains(d)
            }
            guard engineCands.count >= 2 else { continue }
            let boxRows = Set(engineCands.map { $0.row / 3 })
            let boxCols = Set(engineCands.map { $0.col / 3 })
            guard boxRows.count == 1, let br = boxRows.first,
                  boxCols.count == 1, let bc = boxCols.first
            else { continue }
            // User must have pencilled d in every line-candidate cell, so the
            // pattern matches their view of the puzzle.
            guard engineCands.allSatisfy({ cells[$0.row][$0.col].notes.contains(d) }) else { continue }

            let box = unitCells(.box(rowBlock: br, colBlock: bc))
            // Eliminators: cells in the box that are *not* on the line and
            // currently have d in user pencil marks.
            let eliminators = box.filter { pos in
                guard cells[pos.row][pos.col].value == nil else { return false }
                guard cells[pos.row][pos.col].notes.contains(d) else { return false }
                switch lineKind {
                case .row(let r): return pos.row != r
                case .column(let c): return pos.col != c
                case .box: return false
                }
            }
            guard !eliminators.isEmpty else { continue }

            return buildBoxLineReduction(
                line: line,
                lineKind: lineKind,
                box: box,
                candidateCells: engineCands,
                digit: d,
                eliminators: eliminators
            )
        }
        return nil
    }

    private static func buildBoxLineReduction(
        line: [(row: Int, col: Int)],
        lineKind: UnitKind,
        box: [(row: Int, col: Int)],
        candidateCells: [(row: Int, col: Int)],
        digit: Int,
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let lineLabel: String
        switch lineKind {
        case .row: lineLabel = "row"
        case .column: lineLabel = "column"
        case .box: lineLabel = "box"
        }

        let lineFocus = line.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let candidateHLs = candidateCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [digit])
        }
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit])
        }

        return TutorHint(
            technique: .boxLineReduction,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit])
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(lineLabel) — where can the digit \(digit) go in it?",
                    highlights: lineFocus
                ),
                TutorStep(
                    narration: "Every spot for \(digit) in this \(lineLabel) lands inside the same 3×3 box.",
                    highlights: lineFocus + candidateHLs
                ),
                TutorStep(
                    narration: "Since \(digit) has to take one of those line cells, it can't go in any *other* cell of that box.",
                    highlights: candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these box cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Hidden pair
    //
    // Within a unit, two missing digits can each only land in the same two
    // cells. Those two cells must therefore hold {a, b} in some order, so
    // every *other* candidate in those two cells can be eliminated.

    static func findHiddenPair(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let unitValues = Set(unit.compactMap { cells[$0.row][$0.col].value })
            let missing = Array(Set(1...9).subtracting(unitValues)).sorted()
            guard missing.count >= 2 else { continue }

            for i in 0..<missing.count {
                for j in (i + 1)..<missing.count {
                    let a = missing[i]
                    let b = missing[j]
                    let aCells = unit.filter {
                        cells[$0.row][$0.col].value == nil
                            && candidates(row: $0.row, col: $0.col, cells: cells).contains(a)
                    }
                    let bCells = unit.filter {
                        cells[$0.row][$0.col].value == nil
                            && candidates(row: $0.row, col: $0.col, cells: cells).contains(b)
                    }
                    guard aCells.count == 2, bCells.count == 2 else { continue }
                    // The two location-sets must be the *same* two cells.
                    let aPositions = aCells.map { CellPos($0) }
                    let bPositions = bCells.map { CellPos($0) }
                    guard Set(aPositions) == Set(bPositions) else { continue }

                    // Validation: user has pencilled both a and b in both pair
                    // cells (otherwise they haven't seen the pattern).
                    let pairCells = aCells
                    let pairValid = pairCells.allSatisfy {
                        let notes = cells[$0.row][$0.col].notes
                        return notes.contains(a) && notes.contains(b)
                    }
                    guard pairValid else { continue }

                    // Eliminations: any *other* digit currently in the pair
                    // cells' notes. If neither cell has extras, this would be
                    // a naked pair, which we'd have caught earlier — skip.
                    let pairDigits: Set<Int> = [a, b]
                    var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                    for cellPos in pairCells {
                        let extras = cells[cellPos.row][cellPos.col].notes.subtracting(pairDigits)
                        if !extras.isEmpty {
                            eliminations.append((cellPos, extras))
                        }
                    }
                    guard !eliminations.isEmpty else { continue }

                    return buildHiddenPair(
                        unit: unit,
                        kind: kind,
                        pairCells: pairCells,
                        pairDigits: pairDigits,
                        eliminations: eliminations
                    )
                }
            }
        }
        return nil
    }

    private static func buildHiddenPair(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        pairCells: [(row: Int, col: Int)],
        pairDigits: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let pairList = pairDigits.sorted().map(String.init).joined(separator: " and ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let pairTargetHLs = pairCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: pairDigits)
        }
        // Eliminator highlights live on the *same* cells as the targets — the
        // per-digit color logic in BoardView keeps {a, b} green and the rest
        // red so the user can see at a glance which candidates stay.
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .hiddenPair,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). Both \(pairList) can only land in the same two cells.",
                    highlights: focus
                ),
                TutorStep(
                    narration: "Since these two cells must hold \(pairList) (in some order), no other digit can go in either of them.",
                    highlights: focus + pairTargetHLs
                ),
                TutorStep(
                    narration: "The other candidates in those cells can be eliminated — only \(pairList) remains.",
                    highlights: pairTargetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to clear those candidates.",
                    highlights: pairTargetHLs + eliminatorHLs
                )
            ]
        )
    }

    /// Lightweight Hashable wrapper around a (row, col) tuple — Swift tuples
    /// don't conform to Hashable so we need this for set comparisons.
    private struct CellPos: Hashable {
        let row: Int
        let col: Int
        init(_ pair: (row: Int, col: Int)) {
            self.row = pair.row
            self.col = pair.col
        }
    }

    // MARK: - Naked triple
    //
    // Three empty cells in a unit whose combined user-pencilled candidates
    // total exactly three digits. Each cell can have 2 or 3 of the triple's
    // digits — they don't all need the full set. The three digits must
    // therefore occupy these three cells in some order, so they're
    // eliminated as candidates from every other cell of the unit.

    static func findNakedTriple(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let empties = unit.filter { cells[$0.row][$0.col].value == nil }
            // Eligible cells: user pencil marks of size 2 or 3 that are a
            // valid subset of the engine candidates (no invented digits).
            // We trust user restrictions — prior eliminations may have
            // narrowed notes below the engine baseline.
            let eligible = empties.filter { pos in
                let notes = cells[pos.row][pos.col].notes
                guard notes.count == 2 || notes.count == 3 else { return false }
                return notes.isSubset(of: candidates(row: pos.row, col: pos.col, cells: cells))
            }
            for i in 0..<eligible.count {
                for j in (i + 1)..<eligible.count {
                    for k in (j + 1)..<eligible.count {
                        let a = eligible[i]
                        let b = eligible[j]
                        let c = eligible[k]
                        let union = cells[a.row][a.col].notes
                            .union(cells[b.row][b.col].notes)
                            .union(cells[c.row][c.col].notes)
                        guard union.count == 3 else { continue }
                        var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                        for other in empties {
                            if other == a || other == b || other == c { continue }
                            let intersect = cells[other.row][other.col].notes.intersection(union)
                            if !intersect.isEmpty {
                                eliminations.append((other, intersect))
                            }
                        }
                        guard !eliminations.isEmpty else { continue }
                        return buildNakedTriple(
                            unit: unit,
                            kind: kind,
                            triple: (a, b, c),
                            tripleDigits: union,
                            eliminations: eliminations
                        )
                    }
                }
            }
        }
        return nil
    }

    // MARK: - Hidden triple
    //
    // Within a unit, three missing digits {a, b, c} can each only land in
    // (a subset of) the same three cells. Those three cells must therefore
    // hold {a, b, c} in some order, so every *other* candidate currently in
    // those three cells can be eliminated.
    //
    // Validation: each of a, b, c — the user's pencilled cells for that
    // digit (in this unit) must exactly equal the engine's candidate cells
    // for that digit. Stops the tutor from spotting patterns the user
    // hasn't worked toward.

    static func findHiddenTriple(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let unitValues = Set(unit.compactMap { cells[$0.row][$0.col].value })
            let missing = Array(Set(1...9).subtracting(unitValues)).sorted()
            guard missing.count >= 3 else { continue }

            // Per-digit candidate cells in this unit (engine view) — only
            // digits whose candidate-cell count is 2 or 3 can participate
            // in a hidden triple.
            var digitCells: [Int: Set<CellPos>] = [:]
            for d in missing {
                let candCells = unit.filter {
                    cells[$0.row][$0.col].value == nil
                        && candidates(row: $0.row, col: $0.col, cells: cells).contains(d)
                }
                if candCells.count == 2 || candCells.count == 3 {
                    digitCells[d] = Set(candCells.map { CellPos($0) })
                }
            }
            let eligible = digitCells.keys.sorted()
            guard eligible.count >= 3 else { continue }

            for i in 0..<eligible.count {
                for j in (i + 1)..<eligible.count {
                    for k in (j + 1)..<eligible.count {
                        let a = eligible[i]
                        let b = eligible[j]
                        let c = eligible[k]
                        let union = digitCells[a]!.union(digitCells[b]!).union(digitCells[c]!)
                        guard union.count == 3 else { continue }

                        // Validation: user's pencilled cells for a, b, c in
                        // the unit match engine candidates exactly — keeps
                        // the tutor honest and the user un-spoiled.
                        let triplet = [a, b, c]
                        let valid = triplet.allSatisfy { d in
                            let userCells = Set(unit.compactMap { pos -> CellPos? in
                                cells[pos.row][pos.col].notes.contains(d) ? CellPos(pos) : nil
                            })
                            return userCells == digitCells[d]!
                        }
                        guard valid else { continue }

                        // Eliminations: any candidate currently pencilled in
                        // the three triple cells that isn't one of {a, b, c}.
                        let tripleDigits: Set<Int> = [a, b, c]
                        let tripleCells = union.sorted { lhs, rhs in
                            (lhs.row, lhs.col) < (rhs.row, rhs.col)
                        }
                        var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                        for pos in tripleCells {
                            let extras = cells[pos.row][pos.col].notes.subtracting(tripleDigits)
                            if !extras.isEmpty {
                                eliminations.append(((pos.row, pos.col), extras))
                            }
                        }
                        guard !eliminations.isEmpty else { continue }

                        return buildHiddenTriple(
                            unit: unit,
                            kind: kind,
                            tripleCells: tripleCells.map { ($0.row, $0.col) },
                            tripleDigits: tripleDigits,
                            eliminations: eliminations
                        )
                    }
                }
            }
        }
        return nil
    }

    private static func buildHiddenTriple(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        tripleCells: [(row: Int, col: Int)],
        tripleDigits: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let digitList = tripleDigits.sorted().map(String.init).joined(separator: ", ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let tripleTargetHLs = tripleCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: tripleDigits)
        }
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .hiddenTriple,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). The digits \(digitList) can only land in the same three cells.",
                    highlights: focus
                ),
                TutorStep(
                    narration: "Since these three cells must hold \(digitList) in some order, no other digit can go in any of them.",
                    highlights: focus + tripleTargetHLs
                ),
                TutorStep(
                    narration: "The other candidates in those cells can be eliminated — only \(digitList) remains.",
                    highlights: tripleTargetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to clear those candidates.",
                    highlights: tripleTargetHLs + eliminatorHLs
                )
            ]
        )
    }

    // MARK: - X-Wing
    //
    // A digit `d` appears in exactly two empty cells in row R1, both in
    // columns C1 and C2. The same is true for row R2 (cells in columns
    // C1 and C2). The digit must therefore occupy two of those four cells
    // — one in each row, one in each column — so `d` can be eliminated
    // from columns C1 and C2 in every other row. (Symmetric column form
    // also handled.)
    //
    // Validation: the user's pencilled `d`-locations must equal the
    // engine's, in both lines, so the user can actually see the pattern.

    private enum XWingOrientation {
        case rows       // d restricted to same 2 columns across 2 rows → eliminate from columns elsewhere
        case columns    // d restricted to same 2 rows across 2 columns → eliminate from rows elsewhere
    }

    static func findXWing(cells: [[Cell]]) -> TutorHint? {
        for d in 1...9 {
            if let h = xWingFor(digit: d, orientation: .rows, cells: cells) { return h }
            if let h = xWingFor(digit: d, orientation: .columns, cells: cells) { return h }
        }
        return nil
    }

    private static func xWingFor(digit d: Int, orientation: XWingOrientation, cells: [[Cell]]) -> TutorHint? {
        // For each line, compute the set of cross-positions where `d` is an
        // engine candidate AND the user's pencil marks for `d` in the line
        // match exactly. Only lines where engine and user agree on a 2-cell
        // pattern are candidates for the X-Wing.
        var lineCross: [Int: Set<Int>] = [:]
        for primary in 0..<9 {
            // Skip lines where d is already placed.
            if (0..<9).contains(where: { other in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                return cells[row][col].value == d
            }) { continue }

            let engineCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return candidates(row: row, col: col, cells: cells).contains(d)
            }
            let userCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return cells[row][col].notes.contains(d)
            }
            if engineCross.count == 2 && Set(engineCross) == Set(userCross) {
                lineCross[primary] = Set(engineCross)
            }
        }

        let lines = lineCross.keys.sorted()
        for i in 0..<lines.count {
            for j in (i + 1)..<lines.count {
                let l1 = lines[i]
                let l2 = lines[j]
                guard let cross = lineCross[l1], lineCross[l2] == cross else { continue }
                let crossArr = cross.sorted()
                let x1 = crossArr[0]
                let x2 = crossArr[1]

                // Eliminations: cells in the cross-positions on lines OTHER
                // than l1, l2, where the user has pencilled `d`.
                var eliminators: [(row: Int, col: Int)] = []
                for primary in 0..<9 where primary != l1 && primary != l2 {
                    for cross in [x1, x2] {
                        let row = orientation == .rows ? primary : cross
                        let col = orientation == .rows ? cross : primary
                        if cells[row][col].value == nil && cells[row][col].notes.contains(d) {
                            eliminators.append((row, col))
                        }
                    }
                }
                guard !eliminators.isEmpty else { continue }

                return buildXWing(
                    orientation: orientation,
                    lines: (l1, l2),
                    cross: (x1, x2),
                    digit: d,
                    eliminators: eliminators
                )
            }
        }
        return nil
    }

    private static func buildXWing(
        orientation: XWingOrientation,
        lines: (Int, Int),
        cross: (Int, Int),
        digit: Int,
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let lineLabel: String
        let crossLabel: String
        switch orientation {
        case .rows:
            lineLabel = "rows"
            crossLabel = "columns"
        case .columns:
            lineLabel = "columns"
            crossLabel = "rows"
        }

        let cornerCoords: [(row: Int, col: Int)] = {
            switch orientation {
            case .rows:
                return [
                    (lines.0, cross.0), (lines.0, cross.1),
                    (lines.1, cross.0), (lines.1, cross.1)
                ]
            case .columns:
                return [
                    (cross.0, lines.0), (cross.0, lines.1),
                    (cross.1, lines.0), (cross.1, lines.1)
                ]
            }
        }()

        let lineFocus: [TutorHighlight] = {
            switch orientation {
            case .rows:
                return (0..<9).flatMap { c in [
                    TutorHighlight(row: lines.0, col: c, kind: .focus),
                    TutorHighlight(row: lines.1, col: c, kind: .focus)
                ] }
            case .columns:
                return (0..<9).flatMap { r in [
                    TutorHighlight(row: r, col: lines.0, kind: .focus),
                    TutorHighlight(row: r, col: lines.1, kind: .focus)
                ] }
            }
        }()
        let cornerHLs = cornerCoords.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [digit])
        }
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit])
        }

        return TutorHint(
            technique: .xWing,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit])
            },
            steps: [
                TutorStep(
                    narration: "Look at these two \(lineLabel). The digit \(digit) can only land in two cells in each — and they share the same two \(crossLabel).",
                    highlights: lineFocus + cornerHLs
                ),
                TutorStep(
                    narration: "\(digit) must take exactly one cell in each \(lineLabel.dropLast()) — one per \(crossLabel.dropLast()). So \(digit) can't appear in those \(crossLabel) anywhere else.",
                    highlights: cornerHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - XY-Wing
    //
    // Three bivalue cells. The "pivot" has candidates {a, b}. Two "pincer"
    // cells both see the pivot — one with {a, c}, the other with {b, c}.
    // No matter which value the pivot takes, one of the pincers becomes c.
    // Therefore any cell that sees BOTH pincers can't be c.
    //
    // Validation: pivot and both pincers must have user pencil marks of
    // size exactly 2 matching their engine candidates exactly. Eliminator
    // cells must have c in user marks.

    static func findXYWing(cells: [[Cell]]) -> TutorHint? {
        // Collect bivalue cells: size-2 user marks that are a valid subset
        // of engine candidates (no invented digits). We trust the user's
        // restrictions — prior tutor eliminations narrow notes below the
        // engine baseline, so requiring strict equality would block this
        // technique on any board where simpler techniques have already run.
        var bivalue: [(pos: (row: Int, col: Int), notes: Set<Int>)] = []
        for r in 0..<9 {
            for c in 0..<9 {
                let cell = cells[r][c]
                guard cell.value == nil, cell.notes.count == 2 else { continue }
                let engine = candidates(row: r, col: c, cells: cells)
                guard cell.notes.isSubset(of: engine) else { continue }
                bivalue.append(((r, c), cell.notes))
            }
        }

        for pivotIdx in 0..<bivalue.count {
            let pivot = bivalue[pivotIdx]
            let pivotArr = pivot.notes.sorted()
            let a = pivotArr[0]
            let b = pivotArr[1]

            // Pincer candidates: bivalue cells that see the pivot.
            let pincers = bivalue.filter { $0.pos != pivot.pos && sees($0.pos, pivot.pos) }

            for i in 0..<pincers.count {
                for j in (i + 1)..<pincers.count {
                    let p1 = pincers[i]
                    let p2 = pincers[j]
                    // The pincers must share exactly one digit, and that digit
                    // can't be in the pivot — it's the "wing tip" c.
                    let shared = p1.notes.intersection(p2.notes)
                    guard shared.count == 1, let c = shared.first else { continue }
                    guard !pivot.notes.contains(c) else { continue }
                    // One pincer is {a, c}, the other is {b, c}.
                    let p1IsAC = p1.notes.contains(a) && !p1.notes.contains(b)
                    let p1IsBC = !p1.notes.contains(a) && p1.notes.contains(b)
                    let p2IsAC = p2.notes.contains(a) && !p2.notes.contains(b)
                    let p2IsBC = !p2.notes.contains(a) && p2.notes.contains(b)
                    guard (p1IsAC && p2IsBC) || (p1IsBC && p2IsAC) else { continue }

                    // Eliminations: any cell that sees BOTH pincers (but
                    // isn't the pivot or a pincer itself) and has c in user
                    // pencil marks. The pivot itself can't be `c` since c
                    // isn't in its candidate set.
                    var eliminators: [(row: Int, col: Int)] = []
                    for r in 0..<9 {
                        for col in 0..<9 {
                            let pos = (r, col)
                            if pos == pivot.pos || pos == p1.pos || pos == p2.pos { continue }
                            guard cells[r][col].value == nil else { continue }
                            guard cells[r][col].notes.contains(c) else { continue }
                            if !sees(pos, p1.pos) || !sees(pos, p2.pos) { continue }
                            eliminators.append(pos)
                        }
                    }
                    guard !eliminators.isEmpty else { continue }

                    return buildXYWing(
                        pivot: pivot.pos,
                        pincer1: p1.pos,
                        pincer2: p2.pos,
                        a: a, b: b, c: c,
                        p1IsAC: p1IsAC,
                        eliminators: eliminators
                    )
                }
            }
        }
        return nil
    }

    private static func buildXYWing(
        pivot: (row: Int, col: Int),
        pincer1: (row: Int, col: Int),
        pincer2: (row: Int, col: Int),
        a: Int,
        b: Int,
        c: Int,
        p1IsAC: Bool,
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let (acPincer, bcPincer) = p1IsAC ? (pincer1, pincer2) : (pincer2, pincer1)

        let pivotHL = TutorHighlight(row: pivot.row, col: pivot.col, kind: .target, candidates: [a, b])
        let acPincerHL = TutorHighlight(row: acPincer.row, col: acPincer.col, kind: .target, candidates: [a, c])
        let bcPincerHL = TutorHighlight(row: bcPincer.row, col: bcPincer.col, kind: .target, candidates: [b, c])
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [c])
        }

        return TutorHint(
            technique: .xyWing,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [c])
            },
            steps: [
                TutorStep(
                    narration: "Look at this 'pivot' cell — it can only be \(a) or \(b).",
                    highlights: [pivotHL]
                ),
                TutorStep(
                    narration: "These two neighbors both see the pivot. One has candidates \(a) and \(c); the other has \(b) and \(c).",
                    highlights: [pivotHL, acPincerHL, bcPincerHL]
                ),
                TutorStep(
                    narration: "If the pivot is \(a), the first neighbor must be \(c). If it's \(b), the other neighbor must be \(c). Either way, one of them is \(c) — so any cell that sees both can't be \(c).",
                    highlights: [pivotHL, acPincerHL, bcPincerHL] + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(c) off these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Swordfish
    //
    // Generalisation of X-Wing to three rows × three columns. A digit `d`
    // appears in 2-or-3 candidate cells in three different rows, and across
    // those three rows the cells lie in only three distinct columns. The
    // digit must therefore occupy three of those nine intersection cells
    // (one per row, one per column), so `d` can be eliminated from those
    // three columns in every other row. (Symmetric column-form also handled.)
    //
    // Validation matches X-Wing: the user's pencilled `d`-cells in each of
    // the three lines must equal the engine's, so the user can see the
    // pattern.

    static func findSwordfish(cells: [[Cell]]) -> TutorHint? {
        for d in 1...9 {
            if let h = swordfishFor(digit: d, orientation: .rows, cells: cells) { return h }
            if let h = swordfishFor(digit: d, orientation: .columns, cells: cells) { return h }
        }
        return nil
    }

    private static func swordfishFor(digit d: Int, orientation: XWingOrientation, cells: [[Cell]]) -> TutorHint? {
        // Lines (rows or cols, depending on orientation) where d has 2-3
        // engine candidates AND user pencil marks match.
        var lineCross: [Int: Set<Int>] = [:]
        for primary in 0..<9 {
            // Skip lines where d is already placed.
            if (0..<9).contains(where: { other in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                return cells[row][col].value == d
            }) { continue }

            let engineCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return candidates(row: row, col: col, cells: cells).contains(d)
            }
            let userCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return cells[row][col].notes.contains(d)
            }
            // Swordfish lines have 2 OR 3 candidate cells (more than 3 means
            // the line can't be part of a 3-column/3-row Swordfish).
            if (engineCross.count == 2 || engineCross.count == 3)
                && Set(engineCross) == Set(userCross)
            {
                lineCross[primary] = Set(engineCross)
            }
        }

        // Need at least 3 lines to form a Swordfish.
        let lines = lineCross.keys.sorted()
        guard lines.count >= 3 else { return nil }

        // Try every combination of 3 lines.
        for i in 0..<(lines.count - 2) {
            for j in (i + 1)..<(lines.count - 1) {
                for k in (j + 1)..<lines.count {
                    let l1 = lines[i]; let l2 = lines[j]; let l3 = lines[k]
                    let union = lineCross[l1]!.union(lineCross[l2]!).union(lineCross[l3]!)
                    guard union.count == 3 else { continue }
                    let crossArr = union.sorted()

                    var eliminators: [(row: Int, col: Int)] = []
                    for primary in 0..<9 where primary != l1 && primary != l2 && primary != l3 {
                        for cross in crossArr {
                            let row = orientation == .rows ? primary : cross
                            let col = orientation == .rows ? cross : primary
                            if cells[row][col].value == nil && cells[row][col].notes.contains(d) {
                                eliminators.append((row, col))
                            }
                        }
                    }
                    guard !eliminators.isEmpty else { continue }

                    // Collect the actual candidate cells (the cells where d
                    // could go, drawn from each line's lineCross set, mapped
                    // back to (row, col) coordinates).
                    var candidateCells: [(row: Int, col: Int)] = []
                    for l in [l1, l2, l3] {
                        for c in lineCross[l]! {
                            switch orientation {
                            case .rows: candidateCells.append((l, c))
                            case .columns: candidateCells.append((c, l))
                            }
                        }
                    }
                    return buildSwordfish(
                        orientation: orientation,
                        lines: (l1, l2, l3),
                        cross: (crossArr[0], crossArr[1], crossArr[2]),
                        digit: d,
                        candidateCells: candidateCells,
                        eliminators: eliminators
                    )
                }
            }
        }
        return nil
    }

    private static func buildSwordfish(
        orientation: XWingOrientation,
        lines: (Int, Int, Int),
        cross: (Int, Int, Int),
        digit: Int,
        candidateCells: [(row: Int, col: Int)],
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let lineLabel: String
        let crossLabel: String
        switch orientation {
        case .rows:
            lineLabel = "rows"
            crossLabel = "columns"
        case .columns:
            lineLabel = "columns"
            crossLabel = "rows"
        }

        let lineList = [lines.0, lines.1, lines.2]
        let crossList = [cross.0, cross.1, cross.2]

        // The 9 intersection cells (3 lines × 3 cross-positions) — focus.
        let intersections: [(row: Int, col: Int)] = lineList.flatMap { l in
            crossList.map { c -> (row: Int, col: Int) in
                switch orientation {
                case .rows: return (l, c)
                case .columns: return (c, l)
                }
            }
        }
        let lineFocus = intersections.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .focus)
        }
        // Targets are the actual candidate cells (where digit can go).
        let candidateHLs = candidateCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [digit])
        }
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit])
        }

        return TutorHint(
            technique: .swordfish,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit])
            },
            steps: [
                TutorStep(
                    narration: "Look at these three \(lineLabel). The digit \(digit) can only land in the same three \(crossLabel) across all of them.",
                    highlights: lineFocus + candidateHLs
                ),
                TutorStep(
                    narration: "\(digit) must take one cell in each \(lineLabel.dropLast()) — and within those three \(crossLabel). So \(digit) can't appear in those \(crossLabel) anywhere else.",
                    highlights: candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    /// Two cells "see" each other if they share a row, column, or 3×3 box
    /// (and aren't the same cell).
    private static func sees(_ a: (row: Int, col: Int), _ b: (row: Int, col: Int)) -> Bool {
        if a.row == b.row && a.col == b.col { return false }
        if a.row == b.row || a.col == b.col { return true }
        return (a.row / 3 == b.row / 3) && (a.col / 3 == b.col / 3)
    }

    // MARK: - XYZ-Wing
    //
    // Generalisation of XY-Wing: pivot is *trivalue* {a,b,c}; pincers are
    // bivalue {a,c} and {b,c}; both pincers must see the pivot. Common
    // candidate `c` can be eliminated from cells that see the pivot AND both
    // pincers (the pivot itself, unlike in XY-Wing, has c too — so the
    // elimination set is narrower). Requires user pencil marks matching
    // engine candidates.
    static func findXYZWing(cells: [[Cell]]) -> TutorHint? {
        // Pivots: trivalue cells whose user marks are a valid subset of
        // engine candidates (no invented digits). Prior tutor eliminations
        // may have narrowed notes; trust the user's restrictions.
        var trivalue: [(pos: (row: Int, col: Int), notes: Set<Int>)] = []
        var bivalue: [(pos: (row: Int, col: Int), notes: Set<Int>)] = []
        for r in 0..<9 {
            for c in 0..<9 {
                let cell = cells[r][c]
                guard cell.value == nil else { continue }
                let engine = candidates(row: r, col: c, cells: cells)
                guard cell.notes.isSubset(of: engine) else { continue }
                if cell.notes.count == 3 { trivalue.append(((r, c), cell.notes)) }
                if cell.notes.count == 2 { bivalue.append(((r, c), cell.notes)) }
            }
        }

        for pivot in trivalue {
            let pincers = bivalue.filter { sees($0.pos, pivot.pos) && $0.notes.isSubset(of: pivot.notes) }
            for i in 0..<pincers.count {
                for j in (i + 1)..<pincers.count {
                    let p1 = pincers[i]
                    let p2 = pincers[j]
                    let shared = p1.notes.intersection(p2.notes)
                    guard shared.count == 1, let c = shared.first else { continue }
                    let union = p1.notes.union(p2.notes)
                    guard union == pivot.notes else { continue }

                    var eliminators: [(row: Int, col: Int)] = []
                    for r in 0..<9 {
                        for col in 0..<9 {
                            let pos = (r, col)
                            if pos == pivot.pos || pos == p1.pos || pos == p2.pos { continue }
                            guard cells[r][col].value == nil else { continue }
                            guard cells[r][col].notes.contains(c) else { continue }
                            // Critical: must see ALL THREE — pivot + both pincers.
                            if !sees(pos, pivot.pos) || !sees(pos, p1.pos) || !sees(pos, p2.pos) { continue }
                            eliminators.append(pos)
                        }
                    }
                    guard !eliminators.isEmpty else { continue }
                    return buildXYZWing(pivot: pivot.pos, p1: p1.pos, p2: p2.pos, c: c, eliminators: eliminators)
                }
            }
        }
        return nil
    }

    private static func buildXYZWing(
        pivot: (row: Int, col: Int),
        p1: (row: Int, col: Int),
        p2: (row: Int, col: Int),
        c: Int,
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let pivotHL = TutorHighlight(row: pivot.row, col: pivot.col, kind: .target, candidates: [c])
        let p1HL = TutorHighlight(row: p1.row, col: p1.col, kind: .target, candidates: [c])
        let p2HL = TutorHighlight(row: p2.row, col: p2.col, kind: .target, candidates: [c])
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [c]) }
        return TutorHint(
            technique: .xyzWing,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [c]) },
            steps: [
                TutorStep(
                    narration: "This trivalue cell is the pivot. The two neighbours each share two of its candidates and both have \(c).",
                    highlights: [pivotHL, p1HL, p2HL]
                ),
                TutorStep(
                    narration: "Whatever the pivot ends up being, one of these three cells must hold \(c). So any cell that sees all three can't be \(c).",
                    highlights: [pivotHL, p1HL, p2HL] + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(c) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - W-Wing
    //
    // Two bivalue cells with the same candidate set {a,b}. They don't see
    // each other directly. There's a "strong link" on `a` connecting them:
    // a unit (row/col/box) where digit `a` has exactly two candidate cells,
    // each of which sees one of the two bivalue cells. By the strong link,
    // exactly one of the two bivalue cells is `a` and the other is `b` —
    // so any cell seeing BOTH bivalue cells can't be `b`. (Symmetrically
    // for `a`, but we eliminate the non-strong-link digit.)
    static func findWWing(cells: [[Cell]]) -> TutorHint? {
        var bivalue: [(pos: (row: Int, col: Int), notes: Set<Int>)] = []
        for r in 0..<9 {
            for c in 0..<9 {
                let cell = cells[r][c]
                guard cell.value == nil, cell.notes.count == 2 else { continue }
                let engine = candidates(row: r, col: c, cells: cells)
                // Trust user notes that are a valid subset of engine cands —
                // prior eliminations narrow notes below the engine view.
                guard cell.notes.isSubset(of: engine) else { continue }
                bivalue.append(((r, c), cell.notes))
            }
        }
        // Pair up bivalues with the same candidate set, that don't see
        // each other (otherwise it's a naked pair, not a W-Wing).
        for i in 0..<bivalue.count {
            for j in (i + 1)..<bivalue.count {
                let a = bivalue[i]
                let b = bivalue[j]
                guard a.notes == b.notes else { continue }
                if sees(a.pos, b.pos) { continue }
                let candArr = a.notes.sorted()
                // Try eliminating each of the two candidates by checking
                // for a strong link on the OTHER one.
                for elimDigit in candArr {
                    let linkDigit = candArr.first { $0 != elimDigit }!
                    // Find a unit where linkDigit has exactly two candidate
                    // cells, one seeing `a` and the other seeing `b` (and
                    // neither IS a or b themselves).
                    if let link = findStrongLink(linkDigit: linkDigit, between: a.pos, and: b.pos, cells: cells) {
                        // Eliminations: cells that see BOTH a and b, and
                        // currently have elimDigit as a candidate.
                        var eliminators: [(row: Int, col: Int)] = []
                        for r in 0..<9 {
                            for c in 0..<9 {
                                let pos = (r, c)
                                if pos == a.pos || pos == b.pos { continue }
                                guard cells[r][c].value == nil else { continue }
                                guard cells[r][c].notes.contains(elimDigit) else { continue }
                                if !sees(pos, a.pos) || !sees(pos, b.pos) { continue }
                                eliminators.append(pos)
                            }
                        }
                        guard !eliminators.isEmpty else { continue }
                        return buildWWing(
                            biA: a.pos, biB: b.pos,
                            elimDigit: elimDigit, linkDigit: linkDigit,
                            link: link, eliminators: eliminators
                        )
                    }
                }
            }
        }
        return nil
    }

    /// Find two cells in some shared unit where `linkDigit` is a candidate
    /// in exactly those two cells, with one seeing `a` and the other seeing
    /// `b`. Returns the pair, or nil.
    private static func findStrongLink(
        linkDigit: Int,
        between a: (row: Int, col: Int),
        and b: (row: Int, col: Int),
        cells: [[Cell]]
    ) -> ((row: Int, col: Int), (row: Int, col: Int))? {
        // Iterate every unit (rows, columns, boxes).
        var units: [[(row: Int, col: Int)]] = []
        for r in 0..<9 { units.append((0..<9).map { (r, $0) }) }
        for c in 0..<9 { units.append((0..<9).map { ($0, c) }) }
        for br in 0..<3 {
            for bc in 0..<3 {
                var box: [(row: Int, col: Int)] = []
                for r in (br * 3)..<(br * 3 + 3) {
                    for c in (bc * 3)..<(bc * 3 + 3) { box.append((r, c)) }
                }
                units.append(box)
            }
        }
        for unit in units {
            let candidatesInUnit = unit.filter { pos in
                cells[pos.row][pos.col].value == nil &&
                cells[pos.row][pos.col].notes.contains(linkDigit)
            }
            guard candidatesInUnit.count == 2 else { continue }
            let l1 = candidatesInUnit[0]
            let l2 = candidatesInUnit[1]
            // Neither link cell can be a or b (would be a strong link
            // *containing* one of them — degenerates to a different pattern).
            if l1 == a || l1 == b || l2 == a || l2 == b { continue }
            if sees(l1, a) && sees(l2, b) { return (l1, l2) }
            if sees(l2, a) && sees(l1, b) { return (l2, l1) }
        }
        return nil
    }

    private static func buildWWing(
        biA: (row: Int, col: Int),
        biB: (row: Int, col: Int),
        elimDigit: Int,
        linkDigit: Int,
        link: ((row: Int, col: Int), (row: Int, col: Int)),
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let aHL = TutorHighlight(row: biA.row, col: biA.col, kind: .target, candidates: [linkDigit, elimDigit])
        let bHL = TutorHighlight(row: biB.row, col: biB.col, kind: .target, candidates: [linkDigit, elimDigit])
        let l1HL = TutorHighlight(row: link.0.row, col: link.0.col, kind: .focus, candidates: [linkDigit])
        let l2HL = TutorHighlight(row: link.1.row, col: link.1.col, kind: .focus, candidates: [linkDigit])
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [elimDigit]) }
        return TutorHint(
            technique: .wWing,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [elimDigit]) },
            steps: [
                TutorStep(
                    narration: "These two cells each have only \(linkDigit) and \(elimDigit) as candidates.",
                    highlights: [aHL, bHL]
                ),
                TutorStep(
                    narration: "In a unit between them, \(linkDigit) can only land in two cells — one seeing each. So whichever of those is \(linkDigit), the matching bivalue cell must be \(elimDigit).",
                    highlights: [aHL, bHL, l1HL, l2HL]
                ),
                TutorStep(
                    narration: "Either way, exactly one of the two bivalue cells is \(elimDigit). Any cell that sees both can't be \(elimDigit).",
                    highlights: [aHL, bHL] + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(elimDigit) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - Skyscraper
    //
    // Single-digit pattern. A digit `d` has exactly 2 candidate cells in
    // each of two different rows, and one column is shared (the "base"),
    // while the two unshared cells (the "tops") sit in two different
    // columns. The tops form a strong-link pair: one of them must be d.
    // Eliminate d from any cell that sees both tops. Symmetric for cols.
    static func findSkyscraper(cells: [[Cell]]) -> TutorHint? {
        for digit in 1...9 {
            // Row-form: find rows where d has exactly 2 candidate cells.
            var rowPairs: [(row: Int, cols: [Int])] = []
            for r in 0..<9 {
                let cols = (0..<9).filter { c in
                    cells[r][c].value == nil && cells[r][c].notes.contains(digit)
                }
                if cols.count == 2 { rowPairs.append((r, cols)) }
            }
            for i in 0..<rowPairs.count {
                for j in (i + 1)..<rowPairs.count {
                    let a = rowPairs[i]
                    let b = rowPairs[j]
                    // Exactly one column shared.
                    let shared = Set(a.cols).intersection(Set(b.cols))
                    guard shared.count == 1, let baseCol = shared.first else { continue }
                    let aTopCol = a.cols.first { $0 != baseCol }!
                    let bTopCol = b.cols.first { $0 != baseCol }!
                    let top1 = (a.row, aTopCol)
                    let top2 = (b.row, bTopCol)
                    // Eliminations: cells that see both tops and have d.
                    var eliminators: [(row: Int, col: Int)] = []
                    for r in 0..<9 {
                        for c in 0..<9 {
                            let pos = (r, c)
                            if pos == top1 || pos == top2 { continue }
                            guard cells[r][c].value == nil else { continue }
                            guard cells[r][c].notes.contains(digit) else { continue }
                            if !sees(pos, top1) || !sees(pos, top2) { continue }
                            eliminators.append(pos)
                        }
                    }
                    guard !eliminators.isEmpty else { continue }
                    return buildSkyscraper(
                        digit: digit,
                        base1: (a.row, baseCol), base2: (b.row, baseCol),
                        top1: top1, top2: top2,
                        eliminators: eliminators,
                        rowForm: true
                    )
                }
            }
            // Column-form: same but rows/cols swapped.
            var colPairs: [(col: Int, rows: [Int])] = []
            for c in 0..<9 {
                let rows = (0..<9).filter { r in
                    cells[r][c].value == nil && cells[r][c].notes.contains(digit)
                }
                if rows.count == 2 { colPairs.append((c, rows)) }
            }
            for i in 0..<colPairs.count {
                for j in (i + 1)..<colPairs.count {
                    let a = colPairs[i]
                    let b = colPairs[j]
                    let shared = Set(a.rows).intersection(Set(b.rows))
                    guard shared.count == 1, let baseRow = shared.first else { continue }
                    let aTopRow = a.rows.first { $0 != baseRow }!
                    let bTopRow = b.rows.first { $0 != baseRow }!
                    let top1 = (aTopRow, a.col)
                    let top2 = (bTopRow, b.col)
                    var eliminators: [(row: Int, col: Int)] = []
                    for r in 0..<9 {
                        for c in 0..<9 {
                            let pos = (r, c)
                            if pos == top1 || pos == top2 { continue }
                            guard cells[r][c].value == nil else { continue }
                            guard cells[r][c].notes.contains(digit) else { continue }
                            if !sees(pos, top1) || !sees(pos, top2) { continue }
                            eliminators.append(pos)
                        }
                    }
                    guard !eliminators.isEmpty else { continue }
                    return buildSkyscraper(
                        digit: digit,
                        base1: (baseRow, a.col), base2: (baseRow, b.col),
                        top1: top1, top2: top2,
                        eliminators: eliminators,
                        rowForm: false
                    )
                }
            }
        }
        return nil
    }

    private static func buildSkyscraper(
        digit: Int,
        base1: (row: Int, col: Int),
        base2: (row: Int, col: Int),
        top1: (row: Int, col: Int),
        top2: (row: Int, col: Int),
        eliminators: [(row: Int, col: Int)],
        rowForm: Bool
    ) -> TutorHint {
        let lineLabel = rowForm ? "row" : "column"
        let baseLabel = rowForm ? "column" : "row"
        let base1HL = TutorHighlight(row: base1.row, col: base1.col, kind: .focus, candidates: [digit])
        let base2HL = TutorHighlight(row: base2.row, col: base2.col, kind: .focus, candidates: [digit])
        let top1HL = TutorHighlight(row: top1.row, col: top1.col, kind: .target, candidates: [digit])
        let top2HL = TutorHighlight(row: top2.row, col: top2.col, kind: .target, candidates: [digit])
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit]) }
        return TutorHint(
            technique: .skyscraper,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit]) },
            steps: [
                TutorStep(
                    narration: "In two \(lineLabel)s, \(digit) can only go in two cells each, sharing one \(baseLabel) (the 'base').",
                    highlights: [base1HL, base2HL, top1HL, top2HL]
                ),
                TutorStep(
                    narration: "Whichever of the two base cells is \(digit), the other \(lineLabel)'s 'top' must be \(digit). So one of the two tops is \(digit) — any cell seeing both can't be.",
                    highlights: [top1HL, top2HL] + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - Empty Rectangle
    //
    // Single-digit box pattern: in a box, candidates for a digit lie in a
    // single row OR column (the "ER row/col"). Combined with a strong link
    // on that digit elsewhere on the same line, we get an elimination.
    // Specifically: in box B, digit d candidates all lie in row R (within
    // the box). Find a column C where d has exactly two candidate cells:
    // one inside the box's columns, one outside in another row R'. Then
    // cell (R, C) — outside the box but on row R — can't be d.
    static func findEmptyRectangle(cells: [[Cell]]) -> TutorHint? {
        for digit in 1...9 {
            for br in 0..<3 {
                for bc in 0..<3 {
                    // Cells in this box where digit is a candidate.
                    var boxCandidates: [(row: Int, col: Int)] = []
                    for r in (br * 3)..<(br * 3 + 3) {
                        for c in (bc * 3)..<(bc * 3 + 3) {
                            if cells[r][c].value == nil && cells[r][c].notes.contains(digit) {
                                boxCandidates.append((r, c))
                            }
                        }
                    }
                    guard boxCandidates.count >= 2 else { continue }
                    // Try ER row: all candidates either in row R or outside row R but in non-shared columns.
                    // Standard ER construction: pick a "pivot" row R inside the box. Box-row candidates not in R must be in a single column.
                    for pivotRow in (br * 3)..<(br * 3 + 3) {
                        let inPivotRow = boxCandidates.filter { $0.row == pivotRow }
                        let outsidePivotRow = boxCandidates.filter { $0.row != pivotRow }
                        guard !inPivotRow.isEmpty, !outsidePivotRow.isEmpty else { continue }
                        let outsideCols = Set(outsidePivotRow.map { $0.col })
                        guard outsideCols.count == 1, let pivotColInBox = outsideCols.first else { continue }
                        // Find external strong link: column pivotColInBox or any column where one end is on pivotRow and the other end sees the box.
                        // ER elimination: for each column C outside the box columns, if d has exactly 2 candidates in C and one is on pivotRow, the other end's row R' may give an elimination at (R', pivotColInBox).
                        for extCol in 0..<9 {
                            if extCol >= bc * 3 && extCol < bc * 3 + 3 { continue }
                            let colCandidates = (0..<9).filter { r in
                                cells[r][extCol].value == nil && cells[r][extCol].notes.contains(digit)
                            }
                            guard colCandidates.count == 2 else { continue }
                            guard colCandidates.contains(pivotRow) else { continue }
                            let otherRow = colCandidates.first { $0 != pivotRow }!
                            // Eliminator: (otherRow, pivotColInBox), if it has digit and isn't already a placed value.
                            let elimPos = (otherRow, pivotColInBox)
                            if elimPos.0 >= br * 3 && elimPos.0 < br * 3 + 3 { continue }  // skip if inside the box
                            guard cells[elimPos.0][elimPos.1].value == nil else { continue }
                            guard cells[elimPos.0][elimPos.1].notes.contains(digit) else { continue }
                            return buildEmptyRectangle(
                                digit: digit,
                                boxRow: br, boxCol: bc,
                                pivotRow: pivotRow,
                                pivotCol: pivotColInBox,
                                strongLinkCol: extCol,
                                strongLinkOtherRow: otherRow,
                                eliminator: elimPos
                            )
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func buildEmptyRectangle(
        digit: Int,
        boxRow: Int, boxCol: Int,
        pivotRow: Int,
        pivotCol: Int,
        strongLinkCol: Int,
        strongLinkOtherRow: Int,
        eliminator: (row: Int, col: Int)
    ) -> TutorHint {
        // Highlight box cells with d.
        var boxHLs: [TutorHighlight] = []
        for r in (boxRow * 3)..<(boxRow * 3 + 3) {
            for c in (boxCol * 3)..<(boxCol * 3 + 3) {
                boxHLs.append(TutorHighlight(row: r, col: c, kind: .focus, candidates: [digit]))
            }
        }
        let pivotHL = TutorHighlight(row: pivotRow, col: pivotCol, kind: .target, candidates: [digit])
        let l1HL = TutorHighlight(row: pivotRow, col: strongLinkCol, kind: .target, candidates: [digit])
        let l2HL = TutorHighlight(row: strongLinkOtherRow, col: strongLinkCol, kind: .target, candidates: [digit])
        let elimHL = TutorHighlight(row: eliminator.row, col: eliminator.col, kind: .eliminator, candidates: [digit])
        return TutorHint(
            technique: .emptyRectangle,
            placement: nil,
            eliminations: [TutorHint.Elimination(row: eliminator.row, col: eliminator.col, candidates: [digit])],
            steps: [
                TutorStep(
                    narration: "In this 3×3 box, \(digit) is restricted such that it must land in the highlighted row or column inside the box.",
                    highlights: boxHLs + [pivotHL]
                ),
                TutorStep(
                    narration: "In another column, \(digit) has only two candidate cells — one on the same row as the pivot. So one end of the link is \(digit), forcing a placement either at the box's pivot or at the link's far cell.",
                    highlights: [pivotHL, l1HL, l2HL]
                ),
                TutorStep(
                    narration: "Whichever way it resolves, the marked cell can't be \(digit) — it'd violate the chain.",
                    highlights: [pivotHL, l1HL, l2HL, elimHL]
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off this cell.",
                    highlights: [elimHL]
                )
            ]
        )
    }

    // MARK: - 2-String Kite
    //
    // Single-digit pattern. A digit `d` has exactly 2 candidate cells in
    // some row, and exactly 2 candidate cells in some column. One row-cell
    // and one column-cell share a 3×3 box (the "joint"). The two unjoined
    // cells (the "tips") form an effective strong-link pair: one of them
    // must be `d`. Eliminate `d` from any cell that sees both tips.
    static func findTwoStringKite(cells: [[Cell]]) -> TutorHint? {
        for digit in 1...9 {
            // Rows / columns where the digit has exactly 2 candidate cells.
            var rowPairs: [(row: Int, cells: [(row: Int, col: Int)])] = []
            for r in 0..<9 {
                let cs = (0..<9)
                    .filter { c in cells[r][c].value == nil && cells[r][c].notes.contains(digit) }
                    .map { (r, $0) }
                if cs.count == 2 { rowPairs.append((r, cs)) }
            }
            var colPairs: [(col: Int, cells: [(row: Int, col: Int)])] = []
            for c in 0..<9 {
                let cs = (0..<9)
                    .filter { r in cells[r][c].value == nil && cells[r][c].notes.contains(digit) }
                    .map { ($0, c) }
                if cs.count == 2 { colPairs.append((c, cs)) }
            }
            for rp in rowPairs {
                for cp in colPairs {
                    // Find a row-cell and col-cell that share a box (the joint).
                    for jointR in rp.cells {
                        for jointC in cp.cells {
                            if jointR == jointC { continue }
                            // Joint must be the same cell? No — the joint is two
                            // DIFFERENT cells (one in row, one in col) that share a box.
                            // So (jointR.row, jointR.col) and (jointC.row, jointC.col)
                            // must share a box but not be identical.
                            if jointR.row / 3 != jointC.row / 3 { continue }
                            if jointR.col / 3 != jointC.col / 3 { continue }
                            // Tips are the OTHER cells in each pair.
                            let tipR = rp.cells.first { $0 != jointR }!
                            let tipC = cp.cells.first { $0 != jointC }!
                            if tipR == tipC { continue }
                            // Tips can't see each other directly (that'd be a different pattern).
                            // Actually it's still valid if they see each other, but more like a triple chain.
                            // For our v1 we accept either; the elimination logic still holds.
                            var eliminators: [(row: Int, col: Int)] = []
                            for r in 0..<9 {
                                for c in 0..<9 {
                                    let pos = (r, c)
                                    if pos == tipR || pos == tipC || pos == jointR || pos == jointC { continue }
                                    guard cells[r][c].value == nil else { continue }
                                    guard cells[r][c].notes.contains(digit) else { continue }
                                    if !sees(pos, tipR) || !sees(pos, tipC) { continue }
                                    eliminators.append(pos)
                                }
                            }
                            guard !eliminators.isEmpty else { continue }
                            return buildTwoStringKite(
                                digit: digit,
                                jointR: jointR, jointC: jointC,
                                tipR: tipR, tipC: tipC,
                                eliminators: eliminators
                            )
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func buildTwoStringKite(
        digit: Int,
        jointR: (row: Int, col: Int),
        jointC: (row: Int, col: Int),
        tipR: (row: Int, col: Int),
        tipC: (row: Int, col: Int),
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let jointRHL = TutorHighlight(row: jointR.row, col: jointR.col, kind: .focus, candidates: [digit])
        let jointCHL = TutorHighlight(row: jointC.row, col: jointC.col, kind: .focus, candidates: [digit])
        let tipRHL = TutorHighlight(row: tipR.row, col: tipR.col, kind: .target, candidates: [digit])
        let tipCHL = TutorHighlight(row: tipC.row, col: tipC.col, kind: .target, candidates: [digit])
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit]) }
        return TutorHint(
            technique: .twoStringKite,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit]) },
            steps: [
                TutorStep(
                    narration: "\(digit) is restricted to two cells in this row and two cells in this column. The 'joint' cells share a 3×3 box.",
                    highlights: [jointRHL, jointCHL, tipRHL, tipCHL]
                ),
                TutorStep(
                    narration: "Whichever joint cell is \(digit) forces the other to not be — and the other tip must take \(digit) instead. Either way one of the two tips is \(digit), so cells seeing both can't be.",
                    highlights: [tipRHL, tipCHL] + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - Finned X-Wing
    //
    // Standard X-Wing: digit `d` has exactly 2 candidate cells in each of
    // two rows, sharing the same two columns. A *finned* X-Wing relaxes
    // this: one of the rows ("the finned row") has the two corner cells
    // PLUS additional fin cells — all in the same 3×3 box as one of the
    // corners. The eliminations are restricted to cells in the OTHER
    // column AND in the same box as the fin (so they see the entire fin).
    // We implement the row-based form; a column-based mirror is symmetric.
    static func findFinnedXWing(cells: [[Cell]]) -> TutorHint? {
        for digit in 1...9 {
            // Rows where the digit has at least 2 candidate cells.
            var rowCands: [(row: Int, cols: [Int])] = []
            for r in 0..<9 {
                let cs = (0..<9).filter { c in
                    cells[r][c].value == nil && cells[r][c].notes.contains(digit)
                }
                if cs.count >= 2 { rowCands.append((r, cs)) }
            }
            for i in 0..<rowCands.count {
                for j in 0..<rowCands.count where i != j {
                    let clean = rowCands[i]      // exactly 2 candidate cells
                    let finned = rowCands[j]     // 3+ candidate cells: 2 corners + fin
                    if clean.cols.count != 2 { continue }
                    if finned.cols.count <= 2 { continue }
                    // Both X-Wing columns must appear in the finned row.
                    guard clean.cols.allSatisfy(finned.cols.contains) else { continue }
                    let xCols = clean.cols
                    let fin = finned.cols.filter { !xCols.contains($0) }.map { (finned.row, $0) }
                    guard !fin.isEmpty else { continue }
                    // All fin cells must lie in the same box as ONE of the corners.
                    let finCornerCol: Int? = {
                        for cornerCol in xCols {
                            let cornerBoxCol = cornerCol / 3
                            if fin.allSatisfy({ $0.1 / 3 == cornerBoxCol }) { return cornerCol }
                        }
                        return nil
                    }()
                    guard let finCol = finCornerCol else { continue }
                    let elimCol = xCols.first { $0 != finCol }!
                    // Eliminations: cells in elimCol, in the same box as the
                    // fin cells (so they see the fin), excluding rows clean.row
                    // and finned.row.
                    let finBoxRow = finned.row / 3
                    var eliminators: [(row: Int, col: Int)] = []
                    for r in (finBoxRow * 3)..<(finBoxRow * 3 + 3) {
                        if r == clean.row || r == finned.row { continue }
                        let pos = (r, elimCol)
                        guard cells[r][elimCol].value == nil else { continue }
                        guard cells[r][elimCol].notes.contains(digit) else { continue }
                        eliminators.append(pos)
                    }
                    guard !eliminators.isEmpty else { continue }
                    return buildFinnedXWing(
                        digit: digit,
                        cleanRow: clean.row, finnedRow: finned.row,
                        finCol: finCol, elimCol: elimCol,
                        fin: fin,
                        eliminators: eliminators
                    )
                }
            }
        }
        return nil
    }

    private static func buildFinnedXWing(
        digit: Int,
        cleanRow: Int, finnedRow: Int,
        finCol: Int, elimCol: Int,
        fin: [(row: Int, col: Int)],
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let cleanFinHL = TutorHighlight(row: cleanRow, col: finCol, kind: .target, candidates: [digit])
        let cleanElimHL = TutorHighlight(row: cleanRow, col: elimCol, kind: .target, candidates: [digit])
        let finnedFinHL = TutorHighlight(row: finnedRow, col: finCol, kind: .target, candidates: [digit])
        let finnedElimHL = TutorHighlight(row: finnedRow, col: elimCol, kind: .target, candidates: [digit])
        let finHLs = fin.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus, candidates: [digit]) }
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit]) }
        return TutorHint(
            technique: .finnedXWing,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit]) },
            steps: [
                TutorStep(
                    narration: "Almost an X-Wing on \(digit) — but one row has extra candidate cells (the 'fin'), all in the same box as one corner.",
                    highlights: [cleanFinHL, cleanElimHL, finnedFinHL, finnedElimHL] + finHLs
                ),
                TutorStep(
                    narration: "Either the X-Wing fires (eliminating \(digit) from the other column elsewhere), or the fin holds \(digit). Either way, cells in the other column that share the fin's box can't be \(digit).",
                    highlights: [finnedFinHL, finnedElimHL] + finHLs + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - Finned Swordfish
    //
    // Same idea as Finned X-Wing but at 3×3 scale. Two "clean" rows have
    // exactly 2-3 candidate cells each in three shared columns; a third
    // "finned" row has the corner cells plus fin cells confined to one
    // box. Eliminations: cells in the third column (the one the fin
    // touches less) within the fin's box. Conservative implementation:
    // we require the finned row's fin cells to all lie in the same box
    // as one of its swordfish corners.
    static func findFinnedSwordfish(cells: [[Cell]]) -> TutorHint? {
        for digit in 1...9 {
            var rowCands: [(row: Int, cols: [Int])] = []
            for r in 0..<9 {
                let cs = (0..<9).filter { c in
                    cells[r][c].value == nil && cells[r][c].notes.contains(digit)
                }
                if cs.count >= 2 && cs.count <= 6 { rowCands.append((r, cs)) }
            }
            // Try every triple of rows; one is the finned row, the other
            // two are clean.
            for finnedIdx in 0..<rowCands.count {
                for i in 0..<rowCands.count where i != finnedIdx {
                    for j in (i + 1)..<rowCands.count where j != finnedIdx {
                        let finned = rowCands[finnedIdx]
                        let r1 = rowCands[i]
                        let r2 = rowCands[j]
                        // Clean rows have ≤ 3 candidate columns.
                        if r1.cols.count > 3 || r2.cols.count > 3 { continue }
                        // Their columns combined must form exactly 3 columns.
                        let cleanCols = Set(r1.cols + r2.cols)
                        guard cleanCols.count == 3 else { continue }
                        // The finned row must contain all 3 swordfish cols + fin extras.
                        guard cleanCols.allSatisfy(finned.cols.contains) else { continue }
                        let fin = finned.cols.filter { !cleanCols.contains($0) }.map { (finned.row, $0) }
                        guard !fin.isEmpty else { continue }
                        // Fin must be confined to a single box, AND that box
                        // must align with one of the swordfish columns in the
                        // finned row.
                        let finBoxCols = Set(fin.map { $0.1 / 3 })
                        guard finBoxCols.count == 1, let finBoxCol = finBoxCols.first else { continue }
                        let alignedCol = cleanCols.first { $0 / 3 == finBoxCol }
                        guard let finCornerCol = alignedCol else { continue }
                        // The "elimination columns" are the other two clean cols.
                        let elimCols = cleanCols.filter { $0 != finCornerCol }
                        // Eliminations: cells in elimCols, in the same box as
                        // the fin (so they see all fin cells), excluding the
                        // three swordfish rows.
                        let finBoxRow = finned.row / 3
                        let swordfishRows: Set<Int> = [finned.row, r1.row, r2.row]
                        var eliminators: [(row: Int, col: Int)] = []
                        for elimCol in elimCols {
                            for r in (finBoxRow * 3)..<(finBoxRow * 3 + 3) {
                                if swordfishRows.contains(r) { continue }
                                guard cells[r][elimCol].value == nil else { continue }
                                guard cells[r][elimCol].notes.contains(digit) else { continue }
                                eliminators.append((r, elimCol))
                            }
                        }
                        guard !eliminators.isEmpty else { continue }
                        return buildFinnedSwordfish(
                            digit: digit,
                            rows: [r1.row, r2.row, finned.row],
                            cols: cleanCols.sorted(),
                            fin: fin,
                            eliminators: eliminators
                        )
                    }
                }
            }
        }
        return nil
    }

    private static func buildFinnedSwordfish(
        digit: Int,
        rows: [Int],
        cols: [Int],
        fin: [(row: Int, col: Int)],
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        var cornerHLs: [TutorHighlight] = []
        for r in rows {
            for c in cols {
                cornerHLs.append(TutorHighlight(row: r, col: c, kind: .target, candidates: [digit]))
            }
        }
        let finHLs = fin.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus, candidates: [digit]) }
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit]) }
        return TutorHint(
            technique: .finnedSwordfish,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit]) },
            steps: [
                TutorStep(
                    narration: "Almost a Swordfish on \(digit) across three rows — but one row has extra candidate cells (the 'fin'), confined to one box.",
                    highlights: cornerHLs + finHLs
                ),
                TutorStep(
                    narration: "Either the Swordfish fires, eliminating \(digit) from the three columns elsewhere, or the fin takes \(digit). Either way, cells that share the fin's box and sit in the unfinned columns can't be \(digit).",
                    highlights: cornerHLs + finHLs + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    private static func buildNakedTriple(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        triple: ((row: Int, col: Int), (row: Int, col: Int), (row: Int, col: Int)),
        tripleDigits: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let digitList = tripleDigits.sorted().map(String.init).joined(separator: ", ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let tripleHLs = [triple.0, triple.1, triple.2].map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: tripleDigits)
        }
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .nakedTriple,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). These three cells together can only hold \(digitList).",
                    highlights: focus + tripleHLs
                ),
                TutorStep(
                    narration: "Together they must take \(digitList) in some order — so those digits can be ruled out everywhere else in this \(kind.label).",
                    highlights: focus + tripleHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to erase those candidates from these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Naked quad
    //
    // Four empty cells in a unit whose combined user-pencilled candidates
    // total exactly four digits. Each cell can have 2, 3, or 4 of those
    // digits — they don't all need the full set. The four digits must
    // therefore occupy these four cells in some order, so they're
    // eliminated as candidates from every other cell of the unit.

    static func findNakedQuad(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let empties = unit.filter { cells[$0.row][$0.col].value == nil }
            // Eligible cells: 2-, 3-, or 4-mark cells where user's pencilled
            // candidates are a valid subset of engine candidates. Trust
            // user-applied eliminations from prior techniques.
            let eligible = empties.filter { pos in
                let notes = cells[pos.row][pos.col].notes
                guard (2...4).contains(notes.count) else { return false }
                return notes.isSubset(of: candidates(row: pos.row, col: pos.col, cells: cells))
            }
            guard eligible.count >= 4 else { continue }

            for i in 0..<eligible.count {
                for j in (i + 1)..<eligible.count {
                    for k in (j + 1)..<eligible.count {
                        for l in (k + 1)..<eligible.count {
                            let a = eligible[i]
                            let b = eligible[j]
                            let c = eligible[k]
                            let d = eligible[l]
                            let union = cells[a.row][a.col].notes
                                .union(cells[b.row][b.col].notes)
                                .union(cells[c.row][c.col].notes)
                                .union(cells[d.row][d.col].notes)
                            guard union.count == 4 else { continue }
                            var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                            for other in empties {
                                if other == a || other == b || other == c || other == d { continue }
                                let intersect = cells[other.row][other.col].notes.intersection(union)
                                if !intersect.isEmpty {
                                    eliminations.append((other, intersect))
                                }
                            }
                            guard !eliminations.isEmpty else { continue }
                            return buildNakedQuad(
                                unit: unit,
                                kind: kind,
                                quad: (a, b, c, d),
                                quadDigits: union,
                                eliminations: eliminations
                            )
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func buildNakedQuad(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        quad: ((row: Int, col: Int), (row: Int, col: Int), (row: Int, col: Int), (row: Int, col: Int)),
        quadDigits: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let digitList = quadDigits.sorted().map(String.init).joined(separator: ", ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let quadHLs = [quad.0, quad.1, quad.2, quad.3].map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: quadDigits)
        }
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .nakedQuad,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). These four cells together can only hold \(digitList).",
                    highlights: focus + quadHLs
                ),
                TutorStep(
                    narration: "Together they must take \(digitList) in some order — so those digits can be ruled out everywhere else in this \(kind.label).",
                    highlights: focus + quadHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to erase those candidates from these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Hidden quad
    //
    // Within a unit, four missing digits can each only land in (a subset of)
    // the same four cells. Those four cells must therefore hold those four
    // digits in some order, so every other candidate in those cells can be
    // eliminated. Direct extension of Hidden Triple to four.

    static func findHiddenQuad(cells: [[Cell]]) -> TutorHint? {
        let units: [(kind: UnitKind, cells: [(row: Int, col: Int)])] = (0..<9).map { ( .row($0), unitCells(.row($0)) ) }
            + (0..<9).map { ( .column($0), unitCells(.column($0)) ) }
            + (0..<3).flatMap { br in (0..<3).map { bc in (UnitKind.box(rowBlock: br, colBlock: bc), unitCells(.box(rowBlock: br, colBlock: bc))) } }

        for (kind, unit) in units {
            let unitValues = Set(unit.compactMap { cells[$0.row][$0.col].value })
            let missing = Array(Set(1...9).subtracting(unitValues)).sorted()
            guard missing.count >= 4 else { continue }

            // Engine view of where each missing digit could go in this unit.
            // Only digits with 2-4 candidate cells can participate.
            var digitCells: [Int: Set<CellPos>] = [:]
            for d in missing {
                let candCells = unit.filter {
                    cells[$0.row][$0.col].value == nil
                        && candidates(row: $0.row, col: $0.col, cells: cells).contains(d)
                }
                if (2...4).contains(candCells.count) {
                    digitCells[d] = Set(candCells.map { CellPos($0) })
                }
            }
            let eligible = digitCells.keys.sorted()
            guard eligible.count >= 4 else { continue }

            for i in 0..<eligible.count {
                for j in (i + 1)..<eligible.count {
                    for k in (j + 1)..<eligible.count {
                        for l in (k + 1)..<eligible.count {
                            let a = eligible[i]
                            let b = eligible[j]
                            let c = eligible[k]
                            let d = eligible[l]
                            let union = digitCells[a]!
                                .union(digitCells[b]!)
                                .union(digitCells[c]!)
                                .union(digitCells[d]!)
                            guard union.count == 4 else { continue }

                            // Validation: user's pencilled cells for each of
                            // the four digits in the unit match engine
                            // candidates exactly — keeps the tutor honest
                            // and the user un-spoiled.
                            let quadrant = [a, b, c, d]
                            let valid = quadrant.allSatisfy { dig in
                                let userCells = Set(unit.compactMap { pos -> CellPos? in
                                    cells[pos.row][pos.col].notes.contains(dig) ? CellPos(pos) : nil
                                })
                                return userCells == digitCells[dig]!
                            }
                            guard valid else { continue }

                            // Eliminations: any candidate currently pencilled
                            // in the four quad cells that isn't one of {a,b,c,d}.
                            let quadDigits: Set<Int> = [a, b, c, d]
                            let quadCells = union.sorted { lhs, rhs in
                                (lhs.row, lhs.col) < (rhs.row, rhs.col)
                            }
                            var eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)] = []
                            for pos in quadCells {
                                let extras = cells[pos.row][pos.col].notes.subtracting(quadDigits)
                                if !extras.isEmpty {
                                    eliminations.append(((pos.row, pos.col), extras))
                                }
                            }
                            guard !eliminations.isEmpty else { continue }

                            return buildHiddenQuad(
                                unit: unit,
                                kind: kind,
                                quadCells: quadCells.map { ($0.row, $0.col) },
                                quadDigits: quadDigits,
                                eliminations: eliminations
                            )
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func buildHiddenQuad(
        unit: [(row: Int, col: Int)],
        kind: UnitKind,
        quadCells: [(row: Int, col: Int)],
        quadDigits: Set<Int>,
        eliminations: [(pos: (row: Int, col: Int), removed: Set<Int>)]
    ) -> TutorHint {
        let digitList = quadDigits.sorted().map(String.init).joined(separator: ", ")
        let focus = unit.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus) }
        let quadTargetHLs = quadCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: quadDigits)
        }
        let eliminatorHLs = eliminations.map {
            TutorHighlight(row: $0.pos.row, col: $0.pos.col, kind: .eliminator, candidates: $0.removed)
        }

        return TutorHint(
            technique: .hiddenQuad,
            placement: nil,
            eliminations: eliminations.map {
                TutorHint.Elimination(row: $0.pos.row, col: $0.pos.col, candidates: $0.removed)
            },
            steps: [
                TutorStep(
                    narration: "Look at this \(kind.label). The digits \(digitList) can only land in the same four cells.",
                    highlights: focus
                ),
                TutorStep(
                    narration: "Since these four cells must hold \(digitList) in some order, no other digit can go in any of them.",
                    highlights: focus + quadTargetHLs
                ),
                TutorStep(
                    narration: "The other candidates in those cells can be eliminated — only \(digitList) remains.",
                    highlights: quadTargetHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to clear those candidates.",
                    highlights: quadTargetHLs + eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Jellyfish
    //
    // Generalisation of X-Wing / Swordfish to four rows × four columns.
    // A digit `d` appears in 2-3-or-4 candidate cells in four different
    // rows (or columns), and across them the cells lie in only four
    // distinct columns (or rows). The digit must therefore occupy four of
    // those sixteen intersections (one per row, one per column), so `d` is
    // eliminated from those four columns (or rows) in every other line.

    static func findJellyfish(cells: [[Cell]]) -> TutorHint? {
        for d in 1...9 {
            if let h = jellyfishFor(digit: d, orientation: .rows, cells: cells) { return h }
            if let h = jellyfishFor(digit: d, orientation: .columns, cells: cells) { return h }
        }
        return nil
    }

    private static func jellyfishFor(digit d: Int, orientation: XWingOrientation, cells: [[Cell]]) -> TutorHint? {
        var lineCross: [Int: Set<Int>] = [:]
        for primary in 0..<9 {
            if (0..<9).contains(where: { other in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                return cells[row][col].value == d
            }) { continue }

            let engineCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return candidates(row: row, col: col, cells: cells).contains(d)
            }
            let userCross = (0..<9).filter { other -> Bool in
                let row = orientation == .rows ? primary : other
                let col = orientation == .rows ? other : primary
                guard cells[row][col].value == nil else { return false }
                return cells[row][col].notes.contains(d)
            }
            // Jellyfish lines have 2, 3, or 4 candidate cells.
            if (2...4).contains(engineCross.count) && Set(engineCross) == Set(userCross) {
                lineCross[primary] = Set(engineCross)
            }
        }

        let lines = lineCross.keys.sorted()
        guard lines.count >= 4 else { return nil }

        for i in 0..<(lines.count - 3) {
            for j in (i + 1)..<(lines.count - 2) {
                for k in (j + 1)..<(lines.count - 1) {
                    for m in (k + 1)..<lines.count {
                        let l1 = lines[i]; let l2 = lines[j]; let l3 = lines[k]; let l4 = lines[m]
                        let union = lineCross[l1]!
                            .union(lineCross[l2]!)
                            .union(lineCross[l3]!)
                            .union(lineCross[l4]!)
                        guard union.count == 4 else { continue }
                        let crossArr = union.sorted()

                        var eliminators: [(row: Int, col: Int)] = []
                        for primary in 0..<9 where primary != l1 && primary != l2 && primary != l3 && primary != l4 {
                            for cross in crossArr {
                                let row = orientation == .rows ? primary : cross
                                let col = orientation == .rows ? cross : primary
                                if cells[row][col].value == nil && cells[row][col].notes.contains(d) {
                                    eliminators.append((row, col))
                                }
                            }
                        }
                        guard !eliminators.isEmpty else { continue }

                        var candidateCells: [(row: Int, col: Int)] = []
                        for l in [l1, l2, l3, l4] {
                            for c in lineCross[l]! {
                                switch orientation {
                                case .rows: candidateCells.append((l, c))
                                case .columns: candidateCells.append((c, l))
                                }
                            }
                        }
                        return buildJellyfish(
                            orientation: orientation,
                            lines: (l1, l2, l3, l4),
                            cross: (crossArr[0], crossArr[1], crossArr[2], crossArr[3]),
                            digit: d,
                            candidateCells: candidateCells,
                            eliminators: eliminators
                        )
                    }
                }
            }
        }
        return nil
    }

    private static func buildJellyfish(
        orientation: XWingOrientation,
        lines: (Int, Int, Int, Int),
        cross: (Int, Int, Int, Int),
        digit: Int,
        candidateCells: [(row: Int, col: Int)],
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let lineLabel: String
        let crossLabel: String
        switch orientation {
        case .rows:
            lineLabel = "rows"
            crossLabel = "columns"
        case .columns:
            lineLabel = "columns"
            crossLabel = "rows"
        }

        let lineList = [lines.0, lines.1, lines.2, lines.3]
        let crossList = [cross.0, cross.1, cross.2, cross.3]
        let intersections: [(row: Int, col: Int)] = lineList.flatMap { l in
            crossList.map { c -> (row: Int, col: Int) in
                switch orientation {
                case .rows: return (l, c)
                case .columns: return (c, l)
                }
            }
        }
        let lineFocus = intersections.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .focus)
        }
        let candidateHLs = candidateCells.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [digit])
        }
        let eliminatorHLs = eliminators.map {
            TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [digit])
        }

        return TutorHint(
            technique: .jellyfish,
            placement: nil,
            eliminations: eliminators.map {
                TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [digit])
            },
            steps: [
                TutorStep(
                    narration: "Look at these four \(lineLabel). The digit \(digit) can only land in the same four \(crossLabel) across all of them.",
                    highlights: lineFocus + candidateHLs
                ),
                TutorStep(
                    narration: "\(digit) must take one cell in each \(lineLabel.dropLast()) — and within those four \(crossLabel). So \(digit) can't appear in those \(crossLabel) anywhere else.",
                    highlights: candidateHLs + eliminatorHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(digit) off these cells.",
                    highlights: eliminatorHLs
                )
            ]
        )
    }

    // MARK: - Unique Rectangle
    //
    // Exploits the puzzle's guarantee of a unique solution. A 2×2 rectangle
    // of empty cells spanning at least two 3×3 boxes, where all four corners
    // hold the same two candidates X and Y, would allow two valid solutions
    // (swap X↔Y throughout the rectangle). Since the puzzle is unique, that
    // "deadly pattern" cannot exist.
    //
    // Type 1 — three bivalue {X,Y} corners, one roof with extra candidates:
    //   The roof must use an extra candidate to break the deadly pattern, so
    //   X and Y are both eliminated from it.
    //
    // Type 2 — two bivalue {X,Y} corners, two roofs each with exactly one
    //   extra candidate Z (the same Z): one roof must take Z. Any cell that
    //   sees both roofs can't be Z.
    //
    // Type 4 — two bivalue {X,Y} corners sharing a row or column (floors),
    //   two roofs sharing the other row or column; within the roof line one of
    //   X/Y is locked — only the roof cells hold it. The other digit is
    //   eliminated from both roofs to avoid recreating the deadly pattern.

    static func findUniqueRectangle(cells: [[Cell]]) -> TutorHint? {
        for r1 in 0..<8 {
            for r2 in (r1 + 1)..<9 {
                for c1 in 0..<8 {
                    for c2 in (c1 + 1)..<9 {
                        // Rectangle must span at least two boxes.
                        if r1 / 3 == r2 / 3 && c1 / 3 == c2 / 3 { continue }
                        let corners: [(row: Int, col: Int)] = [(r1, c1), (r1, c2), (r2, c1), (r2, c2)]
                        if corners.contains(where: { cells[$0.row][$0.col].value != nil }) { continue }

                        let engineCands = corners.map { candidates(row: $0.row, col: $0.col, cells: cells) }
                        let common = engineCands.dropFirst().reduce(engineCands[0]) { $0.intersection($1) }
                        if common.count < 2 { continue }

                        let commonArr = common.sorted()
                        for xi in commonArr.indices {
                            for yi in (xi + 1)..<commonArr.count {
                                let x = commonArr[xi]
                                let y = commonArr[yi]
                                let xy: Set<Int> = [x, y]

                                var bivCorners: [(row: Int, col: Int)] = []
                                var roofCorners: [(row: Int, col: Int)] = []
                                var allVisible = true
                                for pos in corners {
                                    let notes = cells[pos.row][pos.col].notes
                                    if !notes.isSuperset(of: xy) { allVisible = false; break }
                                    if notes == xy { bivCorners.append(pos) } else { roofCorners.append(pos) }
                                }
                                if !allVisible { continue }

                                // Type 1: three bivalue corners, one roof.
                                if bivCorners.count == 3 && roofCorners.count == 1 {
                                    let roof = roofCorners[0]
                                    let removed = cells[roof.row][roof.col].notes.intersection(xy)
                                    if removed.isEmpty { continue }
                                    return buildURType1(x: x, y: y, bivalue: bivCorners, roof: roof,
                                                        roofNotes: cells[roof.row][roof.col].notes, removed: removed)
                                }

                                if bivCorners.count != 2 || roofCorners.count != 2 { continue }

                                // Type 2: both roofs have exactly one extra, the same digit Z.
                                let extras0 = cells[roofCorners[0].row][roofCorners[0].col].notes.subtracting(xy)
                                let extras1 = cells[roofCorners[1].row][roofCorners[1].col].notes.subtracting(xy)
                                if extras0.count == 1 && extras1.count == 1 && extras0 == extras1 {
                                    let z = extras0.first!
                                    var eliminators: [(row: Int, col: Int)] = []
                                    for r in 0..<9 {
                                        for c in 0..<9 {
                                            let pos = (r, c)
                                            if cells[r][c].value != nil { continue }
                                            if pos == roofCorners[0] || pos == roofCorners[1] { continue }
                                            if sees(pos, roofCorners[0]) && sees(pos, roofCorners[1]) {
                                                if cells[r][c].notes.contains(z) { eliminators.append(pos) }
                                            }
                                        }
                                    }
                                    if !eliminators.isEmpty {
                                        return buildURType2(x: x, y: y, z: z,
                                                            bivalue: bivCorners, roofs: roofCorners,
                                                            eliminators: eliminators)
                                    }
                                }

                                // Type 4: roofs share a line; one of X/Y locked to roof cells there.
                                if let hint = findURType4(x: x, y: y, xy: xy,
                                                          bivalue: bivCorners, roofs: roofCorners,
                                                          cells: cells) {
                                    return hint
                                }
                            }
                        }
                    }
                }
            }
        }
        return nil
    }

    private static func findURType4(
        x: Int, y: Int, xy: Set<Int>,
        bivalue: [(row: Int, col: Int)],
        roofs: [(row: Int, col: Int)],
        cells: [[Cell]]
    ) -> TutorHint? {
        let roof0 = roofs[0]
        let roof1 = roofs[1]
        let sharedRow: Bool
        if roof0.row == roof1.row {
            sharedRow = true
        } else if roof0.col == roof1.col {
            sharedRow = false
        } else {
            return nil
        }

        for (locked, eliminated) in [(x, y), (y, x)] {
            var lockedPositions = Set<Int>()
            for idx in 0..<9 {
                let r = sharedRow ? roof0.row : idx
                let c = sharedRow ? idx : roof0.col
                if cells[r][c].value == nil && candidates(row: r, col: c, cells: cells).contains(locked) {
                    lockedPositions.insert(idx)
                }
            }
            let roofIndices: Set<Int> = [
                sharedRow ? roof0.col : roof0.row,
                sharedRow ? roof1.col : roof1.row
            ]
            if lockedPositions != roofIndices { continue }

            let eliminations = roofs.filter { cells[$0.row][$0.col].notes.contains(eliminated) }
            if eliminations.isEmpty { continue }

            return buildURType4(x: x, y: y, lockedDigit: locked, eliminatedDigit: eliminated,
                                bivalue: bivalue, roofs: roofs,
                                roofLineKind: sharedRow ? "row" : "column",
                                elimRoofs: eliminations)
        }
        return nil
    }

    private static func buildURType1(
        x: Int, y: Int,
        bivalue: [(row: Int, col: Int)],
        roof: (row: Int, col: Int),
        roofNotes: Set<Int>,
        removed: Set<Int>
    ) -> TutorHint {
        let xyStr = [x, y].sorted().map(String.init).joined(separator: " and ")
        let bivHLs = bivalue.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus, candidates: [x, y]) }
        let roofHL = TutorHighlight(row: roof.row, col: roof.col, kind: .target, candidates: roofNotes)
        let elimHL = TutorHighlight(row: roof.row, col: roof.col, kind: .eliminator, candidates: removed)
        return TutorHint(
            technique: .uniqueRectangle,
            placement: nil,
            eliminations: [TutorHint.Elimination(row: roof.row, col: roof.col, candidates: removed)],
            steps: [
                TutorStep(
                    narration: "These four cells form a rectangle spanning two boxes. Three corners hold only \(xyStr).",
                    highlights: bivHLs + [roofHL]
                ),
                TutorStep(
                    narration: "If the fourth also held only \(xyStr), the rectangle could swap them — creating two solutions. Since this puzzle has a unique solution, \(xyStr) must be ruled out from the fourth cell.",
                    highlights: bivHLs + [roofHL, elimHL]
                ),
                TutorStep(
                    narration: "Tap Got it to remove \(xyStr) from that cell.",
                    highlights: [elimHL]
                )
            ]
        )
    }

    private static func buildURType2(
        x: Int, y: Int, z: Int,
        bivalue: [(row: Int, col: Int)],
        roofs: [(row: Int, col: Int)],
        eliminators: [(row: Int, col: Int)]
    ) -> TutorHint {
        let xyStr = [x, y].sorted().map(String.init).joined(separator: " and ")
        let bivHLs = bivalue.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus, candidates: [x, y]) }
        let roofHLs = roofs.map { TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [x, y, z]) }
        let elimHLs = eliminators.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [z]) }
        return TutorHint(
            technique: .uniqueRectangle,
            placement: nil,
            eliminations: eliminators.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [z]) },
            steps: [
                TutorStep(
                    narration: "Two corners of this rectangle hold only \(xyStr). The other two each carry one extra candidate: \(z).",
                    highlights: bivHLs + roofHLs
                ),
                TutorStep(
                    narration: "One of those two cells must take \(z) to break the deadly rectangle. Any cell that sees both of them can't be \(z).",
                    highlights: bivHLs + roofHLs + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(z) off those cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    private static func buildURType4(
        x: Int, y: Int,
        lockedDigit: Int, eliminatedDigit: Int,
        bivalue: [(row: Int, col: Int)],
        roofs: [(row: Int, col: Int)],
        roofLineKind: String,
        elimRoofs: [(row: Int, col: Int)]
    ) -> TutorHint {
        let xyStr = [x, y].sorted().map(String.init).joined(separator: " and ")
        let bivHLs = bivalue.map { TutorHighlight(row: $0.row, col: $0.col, kind: .focus, candidates: [x, y]) }
        let roofHLs = roofs.map { TutorHighlight(row: $0.row, col: $0.col, kind: .target, candidates: [lockedDigit, eliminatedDigit]) }
        let elimHLs = elimRoofs.map { TutorHighlight(row: $0.row, col: $0.col, kind: .eliminator, candidates: [eliminatedDigit]) }
        return TutorHint(
            technique: .uniqueRectangle,
            placement: nil,
            eliminations: elimRoofs.map { TutorHint.Elimination(row: $0.row, col: $0.col, candidates: [eliminatedDigit]) },
            steps: [
                TutorStep(
                    narration: "Two corners of this rectangle hold only \(xyStr). In the \(roofLineKind) containing the other two, \(lockedDigit) can only go in those two cells.",
                    highlights: bivHLs + roofHLs
                ),
                TutorStep(
                    narration: "Since \(lockedDigit) is locked into those cells, placing \(eliminatedDigit) in either of them would recreate the deadly swappable pattern. So \(eliminatedDigit) is ruled out from both.",
                    highlights: bivHLs + roofHLs + elimHLs
                ),
                TutorStep(
                    narration: "Tap Got it to cross \(eliminatedDigit) off those cells.",
                    highlights: elimHLs
                )
            ]
        )
    }

    // MARK: - Helpers

    private static func unitCells(_ kind: UnitKind) -> [(row: Int, col: Int)] {
        switch kind {
        case .row(let r):
            return (0..<9).map { (r, $0) }
        case .column(let c):
            return (0..<9).map { ($0, c) }
        case .box(let br, let bc):
            var out: [(Int, Int)] = []
            for r in (br*3)..<(br*3+3) {
                for c in (bc*3)..<(bc*3+3) {
                    out.append((r, c))
                }
            }
            return out
        }
    }

    private static func contains(unit: [(row: Int, col: Int)], _ cell: (row: Int, col: Int)) -> Bool {
        unit.contains(where: { $0 == cell })
    }

    private static func candidates(row: Int, col: Int, cells: [[Cell]]) -> Set<Int> {
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

    private static func peers(row: Int, col: Int) -> [(row: Int, col: Int)] {
        var out: [(Int, Int)] = []
        for c in 0..<9 where c != col { out.append((row, c)) }
        for r in 0..<9 where r != row { out.append((r, col)) }
        let boxR = (row / 3) * 3
        let boxC = (col / 3) * 3
        for r in boxR..<boxR + 3 {
            for c in boxC..<boxC + 3 where r != row && c != col {
                out.append((r, c))
            }
        }
        return out
    }

    private static func peerValues(row: Int, col: Int, cells: [[Cell]]) -> Set<Int> {
        var out = Set<Int>()
        for peer in peers(row: row, col: col) {
            if let v = cells[peer.row][peer.col].value { out.insert(v) }
        }
        return out
    }
}

private func == (lhs: (row: Int, col: Int), rhs: (row: Int, col: Int)) -> Bool {
    lhs.row == rhs.row && lhs.col == rhs.col
}
