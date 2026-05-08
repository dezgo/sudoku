//
//  TutorTests.swift
//  SudokuTests
//

import Testing
@testable import Sudoku

/// Engine tests for `TutorEngine`. Hand-crafted boards verify each
/// technique's detection logic so adding a new technique can't silently
/// break the others.
struct TutorTests {

    // MARK: - Helpers

    /// Build a 9×9 cells array from a compact int grid. 0 = empty (not
    /// fixed); 1–9 = a given (`isFixed = true`).
    private func makeCells(_ grid: [[Int]]) -> [[Cell]] {
        precondition(grid.count == 9, "grid must have 9 rows")
        return grid.map { row in
            precondition(row.count == 9, "each row must have 9 columns")
            return row.map { v in
                if v == 0 { return Cell(value: nil, isFixed: false, notes: []) }
                return Cell(value: v, isFixed: true, notes: [])
            }
        }
    }

    /// Auto-pencil: for each empty cell, set notes to engine-derived
    /// candidates. Mirrors `SudokuGame.autoPencil` for empty cells. Used
    /// when a technique requires user pencil marks (pair / pointing / wing
    /// / triple).
    private func autoPencil(_ cells: [[Cell]]) -> [[Cell]] {
        var result = cells
        for r in 0..<9 {
            for c in 0..<9 {
                guard result[r][c].value == nil else { continue }
                result[r][c].notes = candidatesForCell(row: r, col: c, cells: result)
            }
        }
        return result
    }

