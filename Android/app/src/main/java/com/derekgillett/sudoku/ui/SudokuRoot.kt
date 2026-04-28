package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.derekgillett.sudoku.data.AppearancePreference
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.model.PuzzleResult
import com.derekgillett.sudoku.state.Phase
import com.derekgillett.sudoku.state.SudokuGameViewModel
import com.derekgillett.sudoku.ui.theme.SudokuTheme

@Composable
fun SudokuRoot(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository
) {
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    var solvedResult by remember { mutableStateOf<PuzzleResult?>(null) }

    // Wire the solve callback on first composition.
    LaunchedEffect(viewModel) {
        viewModel.onSolved { result ->
            solvedResult = result
        }
    }

    // Auto-pause / auto-resume on lifecycle changes.
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_PAUSE -> viewModel.enterBackground()
                Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME -> viewModel.enterForeground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
    }

    val darkTheme = when (prefs?.appearance) {
        AppearancePreference.LIGHT -> false
        AppearancePreference.DARK -> true
        AppearancePreference.SYSTEM, null -> androidx.compose.foundation.isSystemInDarkTheme()
    }

    SudokuTheme(darkTheme = darkTheme) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            val s = state
            if (s == null || prefs == null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }
            } else {
                when (s.phase) {
                    Phase.HOME -> HomeScreen(
                        viewModel = viewModel,
                        prefsRepo = prefsRepo
                    )
                    Phase.PLAYING -> GameScreen(
                        viewModel = viewModel,
                        prefsRepo = prefsRepo
                    )
                }
            }

            // Solved fanfare.
            solvedResult?.let { result ->
                SolvedSheet(
                    result = result,
                    onDone = {
                        solvedResult = null
                        viewModel.goHome()
                    }
                )
            }
        }
    }
}
