package com.derekgillett.sudoku.generator

import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.model.Puzzle
import com.derekgillett.sudoku.state.TutorEngine
import com.derekgillett.sudoku.state.TutorTechnique
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlin.random.Random

/**
 * Production puzzle provider: generates an independent solved grid per
 * call, carves a puzzle by uniqueness-preserving cell removal targeting a
 * per-difficulty hint count.
 *
 * Maintains a small per-difficulty buffer filled on a background coroutine
 * so `nextPuzzle` is responsive. Today's daily is also pre-warmed at
 * construction.
 */
class GeneratedPuzzleProvider : PuzzleProvider {
    private val generator = SudokuGridGenerator()
    private val lock = Any()
    private val queues: MutableMap<Difficulty, MutableList<Puzzle>> = mutableMapOf(
        Difficulty.EASY to mutableListOf(),
        Difficulty.MEDIUM to mutableListOf(),
        Difficulty.HARD to mutableListOf()
    )
    private val dailyCache: MutableMap<Int, Puzzle> = mutableMapOf()
    private var nextID: Int = 1000

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    init {
        for (d in Difficulty.values()) {
            scope.launch { refill(d) }
        }
        scope.launch { dailyPuzzle(LocalDate.now()) }
    }

    override fun nextPuzzle(difficulty: Difficulty, excludingIDs: Set<Int>): Puzzle {
        // ID-based exclusion is meaningless for an infinite generator (every
        // puzzle has a fresh ID), so excludingIDs is currently ignored.
        val pre = synchronized(lock) {
            queues[difficulty]?.removeLastOrNull()
        }
        scope.launch { refill(difficulty) }
        return pre ?: generate(difficulty)
    }

    override fun dailyPuzzle(date: LocalDate): Puzzle {
        val id = DailyPuzzle.id(date)
        synchronized(lock) {
            dailyCache[id]?.let { return it }
        }
        val rng = SeededRng(DailyPuzzle.seed(date))
        val solution = generator.generateSolution(rng)
        val givens = generator.makePuzzle(
            solution = solution,
            targetGivens = targetGivens(DailyPuzzle.difficulty),
            rng = rng
        )
        val puzzle = Puzzle(
            id = id,
            difficulty = DailyPuzzle.difficulty,
            givens = givens,
            solution = solution
        )
        synchronized(lock) { dailyCache[id] = puzzle }
        return puzzle
    }

    private fun refill(difficulty: Difficulty) {
        while (true) {
            val count = synchronized(lock) { queues[difficulty]?.size ?: 0 }
            if (count >= BUFFER_SIZE) return
            val p = generate(difficulty)
            synchronized(lock) { queues[difficulty]?.add(p) }
        }
    }

    private fun generate(difficulty: Difficulty): Puzzle {
        // Generate-and-classify loop: produce candidates and accept only
        // those whose hardest required technique matches the requested
        // tier. Without this, difficulty was decided by clue count alone
        // (a crude proxy that produced "Medium" puzzles needing X-Wings
        // and "Hard" puzzles solvable with naked singles). Mirrors the
        // iOS PuzzleGenerator and matches SPEC §13.10.
        val rng = Random.Default
        val target = expectedTier(difficulty)
        var lastFallback: Puzzle? = null
        for (attempt in 0 until 25) {
            val solution = generator.generateSolution(rng)
            val givens = generator.makePuzzle(
                solution = solution,
                targetGivens = targetGivens(difficulty),
                rng = rng
            )
            val id = synchronized(lock) {
                val cur = nextID
                nextID++
                cur
            }
            val puzzle = Puzzle(id = id, difficulty = difficulty, givens = givens, solution = solution)
            val cells = cellsFromGivens(givens)
            if (TutorEngine.classify(cells) == target) return puzzle
            // Hold onto the most recent — graceful fallback if 25 attempts
            // fail to land on-tier (rare).
            lastFallback = puzzle
        }
        return lastFallback ?: run {
            val solution = generator.generateSolution(rng)
            val givens = generator.makePuzzle(
                solution = solution,
                targetGivens = targetGivens(difficulty),
                rng = rng
            )
            val id = synchronized(lock) {
                val cur = nextID
                nextID++
                cur
            }
            Puzzle(id = id, difficulty = difficulty, givens = givens, solution = solution)
        }
    }

    private fun targetGivens(difficulty: Difficulty): Int = when (difficulty) {
        Difficulty.EASY -> 48
        Difficulty.MEDIUM -> 32
        Difficulty.HARD -> 26
    }

    private fun expectedTier(difficulty: Difficulty): TutorTechnique.Tier = when (difficulty) {
        Difficulty.EASY -> TutorTechnique.Tier.SIMPLE
        Difficulty.MEDIUM -> TutorTechnique.Tier.MEDIUM
        Difficulty.HARD -> TutorTechnique.Tier.HARD
    }

    private fun cellsFromGivens(givens: List<List<Int>>): List<List<Cell>> =
        givens.map { row ->
            row.map { v ->
                if (v == 0) Cell(value = null, isFixed = false, notes = emptySet())
                else Cell(value = v, isFixed = true, notes = emptySet())
            }
        }

    companion object {
        // Each generated puzzle now runs through up-to-25 generate-and-classify
        // retries (technique-tier validation) so the buffer fill is genuinely
        // expensive — kept small to avoid CPU saturation on cold start.
        private const val BUFFER_SIZE = 1
    }
}
