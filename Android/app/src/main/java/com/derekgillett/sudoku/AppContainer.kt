package com.derekgillett.sudoku

import android.content.Context
import com.derekgillett.sudoku.data.GameSaveRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.data.PuzzleHistoryRepository
import com.derekgillett.sudoku.data.sudokuDataStore
import com.derekgillett.sudoku.generator.GeneratedPuzzleProvider
import com.derekgillett.sudoku.generator.PuzzleProvider

/**
 * App-scoped dependency container — instantiated once on Application start
 * and passed into ViewModels via factory.
 */
class AppContainer(context: Context) {
    val provider: PuzzleProvider = GeneratedPuzzleProvider()
    val historyRepo = PuzzleHistoryRepository(context.sudokuDataStore)
    val saveRepo = GameSaveRepository(context.sudokuDataStore)
    val prefsRepo = PreferencesRepository(context.sudokuDataStore)
}
