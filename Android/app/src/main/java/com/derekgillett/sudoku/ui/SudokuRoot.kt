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
import com.derekgillett.sudoku.data.ScoresRepository
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
    dailyRepo: DailyPuzzleRepository,
    scoresRepo: ScoresRepository
) {
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    var solvedResult by remember { mutableStateOf<PuzzleResult?>(null) }
    var solvedRank by remember { mutableStateOf<Int?>(null) }
    var solvedWasCanonicalDaily by remember { mutableStateOf(false) }
    var dailyIsOfflineFallback by remember { mutableStateOf(false) }
    var showingSignIn by remember { mutableStateOf(false) }
    var showingLeaderboard by remember { mutableStateOf(false) }
    val refreshScope = rememberCoroutineScope()
    val token by authRepo.token.collectAsState()
    val serverDaily by dailyRepo.today.collectAsState()

    LaunchedEffect(viewModel) {
        viewModel.onSolved { result, mistakeCount ->
            // Spec §17.4: post score for canonical daily solves only;
            // offline-fallback dailies are explicitly unranked.
            val puzzle = result.puzzle
            val isCanonicalDaily = puzzle != null && puzzle.isDaily && !dailyIsOfflineFallback
            solvedRank = null
            solvedWasCanonicalDaily = isCanonicalDaily
            solvedResult = result
            if (isCanonicalDaily) {
                refreshScope.launch {
                    solvedRank = scoresRepo.submit(
                        puzzleId = result.puzzleID,
                        elapsedSeconds = result.elapsedSeconds,
                        mistakes = mistakeCount
                    )
                }
            }
        }
    }

    // Initial load: prime caches from disk, then refresh from server.
    LaunchedEffect(Unit) {
        dailyRepo.primeFromCache()
        groupsRepo.primeFromCache()
        dailyRepo.refresh()
        if (authRepo.isSignedIn) {
            groupsRepo.refresh()
            scoresRepo.flushPending()
        }
    }

    // Flush pending scores when the user signs in (or in if the token shows up from cache).
    LaunchedEffect(token) {
        if (token != null) {
            groupsRepo.refresh()
            scoresRepo.flushPending()
        }
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
                        onSignIn = { showingSignIn = true },
                        onShowLeaderboard = { showingLeaderboard = true },
                        onStartDaily = { dailyIsOfflineFallback = it }
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
                val isSignedIn = authRepo.isSignedIn
                val groupsList by groupsRepo.groups.collectAsState()
                SolvedSheet(
                    result = result,
                    rank = solvedRank,
                    showLeaderboardButton = solvedWasCanonicalDaily && isSignedIn && groupsList.isNotEmpty(),
                    showSignInPrompt = solvedWasCanonicalDaily && !isSignedIn,
                    onLeaderboard = {
                        solvedResult = null
                        showingLeaderboard = true
                    },
                    onSignIn = {
                        solvedResult = null
                        showingSignIn = true
                    },
                    onDone = {
                        solvedResult = null
                        viewModel.goHome()
                    }
                )
            }

            if (showingLeaderboard) {
                val resolvedDailyId = serverDaily?.id
                    ?: com.derekgillett.sudoku.generator.DailyPuzzle.id(java.time.LocalDate.now())
                val label = serverDaily?.displayLabel
                    ?: "Daily · " + java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("MMM d"))
                LeaderboardSheet(
                    puzzleId = resolvedDailyId,
                    puzzleLabel = label,
                    authRepo = authRepo,
                    groupsRepo = groupsRepo,
                    scoresRepo = scoresRepo,
                    onDismiss = { showingLeaderboard = false }
                )
            }
        }
    }
}
