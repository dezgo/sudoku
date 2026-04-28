package com.derekgillett.sudoku.generator

/**
 * Backtracking Sudoku solver with the Minimum Remaining Values heuristic.
 * Stops once `limit` solutions are found — used for actually solving
 * (limit=1) and uniqueness checks (limit=2).
 */
class SudokuSolver {
    fun hasUniqueSolution(grid: List<List<Int>>): Boolean {
        val mutable = grid.map { it.toMutableList() }.toMutableList()
        val results = mutableListOf<List<List<Int>>>()
        search(mutable, limit = 2, results = results)
        return results.size == 1
    }

    private data class Mrv(val row: Int, val col: Int, val candidates: List<Int>)

    private fun search(
        grid: MutableList<MutableList<Int>>,
        limit: Int,
        results: MutableList<List<List<Int>>>
    ): Boolean {
        if (results.size >= limit) return true
        val mrv = mrvCell(grid)
        if (mrv == null) {
            results.add(grid.map { it.toList() })
            return results.size >= limit
        }
        if (mrv.candidates.isEmpty()) return false
        for (d in mrv.candidates) {
            grid[mrv.row][mrv.col] = d
            if (search(grid, limit, results)) {
                grid[mrv.row][mrv.col] = 0
                return results.size >= limit
            }
            grid[mrv.row][mrv.col] = 0
        }
        return false
    }

    private fun mrvCell(grid: List<List<Int>>): Mrv? {
        var best: Mrv? = null
        var bestCount = 10
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (grid[r][c] != 0) continue
                val cands = candidates(r, c, grid)
                if (cands.size < bestCount) {
                    bestCount = cands.size
                    best = Mrv(r, c, cands)
                    if (bestCount <= 1) return best
                }
            }
        }
        return best
    }

    private fun candidates(r: Int, c: Int, grid: List<List<Int>>): List<Int> {
        val available = (1..9).toMutableSet()
        for (i in 0 until 9) {
            available.remove(grid[r][i])
            available.remove(grid[i][c])
        }
        val boxR = (r / 3) * 3
        val boxC = (c / 3) * 3
        for (rr in boxR until boxR + 3) {
            for (cc in boxC until boxC + 3) {
                available.remove(grid[rr][cc])
            }
        }
        return available.toList()
    }
}
