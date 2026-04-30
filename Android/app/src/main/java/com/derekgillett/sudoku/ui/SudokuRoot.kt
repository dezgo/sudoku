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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.derekgillett.sudoku.data.AppearancePreference
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.DailyPuzzleRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.model.PuzzleResult
import com.derekgillett.sudoku.state.Phase
import com.derekgillett.sudoku.state.SudokuGameViewModel
import com.derekgillett.sudoku.ui.theme.SudokuTheme
import kotlinx.coroutines.launch

@Composable
fun SudokuRoot(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    dailyRepo: DailyPuzzleRepository
) {
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    var solvedResult by remember { mutableStateOf<PuzzleResult?>(null) }
    var showingSignIn by remember { mutableStateOf(false) }
    val refreshScope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.onSolved { result -> solvedResult = result }
    }

    // Initial load: prime caches from disk, then refresh from server.
    LaunchedEffect(Unit) {
        dailyRepo.primeFromCache()
        groupsRepo.primeFromCache()
        dailyRepo.refresh()
        if (authRepo.isSignedIn) groupsRepo.refresh()
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_PAUSE -> viewModel.enterBackground()
                Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME -> {
                    viewModel.enterForeground()
                    refreshScope.launch {
                        dailyRepo.refresh()
                        if (authRepo.isSignedIn) groupsRepo.refresh()
                    }
                }
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
                        prefsRepo = prefsRepo,
                        authRepo = authRepo,
                        groupsRepo = groupsRepo,
                        dailyRepo = dailyRepo,
                        onSignIn = { showingSignIn = true }
                    )
                    Phase.PLAYING -> GameScreen(
                        viewModel = viewModel,
                        prefsRepo = prefsRepo,
                        authRepo = authRepo,
                        groupsRepo = groupsRepo,
                        onSignIn = { showingSignIn = true }
                    )
                }
            }

            if (showingSignIn) {
                SignInSheet(
                    authRepo = authRepo,
                    groupsRepo = groupsRepo,
                    onDismiss = { showingSignIn = false }
                )
            }

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