    private func candidatesForCell(row: Int, col: Int, cells: [[Cell]]) -> Set<Int> {
        var cands: Set<Int> = Set(1...9)
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

    private static let emptyRow: [Int] = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    private static let emptyGrid: [[Int]] = Array(repeating: emptyRow, count: 9)

    // MARK: - Naked Single

    @Test func nakedSingle_lastDigitInRow() {
        // Row 0 has 1–8 placed; cell (0, 8) must be 9.
        var grid = Self.emptyGrid
        grid[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0]
        let cells = makeCells(grid)
        let hint = TutorEngine.findHint(cells: cells)
        #expect(hint?.technique == .nakedSingle)
        #expect(hint?.placement?.row == 0)
        #expect(hint?.placement?.col == 8)
        #expect(hint?.placement?.value == 9)
        #expect(hint?.eliminations.isEmpty == true)
    }

    // MARK: - Hidden Single

    @Test func hiddenSingle_inBox() {
        // Box 0 has 1, 2, 3, 4, 6, 7 placed (missing 5, 8, 9 across cells
        // (1,1), (1,2), (2,2)). Place 5 in column 2 outside the box at
        // (8, 2) so 5 is blocked from (1,2) and (2,2) — leaving (1,1) as
        // the only spot for 5 within box 0. (1,1) also accepts 8 and 9, so
        // it isn't a naked single — hidden single fires first.
        var grid = Self.emptyGrid
        grid[0][0] = 1; grid[0][1] = 2; grid[0][2] = 3
        grid[1][0] = 4
        grid[2][0] = 6; grid[2][1] = 7
        grid[8][2] = 5
        let cells = makeCells(grid)
        let hint = TutorEngine.findHint(cells: cells)
        #expect(hint?.technique == .hiddenSingle)
        #expect(hint?.placement?.row == 1)
        #expect(hint?.placement?.col == 1)
        #expect(hint?.placement?.value == 5)
    }

    // MARK: - Naked Pair

    @Test func nakedPair_inRow() {
        // Construct a row where two cells are bivalue {1, 2} and TWO other
        // empty cells in the row hold {1, 2, 3, 4} — so:
        //   - {3, 4} each have ≥2 candidate cells in row 0 (no hidden single)
        //   - {1, 2} each have multiple candidate cells (no hidden single)
        //   - Naked pair {1,2} on the two bivalue cells eliminates 1, 2
        //     from the other empties.
        //
        // Layout: row 0 = [_, _, _, _, 5, 6, 7, 8, 9] — empties at
        // cols 0..3 with row-0 missing = {1, 2, 3, 4}. We block 3 and 4
        // from cols 0 and 1 by placing them in those columns outside box 0.
        var grid = Self.emptyGrid
        grid[0] = [0, 0, 0, 0, 5, 6, 7, 8, 9]
        // Block 3 from cols 0 and 1 (outside box 0).
        grid[3][0] = 3
        grid[6][1] = 3
        // Block 4 from cols 0 and 1 (outside box 0).
        grid[6][0] = 4
        grid[3][1] = 4
        var cells = autoPencil(makeCells(grid))

        // Sanity-check the candidate setup.
        #expect(cells[0][0].notes == Set([1, 2]))
        #expect(cells[0][1].notes == Set([1, 2]))
        #expect(cells[0][2].notes == Set([1, 2, 3, 4]))
        #expect(cells[0][3].notes == Set([1, 2, 3, 4]))

        let hint = TutorEngine.findHint(cells: cells)
        #expect(hint?.technique == .nakedPair)
        #expect(hint?.placement == nil)
        // Eliminations should remove {1, 2} from (0,2) and (0,3).
        let elim02 = hint?.eliminations.first { $0.row == 0 && $0.col == 2 }
        let elim03 = hint?.eliminations.first { $0.row == 0 && $0.col == 3 }
        #expect(elim02?.candidates == Set([1, 2]))
        #expect(elim03?.candidates == Set([1, 2]))
    }

    // MARK: - Smoke tests

    @Test func returnsNil_whenSolved() {
        // A trivially "solved" 9×9 (all cells filled with valid digits).
        let solved: [[Int]] = [
            [5,3,4,6,7,8,9,1,2],
            [6,7,2,1,9,5,3,4,8],
            [1,9,8,3,4,2,5,6,7],
            [8,5,9,7,6,1,4,2,3],
            [4,2,6,8,5,3,7,9,1],
            [7,1,3,9,2,4,8,5,6],
            [9,6,1,5,3,7,2,8,4],
            [2,8,7,4,1,9,6,3,5],
            [3,4,5,2,8,6,1,7,9]
        ]
        let cells = makeCells(solved)
        let hint = TutorEngine.findHint(cells: cells)
        #expect(hint == nil)
    }

    @Test func returnsNil_whenEmptyBoard() {
        // Empty board has every digit as a candidate everywhere — no
        // single technique applies cleanly (nothing constrains anything).
        let cells = makeCells(Self.emptyGrid)
        let hint = TutorEngine.findHint(cells: cells)
        #expect(hint == nil)
    }

    // MARK: - Pointing Pair

    @Test func pointingPair_inBox() {
        // Box 0 (rows 0-2, cols 0-2) has digits 4-9 placed in rows 1-2;
        // row 0 cells (0,0)-(0,2) are empty. Box 0 missing = {1, 2, 3}.
        // Each missing digit can only land in row 0 within box 0 → pointing
        // pair pattern. Pick digit 1 (first missing). Eliminators are row 0
        // outside box 0 = (0,3)..(0,8), all of which have 1 as candidate.
        var grid = Self.emptyGrid
        grid[1] = [4, 5, 6, 0, 0, 0, 0, 0, 0]
        grid[2] = [7, 8, 9, 0, 0, 0, 0, 0, 0]
        let cells = autoPencil(makeCells(grid))

        // Sanity
        #expect(cells[0][0].notes == Set([1, 2, 3]))

        let hint = TutorEngine.findPointingPair(cells: cells)
        #expect(hint?.technique == .pointingPair)
        #expect(hint?.placement == nil)
        #expect(hint?.eliminations.count == 6)
        #expect(hint?.eliminations.allSatisfy { $0.row == 0 && $0.col >= 3 } == true)
        #expect(hint?.eliminations.allSatisfy { $0.candidates == Set([1]) } == true)
    }

    // MARK: - Box-Line Reduction

    @Test func boxLineReduction_rowToBox() {
        // Row 0 has 4-9 placed in cols 3-8; cells (0,0)-(0,2) empty. Row 0
        // missing = {1, 2, 3}, all of which can only land in box 0 cells
        // within row 0. Pick digit 1. Eliminators are box 0 cells outside
        // row 0 = (1,0)..(2,2), all of which have 1 in user marks.
        var grid = Self.emptyGrid
        grid[0] = [0, 0, 0, 4, 5, 6, 7, 8, 9]
        let cells = autoPencil(makeCells(grid))

        #expect(cells[0][0].notes == Set([1, 2, 3]))

        let hint = TutorEngine.findBoxLineReduction(cells: cells)
        #expect(hint?.technique == .boxLineReduction)
        #expect(hint?.placement == nil)
        #expect(hint?.eliminations.count == 6)
        #expect(hint?.eliminations.allSatisfy { $0.row >= 1 && $0.row <= 2 && $0.col <= 2 } == true)
        #expect(hint?.eliminations.allSatisfy { $0.candidates == Set([1]) } == true)
    }

    // MARK: - Hidden Pair

    @Test func hiddenPair_inRow() {
        // Construct row 0 such that digits 1 and 2 can only land at (0,0)
        // and (0,1) — but (0,0) and (0,1) also accept 3, 4, 5 (so it's
        // hidden pair, not naked pair). Block 1 and 2 from (0,2)-(0,4) via
        // box-1 placement (1, 2 inside box 1) and column-2 placement (1, 2
        // in col 2). Avoid an incidental box-line on 1 from row 0 to box 0
        // by filling box 0 row 1 with values that block 1 from row 1.
        var grid = Self.emptyGrid
        grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9]
        grid[1][5] = 1            // box 1 has 1 → blocks 1 from (0,3),(0,4)
        grid[1][6] = 2            // row 1 has 2 → blocks 2 from row 1 box 0
        grid[2][0] = 7            // fill box 0 outside row 0
        grid[2][1] = 8
        grid[2][5] = 2            // box 1 has 2 → blocks 2 from (0,3),(0,4)
        grid[3][2] = 1            // col 2 has 1 → blocks 1 from (0,2)
        grid[5][2] = 2            // col 2 has 2 → blocks 2 from (0,2)
        let cells = autoPencil(makeCells(grid))

        // Sanity: pair cells have all 5 candidates (would be naked pair if
        // they had only {1, 2}).
        #expect(cells[0][0].notes == Set([1, 2, 3, 4, 5]))
        #expect(cells[0][1].notes == Set([1, 2, 3, 4, 5]))

        let hint = TutorEngine.findHiddenPair(cells: cells)
        #expect(hint?.technique == .hiddenPair)
        #expect(hint?.placement == nil)
        let elim00 = hint?.eliminations.first { $0.row == 0 && $0.col == 0 }
        let elim01 = hint?.eliminations.first { $0.row == 0 && $0.col == 1 }
        #expect(elim00?.candidates == Set([3, 4, 5]))
        #expect(elim01?.candidates == Set([3, 4, 5]))
    }

