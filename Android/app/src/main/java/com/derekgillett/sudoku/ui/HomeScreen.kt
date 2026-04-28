package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.List
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.generator.DailyPuzzle
import com.derekgillett.sudoku.model.GameSave
import com.derekgillett.sudoku.state.SudokuGameViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private enum class DailyStatus { NOT_STARTED, IN_PROGRESS, COMPLETED }

@Composable
fun HomeScreen(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository
) {
    val saves by viewModel.saves.collectAsState(initial = emptyMap())
    val history by viewModel.history.collectAsState(initial = emptyList())

    val today = remember { LocalDate.now() }
    val dailyID = remember(today) { DailyPuzzle.id(today) }

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

    Box(modifier = Modifier.fillMaxSize()) {
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
                onClick = { viewModel.startDaily(today) }
            )

            Spacer(Modifier.height(14.dp))

            if (showContinue && mostRecentSave != null) {
                ContinueButton(save = mostRecentSave) {
                    viewModel.continueMostRecent()
                }
                Spacer(Modifier.height(14.dp))
            }

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
                Icon(Icons.Outlined.List, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("Games")
            }

            Spacer(Modifier.weight(2f))
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
                    onClick = { /* disabled */ },
                    enabled = false,
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
            "Puzzle #${save.puzzle.id} · ${save.puzzle.difficulty.label} · ${formatTime(save.elapsedSeconds)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
