package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.DailyPuzzleRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.generator.DailyPuzzle
import com.derekgillett.sudoku.model.GameSave
import com.derekgillett.sudoku.model.PuzzleResult
import com.derekgillett.sudoku.state.SudokuGameViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private enum class DailyStatus { NOT_STARTED, IN_PROGRESS, COMPLETED }

@Composable
fun HomeScreen(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    dailyRepo: DailyPuzzleRepository,
    onSignIn: () -> Unit,
    onShowLeaderboard: () -> Unit,
    onStartDaily: (isOffline: Boolean) -> Unit
) {
    val saves by viewModel.saves.collectAsState(initial = emptyMap())
    val history by viewModel.history.collectAsState(initial = emptyList())
    val user by authRepo.user.collectAsState()
    val serverDaily by dailyRepo.today.collectAsState()
    val scope = rememberCoroutineScope()

    val today = remember { LocalDate.now() }
    val localDailyId = remember(today) { DailyPuzzle.id(today) }
    // Use server-resolved id when known, else local fallback. (SPEC §17.6)
    val dailyID = serverDaily?.id ?: localDailyId

    val dailyStatus: DailyStatus = when {
        history.any { it.puzzleID == dailyID } -> DailyStatus.COMPLETED
        saves.containsKey(dailyID) -> DailyStatus.IN_PROGRESS
        else -> DailyStatus.NOT_STARTED
    }
    val dailyElapsed = saves[dailyID]?.elapsedSeconds

    val mostRecentSave: GameSave? =
        saves.values.sortedByDescending { it.lastPlayedAt }.firstOrNull()
    val showContinue = mostRecentSave != null && mostRecentSave.puzzle.id != dailyID

    var showingSettings by remember { mutableStateOf(false) }
    var showingGames by remember { mutableStateOf(false) }
    var showingNewGame by remember { mutableStateOf(false) }
    var replayingDaily: PuzzleResult? by remember { mutableStateOf(null) }

    Box(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.weight(1f))
            Text(
                text = "Sudoku",
                fontSize = 56.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.weight(1f))

            DailyButton(
                date = today,
                status = dailyStatus,
                elapsedSeconds = dailyElapsed,
                onClick = {
                    if (dailyStatus == DailyStatus.COMPLETED) {
                        replayingDaily = history.firstOrNull { it.puzzleID == dailyID }
                    } else {
                        scope.launch {
                            val (puzzle, isOffline) = dailyRepo.ensureToday()
                            onStartDaily(isOffline)
                            viewModel.startDaily(puzzle)
                        }
                    }
                }
            )

            Spacer(Modifier.height(14.dp))

            if (mostRecentSave != null && showContinue) {
                ContinueButton(save = mostRecentSave) {
                    viewModel.continueMostRecent()
                }
                Spacer(Modifier.height(14.dp))
            }

            OutlinedButton(
                onClick = onShowLeaderboard,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.AutoMirrored.Outlined.List, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("Today's Leaderboard")
            }
            Spacer(Modifier.height(14.dp))

            OutlinedButton(
                onClick = { showingNewGame = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("New Game")
            }
            Spacer(Modifier.height(14.dp))
            OutlinedButton(
                onClick = { showingGames = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.AutoMirrored.Outlined.List, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("Games")
            }

            Spacer(Modifier.weight(2f))
        }

        // Identity chip — top-left.
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp)
        ) {
            val displayName = user?.displayName
            if (displayName != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.AccountCircle,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                TextButton(onClick = onSignIn) {
                    Icon(
                        Icons.Outlined.AccountCircle,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.size(6.dp))
                    Text("Sign in", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        IconButton(
            onClick = { showingSettings = true },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp)
        ) {
            Icon(Icons.Filled.Settings, contentDescription = "Settings")
        }
    }

    if (showingSettings) {
        SettingsSheet(
            viewModel = viewModel,
            prefsRepo = prefsRepo,
            authRepo = authRepo,
            groupsRepo = groupsRepo,
            onSignIn = {
                showingSettings = false
                onSignIn()
            },
            onDismiss = { showingSettings = false }
        )
    }
    if (showingGames) {
        GamesSheet(
            viewModel = viewModel,
            onDismiss = { showingGames = false }
        )
    }
    if (showingNewGame) {
        NewGameSheet(
            prefsRepo = prefsRepo,
            onStart = { difficulty ->
                viewModel.newGame(difficulty)
                showingNewGame = false
            },
            onDismiss = { showingNewGame = false }
        )
    }
    replayingDaily?.let { result ->
        CompletedBoardSheet(result = result, onDismiss = { replayingDaily = null })
    }
}

@Composable
private fun DailyButton(
    date: LocalDate,
    status: DailyStatus,
    elapsedSeconds: Int?,
    onClick: () -> Unit
) {
    val dateLabel = remember(date) { date.format(DateTimeFormatter.ofPattern("EEE, MMM d")) }
    val subtitle = when (status) {
        DailyStatus.NOT_STARTED -> dateLabel
        DailyStatus.IN_PROGRESS -> elapsedSeconds?.let { "$dateLabel · ${formatTime(it)}" } ?: dateLabel
        DailyStatus.COMPLETED -> "$dateLabel · already played"
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        when (status) {
            DailyStatus.COMPLETED -> {
                OutlinedButton(
                    onClick = onClick,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Daily Done")
                }
            }
            DailyStatus.IN_PROGRESS -> {
                Button(
                    onClick = onClick,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors()
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Resume Daily")
                }
            }
            DailyStatus.NOT_STARTED -> {
                Button(
                    onClick = onClick,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Outlined.CalendarToday, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Daily Puzzle")
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ContinueButton(save: GameSave, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Continue")
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "${save.puzzle.displayLabel} · ${save.puzzle.difficulty.label} · ${formatTime(save.elapsedSeconds)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
