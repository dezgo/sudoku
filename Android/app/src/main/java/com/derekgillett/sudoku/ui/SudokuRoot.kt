package com.derekgillett.sudoku.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
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
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import com.derekgillett.sudoku.data.sudokuDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import com.derekgillett.sudoku.data.AppearancePreference
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.CoachRepository
import com.derekgillett.sudoku.data.DailyPuzzleRepository
import com.derekgillett.sudoku.data.MultiplayerRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.data.PuzzleHistoryRepository
import com.derekgillett.sudoku.data.ScoresRepository
import com.derekgillett.sudoku.model.Puzzle
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
    scoresRepo: ScoresRepository,
    coachRepo: CoachRepository,
    multiplayerRepo: MultiplayerRepository,
    historyRepo: PuzzleHistoryRepository
) {
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    var solvedResult by remember { mutableStateOf<PuzzleResult?>(null) }
    var solvedRank by remember { mutableStateOf<Int?>(null) }
    var solvedWasCanonicalDaily by remember { mutableStateOf(false) }
    var dailyIsOfflineFallback by remember { mutableStateOf(false) }
    var showingSignIn by remember { mutableStateOf(false) }
    var showingLeaderboard by remember { mutableStateOf(false) }
    var showingCoach by remember { mutableStateOf(false) }
    var showingMultiplayer by remember { mutableStateOf(false) }
    var showingPushPrompt by remember { mutableStateOf(false) }
    var initialLoadComplete by remember { mutableStateOf(false) }
    var versionStatus by remember { mutableStateOf(VersionStatus.UP_TO_DATE) }
    var versionStoreUrl: String? by remember { mutableStateOf(null) }
    var inviteJoinError by remember { mutableStateOf<String?>(null) }
    val pendingInvite by multiplayerRepo.pendingInviteCode.collectAsState()

    // App-Links → multiplayer flow: when a code arrives, either open the
    // multiplayer sheet (which will auto-resolve via initialJoinCode) or
    // prompt sign-in first and re-trigger when isSignedIn flips.
    LaunchedEffect(pendingInvite, authRepo.isSignedIn) {
        if (pendingInvite == null) return@LaunchedEffect
        if (authRepo.isSignedIn) {
            showingMultiplayer = true
        } else {
            showingSignIn = true
        }
    }
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
                // Snapshot the assist signals from the just-solved state so
                // the leaderboard records what really happened.
                val solved = viewModel.state.value
                val hints = solved?.hintsUsed ?: 0
                val pencil = solved?.pencilAssistsUsed ?: 0
                val mistakesWasOn = solved?.highlightMistakesEverOn ?: true
                val rulesWasOn = solved?.highlightConstraintsEverOn ?: true
                refreshScope.launch {
                    solvedRank = scoresRepo.submit(
                        puzzleId = result.puzzleID,
                        elapsedSeconds = result.elapsedSeconds,
                        mistakes = mistakeCount,
                        hintsUsed = hints,
                        pencilAssistsUsed = pencil,
                        highlightMistakesWasOn = mistakesWasOn,
                        highlightRulesWasOn = rulesWasOn
                    )
                }
            }
        }
    }

    // Initial load: prime caches from disk, then refresh from server.
    // Mark initial-load complete when the network refreshes settle, OR after
    // a 1.5s timeout — whichever first — so the loading veil never traps
    // the user behind a slow network.
    LaunchedEffect(Unit) {
        dailyRepo.primeFromCache()
        groupsRepo.primeFromCache()
        dailyRepo.refresh()
        if (authRepo.isSignedIn) {
            groupsRepo.refresh()
            scoresRepo.flushPending()
        }
        initialLoadComplete = true
    }
    LaunchedEffect(Unit) {
        delay(1500)
        initialLoadComplete = true
    }

    // Fetch server-side version pins on launch and compare to the running
    // bundle. Soft prompt if behind `current`; hard block if behind
    // `min_required`. Best-effort — silent fail on offline.
    val versionContext = LocalContext.current
    val bundleVersion: String = remember(versionContext) {
        runCatching {
            versionContext.packageManager
                .getPackageInfo(versionContext.packageName, 0).versionName
        }.getOrNull() ?: "0.0"
    }
    LaunchedEffect(Unit) {
        runCatching {
            val response = com.derekgillett.sudoku.network.ApiClient().version()
            val info = response.android
            versionStoreUrl = info.storeUrl
            versionStatus = when {
                compareVersions(bundleVersion, info.minRequired) < 0 -> VersionStatus.BLOCKED
                compareVersions(bundleVersion, info.current) < 0 -> VersionStatus.SOFT_PROMPT
                else -> VersionStatus.UP_TO_DATE
            }
        }
    }

    // Flush pending scores + sync remote history when the user signs in
    // (or when the cached token is loaded on launch). The history sync
    // gives a fresh-installed device the user's prior daily completions.
    LaunchedEffect(token) {
        if (token != null) {
            groupsRepo.refresh()
            scoresRepo.flushPending()
            val remote = scoresRepo.fetchMyScores()
            if (remote.isNotEmpty()) {
                val asResults = remote.map { r ->
                    com.derekgillett.sudoku.model.PuzzleResult(
                        puzzleID = r.puzzleId,
                        completedAt = r.completedAt,
                        elapsedSeconds = r.elapsedSeconds,
                        puzzle = Puzzle(
                            id = r.puzzleId,
                            difficulty = r.difficulty,
                            givens = r.givens,
                            solution = r.solution
                        )
                    )
                }
                historyRepo.mergeRemote(asResults)
            }
        }
    }

    // Pre-permission pattern for notifications: show our own dialog before
    // the system runtime prompt so users get context. API < 33 doesn't need
    // a runtime permission so we skip the whole dance.
    val context = LocalContext.current
    val pushDismissedKey = booleanPreferencesKey("sudoku.push.prepermission_dismissed")
    val systemPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ ->
        // Whichever way they answer, don't ask again.
        refreshScope.launch {
            context.sudokuDataStore.edit { it[pushDismissedKey] = true }
        }
    }
    LaunchedEffect(token) {
        if (token == null) return@LaunchedEffect
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@LaunchedEffect
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) return@LaunchedEffect
        val dismissed = context.sudokuDataStore.data
            .map { it[pushDismissedKey] ?: false }
            .first()
        if (!dismissed) showingPushPrompt = true
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
            // Loading veil — mirrors LoadingVeilView on iOS. Covers the home
            // screen for the first ~1.5s while bg work primes the puzzle
            // buffer + initial network refreshes complete. Without this,
            // users see the home screen with stale or empty content for a
            // beat (most visible on cold start with the new
            // technique-tier classify loop).
            AnimatedVisibility(
                visible = !initialLoadComplete,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            "Sudoku Crew",
                            fontSize = 40.sp,
                            fontWeight = FontWeight.Bold
                        )
                        CircularProgressIndicator()
                    }
                }
            }
            // Hard update blocker — when bundle < min_required.
            if (versionStatus == VersionStatus.BLOCKED) {
                versionStoreUrl?.let { url ->
                    UpdateBlocker(storeUrl = url)
                }
            }

            if (s == null || prefs == null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Soft update banner — visible above whatever screen is
                    // active. Tap to open Play Store; X to dismiss.
                    if (versionStatus == VersionStatus.SOFT_PROMPT) {
                        versionStoreUrl?.let { url ->
                            UpdateBanner(
                                storeUrl = url,
                                onDismiss = { versionStatus = VersionStatus.UP_TO_DATE }
                            )
                        }
                    }
                when (s.phase) {
                    Phase.HOME -> HomeScreen(
                        viewModel = viewModel,
                        prefsRepo = prefsRepo,
                        authRepo = authRepo,
                        groupsRepo = groupsRepo,
                        dailyRepo = dailyRepo,
                        onSignIn = { showingSignIn = true },
                        onShowLeaderboard = { showingLeaderboard = true },
                        onShowCoach = { showingCoach = true },
                        onShowMultiplayer = { showingMultiplayer = true },
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
                } // close Column
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

            if (showingCoach) {
                CoachSheet(
                    coachRepo = coachRepo,
                    onDismiss = { showingCoach = false }
                )
            }

            if (showingMultiplayer) {
                MultiplayerSheet(
                    multiplayerRepo = multiplayerRepo,
                    authRepo = authRepo,
                    groupsRepo = groupsRepo,
                    onDismiss = { showingMultiplayer = false },
                    initialJoinCode = pendingInvite,
                    onInitialJoinError = { msg ->
                        inviteJoinError = msg
                        multiplayerRepo.clearPendingInviteCode()
                        showingMultiplayer = false
                    },
                    onInitialJoinHandled = { multiplayerRepo.clearPendingInviteCode() }
                )
            }

            if (inviteJoinError != null) {
                AlertDialog(
                    onDismissRequest = { inviteJoinError = null },
                    title = { Text("Couldn't join the game") },
                    text = { Text(inviteJoinError ?: "") },
                    confirmButton = {
                        TextButton(onClick = { inviteJoinError = null }) { Text("OK") }
                    }
                )
            }

            if (showingPushPrompt) {
                AlertDialog(
                    onDismissRequest = { showingPushPrompt = false },
                    title = { Text("Get notified about your turn?") },
                    text = {
                        Text(
                            "Sudoku Crew can ping you when it's your turn in a multiplayer game, " +
                                "or when a friend joins your group's leaderboard. We'll only send " +
                                "notifications about real activity in your games."
                        )
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            showingPushPrompt = false
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                systemPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                        }) {
                            Text("Sure")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = {
                            showingPushPrompt = false
                            refreshScope.launch {
                                context.sudokuDataStore.edit { it[pushDismissedKey] = true }
                            }
                        }) {
                            Text("Not now")
                        }
                    }
                )
            }
        }
    }
}

