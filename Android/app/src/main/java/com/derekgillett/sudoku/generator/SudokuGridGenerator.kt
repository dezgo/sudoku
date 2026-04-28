package com.derekgillett.sudoku.generator

import kotlin.random.Random

/**
 * Generates random complete Sudoku grids and carves puzzles out of them
 * with uniqueness preservation.
 */
class SudokuGridGenerator {
    private val solver = SudokuSolver()

    /** Random fully-filled valid 9×9 grid. */
    fun generateSolution(rng: Random): List<List<Int>> {
        val grid = MutableList(9) { MutableList(9) { 0 } }
        fill(grid, rng)
        return grid.map { it.toList() }
    }

    private fun fill(grid: MutableList<MutableList<Int>>, rng: Random): Boolean {
        val target = firstEmpty(grid) ?: return true
        val (r, c) = target
        val digits = (1..9).toMutableList().also { it.shuffle(rng) }
        for (d in digits) {
            if (canPlace(d, r, c, grid)) {
                grid[r][c] = d
                if (fill(grid, rng)) return true
                grid[r][c] = 0
            }
        }
        return false
    }

    /**
     * Remove cells from a solved grid, preserving uniqueness, until the
     * given target hint count is reached or no more cells can be removed
     * without introducing ambiguity.
     */
    fun makePuzzle(
        solution: List<List<Int>>,
        targetGivens: Int,
        rng: Random
    ): List<List<Int>> {
        val grid = solution.map { it.toMutableList() }.toMutableList()
        val positions = (0 until 81).map { Pair(it / 9, it % 9) }
            .toMutableList()
            .also { it.shuffle(rng) }
        var givens = 81
        for ((r, c) in positions) {
            if (givens <= targetGivens) break
            val saved = grid[r][c]
            grid[r][c] = 0
            if (solver.hasUniqueSolution(grid.map { it.toList() })) {
                givens--
            } else {
                grid[r][c] = saved
            }
        }
        return grid.map { it.toList() }
    }

    private fun firstEmpty(grid: List<List<Int>>): Pair<Int, Int>? {
        for (r in 0 until 9) {
            for (c in 0 until 9) {
                if (grid[r][c] == 0) return Pair(r, c)
            }
        }
        return null
    }

    private fun canPlace(d: Int, r: Int, c: Int, grid: List<List<Int>>): Boolean {
        for (i in 0 until 9) {
            if (grid[r][i] == d || grid[i][c] == d) return false
        }
        val boxR = (r / 3) * 3
        val boxC = (c / 3) * 3
        for (rr in boxR until boxR + 3) {
            for (cc in boxC until boxC + 3) {
                if (grid[rr][cc] == d) return false
            }
        }
        return true
    }
}
