package com.derekgillett.sudoku

import android.content.Context
import com.derekgillett.sudoku.audio.SoundManager
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.CoachRepository
import com.derekgillett.sudoku.data.DailyPuzzleRepository
import com.derekgillett.sudoku.data.MultiplayerRepository
import com.derekgillett.sudoku.data.GameSaveRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.data.PuzzleHistoryRepository
import com.derekgillett.sudoku.data.ScoresRepository
import com.derekgillett.sudoku.data.sudokuDataStore
import com.derekgillett.sudoku.generator.GeneratedPuzzleProvider
import com.derekgillett.sudoku.generator.PuzzleProvider
import com.derekgillett.sudoku.network.ApiClient

/**
 * App-scoped dependency container — instantiated once on Application start
 * and passed into ViewModels via factory and the Compose tree via MainActivity.
 */
class AppContainer(context: Context) {
    val provider: PuzzleProvider = GeneratedPuzzleProvider()
    val historyRepo = PuzzleHistoryRepository(context.sudokuDataStore)
    val saveRepo = GameSaveRepository(context.sudokuDataStore)
    val prefsRepo = PreferencesRepository(context.sudokuDataStore)
    val soundManager = SoundManager(context)

    val apiClient = ApiClient()
    val authRepo = AuthRepository(context, apiClient)
    val groupsRepo = GroupsRepository(context.sudokuDataStore, apiClient, authRepo)
    val dailyRepo = DailyPuzzleRepository(context.sudokuDataStore, apiClient, provider)
    val scoresRepo = ScoresRepository(context.sudokuDataStore, apiClient, authRepo)
    val coachRepo = CoachRepository(context.sudokuDataStore)
    val multiplayerRepo = MultiplayerRepository(apiClient, authRepo)
}