/** Tri-state for the in-app version check. Mirrors VersionStatus on iOS. */
enum class VersionStatus { UP_TO_DATE, SOFT_PROMPT, BLOCKED }

/** Top banner shown when a newer build is available. Tap → opens Play Store. */
@Composable
private fun UpdateBanner(storeUrl: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primary)
            .clickable { openStore(context, storeUrl) }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Filled.ArrowDownward,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Update available",
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                "Tap to get the latest version",
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
                style = MaterialTheme.typography.bodySmall
            )
        }
        IconButton(onClick = onDismiss) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Dismiss",
                tint = MaterialTheme.colorScheme.onPrimary
            )
        }
    }
}

/** Full-screen blocker shown when bundle < min_required. */
@Composable
private fun UpdateBlocker(storeUrl: String) {
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Filled.ArrowDownward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(56.dp)
            )
            Text(
                "Update required",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Text(
                "This version of Sudoku Crew can't talk to the server anymore. Grab the latest from the Play Store to keep playing.",
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(8.dp))
            Button(
                onClick = { openStore(context, storeUrl) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Open Play Store")
            }
        }
    }
}

private fun openStore(context: android.content.Context, url: String) {
    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
    context.startActivity(intent)
}

/** Compare semver-ish strings ("1.10.2" > "1.9.99"). Returns -1, 0, or 1. */
private fun compareVersions(a: String, b: String): Int {
    val aParts = a.split(".").map { it.toIntOrNull() ?: 0 }
    val bParts = b.split(".").map { it.toIntOrNull() ?: 0 }
    val len = maxOf(aParts.size, bParts.size)
    for (i in 0 until len) {
        val av = aParts.getOrElse(i) { 0 }
        val bv = bParts.getOrElse(i) { 0 }
        if (av < bv) return -1
        if (av > bv) return 1
    }
    return 0
}