    // MARK: - Naked Triple

    @Test func nakedTriple_inRow() {
        // Three cells in row 0 each have user pencil marks of size 2 or 3
        // matching engine candidates, with combined candidates = exactly 3
        // digits. Setup: row 0 has 6,7,8,9 placed in cols 5-8, leaving
        // (0,0)..(0,4) empty. Block 4 and 5 from (0,0), (0,1), (0,2) via
        // col placements so they're each {1, 2, 3} (or subset). Make (0,3)
        // and (0,4) include 4 or 5 in their candidates so eliminations have
        // something to remove.
        var grid = Self.emptyGrid
        grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9]
        // Block 4 from (0,0), (0,1), (0,2):
        grid[3][0] = 4
        grid[3][1] = 4   // same row 3, two 4s — invalid; use different rows
        grid[3][1] = 0
        grid[4][1] = 4
        grid[5][2] = 4
        // Block 5 from (0,0), (0,1), (0,2):
        grid[6][0] = 5
        grid[7][1] = 5
        grid[8][2] = 5
        let cells = autoPencil(makeCells(grid))

        // Sanity: (0,0)-(0,2) should each have {1, 2, 3}; (0,3),(0,4) larger.
        #expect(cells[0][0].notes == Set([1, 2, 3]))
        #expect(cells[0][1].notes == Set([1, 2, 3]))
        #expect(cells[0][2].notes == Set([1, 2, 3]))
        #expect(cells[0][3].notes.isSuperset(of: [1, 2, 3]))
        #expect(cells[0][4].notes.isSuperset(of: [1, 2, 3]))

