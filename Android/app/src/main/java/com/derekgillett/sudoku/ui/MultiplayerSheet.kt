package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.MultiplayerRepository
import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.MultiplayerGame
import com.derekgillett.sudoku.network.MultiplayerStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Lobby screen for the turn-based multiplayer feature. Mirrors
 * MultiplayerLobbyView.swift on iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultiplayerSheet(
    multiplayerRepo: MultiplayerRepository,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    onDismiss: () -> Unit,
    initialJoinCode: String? = null,
    onInitialJoinError: (String) -> Unit = {},
    onInitialJoinHandled: () -> Unit = {}
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val inProgress by multiplayerRepo.inProgress.collectAsState()
    val completed by multiplayerRepo.completed.collectAsState()
    val isSignedIn = authRepo.isSignedIn

    var showingCreate by remember { mutableStateOf(false) }
    var openingGameId: String? by remember { mutableStateOf(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { multiplayerRepo.refresh() }

    // Universal-link auto-join: try to resolve the invite code once on entry.
    LaunchedEffect(initialJoinCode) {
        val code = initialJoinCode ?: return@LaunchedEffect
        try {
            val game = multiplayerRepo.joinByCode(code)
            openingGameId = game.id
        } catch (e: Throwable) {
            val msg = when {
                e is ApiClient.ApiException.Http && e.status == 404 ->
                    "We don't recognise that invite code. The game may have ended."
                e is ApiClient.ApiException.Http && e.status == 409 ->
                    "This game has already started or ended."
                e === ApiClient.ApiException.Offline ->
                    "You're offline. Try the link again when you're back online."
                else -> "Couldn't join the game."
            }
            onInitialJoinError(msg)
        } finally {
            onInitialJoinHandled()
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Multiplayer",
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f)
                )
                if (isSignedIn) {
                    IconButton(onClick = { showingCreate = true }) {
                        Icon(Icons.Filled.Add, contentDescription = "New game")
                    }
                }
            }
            Spacer(Modifier.size(8.dp))

            if (!isSignedIn) {
                Text(
                    "Sign in to play with friends. Multiplayer needs a signed-in account so we know whose turn it is.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.size(24.dp))
            } else if (inProgress.isEmpty() && completed.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.Person, contentDescription = null,
                            modifier = Modifier.size(40.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.size(8.dp))
                        Text("No games yet", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Tap + to start a turn-based sudoku with friends.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                val myTurn = inProgress.filter { it.isMyTurn }
                val waiting = inProgress.filter { !it.isMyTurn }
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    if (myTurn.isNotEmpty()) {
                        item { sectionHeader("Your turn") }
                        items(myTurn) { game ->
                            GameRow(game) { openingGameId = game.id }
                        }
                    }
                    if (waiting.isNotEmpty()) {
                        item { sectionHeader("Waiting on others") }
                        items(waiting) { game ->
                            GameRow(game) { openingGameId = game.id }
                        }
                    }
                    if (completed.isNotEmpty()) {
                        item { sectionHeader("Completed") }
                        items(completed) { game ->
                            GameRow(game) { openingGameId = game.id }
                        }
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }

    if (showingCreate) {
        MultiplayerCreateSheet(
            multiplayerRepo = multiplayerRepo,
            groupsRepo = groupsRepo,
            onDismiss = { showingCreate = false }
        )
    }

    openingGameId?.let { id ->
        MultiplayerGameSheet(
            gameId = id,
            multiplayerRepo = multiplayerRepo,
            authRepo = authRepo,
            onDismiss = {
                openingGameId = null
                scope.launch { multiplayerRepo.refresh() }
            }
        )
    }
}

@Composable
private fun sectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
    )
    HorizontalDivider()
}

@Composable
private fun GameRow(game: MultiplayerGame, onClick: () -> Unit) {
    val title = when (game.status) {
        MultiplayerStatus.PENDING -> "${game.difficulty.label} · waiting to start"
        MultiplayerStatus.ACTIVE -> game.difficulty.label
        MultiplayerStatus.COMPLETED -> "${game.difficulty.label} · solved"
        MultiplayerStatus.ABANDONED -> "${game.difficulty.label} · abandoned"
    }
    val subtitle = when (game.status) {
        MultiplayerStatus.PENDING -> "Tap to invite or start"
        MultiplayerStatus.ACTIVE -> when {
            game.isMyTurn -> {
                val secs = game.timeRemainingSeconds ?: 0
                if (secs > 0) "Your move · ${formatRemaining(secs)} left" else "Your move"
            }
            else -> "Waiting on another player"
        }
        MultiplayerStatus.COMPLETED -> "Tap to see stats"
        MultiplayerStatus.ABANDONED -> "Game ended early"
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
    HorizontalDivider()
}

private fun formatRemaining(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}