        let hint = TutorEngine.findNakedTriple(cells: cells)
        #expect(hint?.technique == .nakedTriple)
        #expect(hint?.placement == nil)
        // Eliminations should remove {1, 2, 3} from (0,3) and (0,4).
        let elim03 = hint?.eliminations.first { $0.row == 0 && $0.col == 3 }
        let elim04 = hint?.eliminations.first { $0.row == 0 && $0.col == 4 }
        #expect(elim03?.candidates == Set([1, 2, 3]))
        #expect(elim04?.candidates == Set([1, 2, 3]))
    }

    // MARK: - Hidden Triple

    @Test func hiddenTriple_inRow() {
        // Three digits {1, 2, 3} can only land at (0,0), (0,1), (0,2) in
        // row 0 — but those cells also accept 4, 5 (hidden, not naked).
        // Layout: row 0 has 6-9 placed; (0,0)..(0,4) empty. Block 1, 2, 3
        // from (0,3) and (0,4) via box-1 / column placements. Allow 4, 5
        // at (0,0)-(0,2). Need (0,3) and (0,4) to have 4, 5 (so they're
        // not just empty) — they will, since 1,2,3 blocked but 4,5 not.
        var grid = Self.emptyGrid
        grid[0] = [0, 0, 0, 0, 0, 6, 7, 8, 9]
        // Block 1 from (0,3), (0,4): place 1 in box 1.
        grid[1][3] = 1
        // Block 2 from (0,3), (0,4): place 2 in box 1.
        grid[1][4] = 2
        // Block 3 from (0,3), (0,4): place 3 in box 1.
        grid[2][3] = 3
        let cells = autoPencil(makeCells(grid))

        // Sanity
        #expect(cells[0][0].notes == Set([1, 2, 3, 4, 5]))
        #expect(cells[0][3].notes == Set([4, 5]))
        #expect(cells[0][4].notes == Set([4, 5]))

        let hint = TutorEngine.findHiddenTriple(cells: cells)
        #expect(hint?.technique == .hiddenTriple)
        #expect(hint?.placement == nil)
        // Eliminations: (0,0), (0,1), (0,2) lose {4, 5}.
        for c in [0, 1, 2] {
            let elim = hint?.eliminations.first { $0.row == 0 && $0.col == c }
            #expect(elim?.candidates == Set([4, 5]))
        }
    }

    // MARK: - X-Wing

    @Test func xWing_onRows() {
        // Construct a board where digit 1 can only land in cols 3 and 6
        // within rows 0 and 1. Other rows must have 1 either placed or
        // pencilled in cols 3 or 6 elsewhere (for eliminations).
        //
        // Put 1 in cols 0, 1, 2, 4, 5, 7, 8 within rows 0 and 1 (block
        // those cols); leave cols 3 and 6 empty. Easiest way: place enough
        // givens in those rows to leave only those two columns open.
        var grid = Self.emptyGrid
        // Row 0: have 1 blocked from cols 0,1,2,4,5,7,8 — block via fills.
        // Easiest: put values 2,3,4 at (0,0),(0,1),(0,2); 5 at (0,4); 6 at
        // (0,5); 7 at (0,7); 8 at (0,8). Cells (0,3) and (0,6) empty.
        // Row 0 missing = {1, 9}.
        grid[0] = [2, 3, 4, 0, 5, 6, 0, 7, 8]
        grid[1] = [3, 4, 5, 0, 6, 7, 0, 8, 2]   // row 1 missing {1, 9}, same empty cols
        // We need digit 1 in rows 2-8 col 3 OR col 6 to give eliminations.
        // (4, 3) = 1 would eliminate via X-Wing.
        // We *don't* want to place 1 — we want the engine candidates to
        // include 1 in some row 2-8 cell at col 3 or 6.
        // Without any row 2-8 placements, those cells will have 1 as cand.
        let cells = autoPencil(makeCells(grid))

        // Sanity: row 0 cells (0,3) and (0,6) should have notes ⊇ {1}.
        #expect(cells[0][3].notes.contains(1))
        #expect(cells[0][6].notes.contains(1))
        #expect(cells[1][3].notes.contains(1))
        #expect(cells[1][6].notes.contains(1))
        // And no other cell in rows 0, 1 has 1 in cands (filled).
        for c in [0, 1, 2, 4, 5, 7, 8] {
            #expect(!cells[0][c].notes.contains(1))
            #expect(!cells[1][c].notes.contains(1))
        }

        let hint = TutorEngine.findXWing(cells: cells)
        #expect(hint?.technique == .xWing)
        #expect(hint?.placement == nil)
        // Eliminations should be in cols 3, 6 of rows 2-8 where 1 is
        // pencilled.
        #expect((hint?.eliminations.count ?? 0) > 0)
        #expect(hint?.eliminations.allSatisfy { ($0.col == 3 || $0.col == 6) && $0.row >= 2 } == true)
        #expect(hint?.eliminations.allSatisfy { $0.candidates == Set([1]) } == true)
    }

    // MARK: - XY-Wing

    // MARK: - Swordfish

    @Test func swordfish_onRows() {
        // Row-form Swordfish on digit 1: in three rows, digit 1 can only
        // land in the same three columns. Construct rows 0, 1, 2 such that
        // digit 1 has only 2 candidate cells each, all within columns 3, 5
        // and 7. (Row 0 = cols {3,5}, row 1 = cols {5,7}, row 2 = cols
        // {3,7}.) Other rows must have digit 1 as a candidate in cols 3, 5
        // or 7 so the Swordfish has eliminations to make.
        //
        // Block 1 from cols {0,1,2,4,6,8} in rows 0, 1, 2 by placing 1 in
        // those columns within other rows. Each row gets 1 placed at the
        // columns we want to forbid, blocking via column constraint.
        var grid = Self.emptyGrid
        // Block 1 from col 0 in rows 0-2 (place 1 at (3, 0)).
        grid[3][0] = 1
        // Block 1 from col 1 in rows 0-2 (place 1 at (4, 1)).
        grid[4][1] = 1
        // Block 1 from col 2 in rows 0-2 (place 1 at (5, 2)).
        grid[5][2] = 1
        // Block 1 from col 4 in rows 0-2 (place 1 at (6, 4)).
        grid[6][4] = 1
        // Block 1 from col 6 in rows 0-2 (place 1 at (7, 6)).
        grid[7][6] = 1
        // Block 1 from col 8 in rows 0-2 (place 1 at (8, 8)).
        grid[8][8] = 1
        // Now in rows 0-2, digit 1 is only candidate in cols {3, 5, 7}.
        // To narrow each row to exactly 2 of those 3 cols, we add row-level
        // blocks of 1 in the third col per row (using cell value or by
        // placing a non-1 digit in the cell so it's no longer empty).
        //
        // Row 0 should be {3, 5}: block col 7 by filling (0, 7) with anything other than 1.
        grid[0][7] = 9
        // Row 1 should be {5, 7}: block col 3.
        grid[1][3] = 9
        // Row 2 should be {3, 7}: block col 5.
        grid[2][5] = 9
        let cells = autoPencil(makeCells(grid))

        // Sanity: each of rows 0-2 has exactly 2 cells where 1 is a candidate.
        let row0 = (0..<9).filter { cells[0][$0].notes.contains(1) }
        let row1 = (0..<9).filter { cells[1][$0].notes.contains(1) }
        let row2 = (0..<9).filter { cells[2][$0].notes.contains(1) }
        #expect(row0 == [3, 5])
        #expect(row1 == [5, 7])
        #expect(row2 == [3, 7])

        let hint = TutorEngine.findSwordfish(cells: cells)
        #expect(hint?.technique == .swordfish)
        #expect(hint?.placement == nil)
        let elims = hint?.eliminations ?? []
        #expect(elims.count > 0)
        let allInExpectedSpots = elims.allSatisfy { e in
            let validCol = e.col == 3 || e.col == 5 || e.col == 7
            let validRow = e.row >= 3
            return validCol && validRow
        }
        #expect(allInExpectedSpots)
        let allDigit1 = elims.allSatisfy { $0.candidates == Set([1]) }
        #expect(allDigit1)
    }

    @Test func xyWing_classic() {
        // Construct three bivalue cells in the relationships:
        //   pivot at (0,0) with candidates {1, 2}
        //   pincer at (0,4) (same row as pivot) with {1, 3}
        //   pincer at (4,0) (same col as pivot) with {2, 3}
        // Cell (4, 4) sees both pincers (same row as one, same col as
        // other) and currently has 3 in user notes → elimination target.
        //
        // To get those exact candidate sets, we need to constrain the rest
        // of the board:
        //   (0,0) cands {1,2}: digits 3-9 blocked from this cell.
        //   (0,4) cands {1,3}: 2,4-9 blocked.
        //   (4,0) cands {2,3}: 1,4-9 blocked.
        //   (4,4) has 3 in notes (and other digits OK).
        //
        // That's a lot of constraints. Build it incrementally, blocking
        // each unwanted digit via a row, col, or box placement.
        var grid = Self.emptyGrid
        // For (0,0) to be {1,2}: block 3-9. Use row 0 to place 4,5,6,7,8,9
        // and the box / col for 3.
        grid[0] = [0, 0, 0, 0, 0, 4, 5, 6, 7]   // blocks 4-7 from row 0
        grid[1][0] = 8                          // col 0 blocks 8 from (0,0); row 1 only
        grid[2][0] = 9                          // col 0 blocks 9 from (0,0)
        grid[1][1] = 3                          // box 0 blocks 3 from (0,0). Also blocks 3 from (0,1),(0,2).

        // (0,4) needs {1,3}. (0,4) is in row 0 (which already has 4-7),
        // col 4, and box 1. We need to block 2, 8, 9 from (0,4) but allow
        // 3 there. 3 is currently in box 0 (from (1,1)=3) — doesn't affect
        // box 1. Good.
        grid[1][4] = 8                          // col 4 blocks 8 from (0,4)
        grid[2][4] = 9                          // col 4 blocks 9 from (0,4)
        grid[3][4] = 2                          // col 4 blocks 2 from (0,4)

        // (4,0) needs {2,3}. (4,0) in row 4, col 0 (has 8,9), box 3.
        // Need to block 1, 4-9 from (4,0) but allow 2, 3.
        // 1 blocked from (4,0): via *box 3* (not col 0 — that'd also block
        // 1 from (0,0)). Place 1 at (5,1) inside box 3.
        grid[5][1] = 1
        // 4-7 blocked from (4,0) via row 4 placements.
        grid[4][1] = 4
        grid[4][2] = 5
        grid[4][3] = 6
        grid[4][5] = 7

        // (4, 4) — eliminator cell. Need 3 in its candidates. (4,4) is in
        // row 4 (has 4,5,6,7), col 4 (has 2,8,9), box 4 (empty so far from
        // our placements). cands = (1-9) - {4,5,6,7,2,8,9} = {1, 3}.
        // 3 is there ✓.

        let cells = autoPencil(makeCells(grid))

        // Sanity
        #expect(cells[0][0].notes == Set([1, 2]))
        #expect(cells[0][4].notes == Set([1, 3]))
        #expect(cells[4][0].notes == Set([2, 3]))
        #expect(cells[4][4].notes.contains(3))

        let hint = TutorEngine.findXYWing(cells: cells)
        #expect(hint?.technique == .xyWing)
        #expect(hint?.placement == nil)
        // Eliminations should include (4, 4) with candidate {3}.
        let elim44 = hint?.eliminations.first { $0.row == 4 && $0.col == 4 }
        #expect(elim44 != nil)
        #expect(elim44?.candidates == Set([3]))
    }
}

// `TutorHint` and `TutorHint.Elimination` aren't Equatable themselves
// (tuples), so we extend Equatable for test ergonomics.
extension TutorHint: Equatable {
    public static func == (lhs: TutorHint, rhs: TutorHint) -> Bool {
        lhs.technique == rhs.technique
    }
}
