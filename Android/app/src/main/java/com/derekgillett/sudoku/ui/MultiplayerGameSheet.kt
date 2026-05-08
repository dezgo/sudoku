package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.MultiplayerRepository
import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.network.MultiplayerGameDetail
import com.derekgillett.sudoku.network.MultiplayerMove
import com.derekgillett.sudoku.network.MultiplayerStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultiplayerGameSheet(
    gameId: String,
    multiplayerRepo: MultiplayerRepository,
    authRepo: AuthRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val me by authRepo.user.collectAsState()
    val scope = rememberCoroutineScope()

    var detail: MultiplayerGameDetail? by remember { mutableStateOf(null) }
    var selected: Pair<Int, Int>? by remember { mutableStateOf(null) }
    var loading by remember { mutableStateOf(true) }
    var errorText: String? by remember { mutableStateOf(null) }
    var pending by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            detail = multiplayerRepo.detail(gameId)
            errorText = null
        } catch (_: Exception) {
            errorText = "Couldn't load this game."
        }
        loading = false
    }

    LaunchedEffect(gameId) { load() }
    // Light poll while the sheet is open so turn changes appear without push.
    LaunchedEffect(gameId) {
        while (true) {
            delay(15_000)
            load()
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            val d = detail
            if (loading && d == null) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }
            } else if (d == null) {
                Text(
                    errorText ?: "Couldn't load.",
                    color = MaterialTheme.colorScheme.error
                )
                Button(onClick = { scope.launch { load() } }) { Text("Retry") }
            } else {
                StatusBanner(detail = d, myUserId = me?.id)
                Spacer(Modifier.size(8.dp))
                Board(detail = d, selected = selected, isMyTurn = d.game.activePlayerId == me?.id) { r, c ->
                    val onEmpty = d.board[r][c] == 0
                    val canSelect = d.game.activePlayerId == me?.id && d.game.status == MultiplayerStatus.ACTIVE && onEmpty
                    if (!canSelect) return@Board
                    selected = if (selected?.first == r && selected?.second == c) null else r to c
                }
                Spacer(Modifier.size(8.dp))

                when (d.game.status) {
                    MultiplayerStatus.PENDING -> PendingControls(
                        detail = d,
                        myUserId = me?.id,
                        pending = pending,
                        onStart = {
                            scope.launch {
                                pending = true
                                runCatching { multiplayerRepo.start(gameId) }
                                pending = false
                                load()
                            }
                        }
                    )
                    MultiplayerStatus.ACTIVE -> {
                        PlayersStrip(detail = d)
                        Spacer(Modifier.size(8.dp))
                        MoveHistoryStrip(detail = d)
                        Spacer(Modifier.size(8.dp))
                        if (d.game.activePlayerId == me?.id) {
                            Pad(
                                enabled = selected != null && !pending,
                                onPlace = { value ->
                                    val sel = selected ?: return@Pad
                                    scope.launch {
                                        pending = true
                                        try {
                                            multiplayerRepo.postMove(gameId, sel.first, sel.second, value)
                                            selected = null
                                            load()
                                        } catch (_: Exception) {
                                            errorText = "Couldn't place that move."
                                        }
                                        pending = false
                                    }
                                }
                            )
                        } else {
                            Text(
                                "Waiting for the other player. We'll push when it's your turn.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    MultiplayerStatus.COMPLETED, MultiplayerStatus.ABANDONED -> {
                        EndStats(detail = d)
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun StatusBanner(detail: MultiplayerGameDetail, myUserId: String?) {
    val game = detail.game
    val activeName = detail.players.firstOrNull { it.user.id == game.activePlayerId }?.user?.displayName ?: "—"
    val (label, tint) = when (game.status) {
        MultiplayerStatus.PENDING -> "Waiting to start" to Color(0xFFFFC107)
        MultiplayerStatus.ACTIVE -> if (game.activePlayerId == myUserId) {
            val secs = game.timeRemainingSeconds ?: 0
            (if (secs > 0) "Your turn · ${formatRemaining(secs)} left" else "Your turn") to MaterialTheme.colorScheme.primary
        } else {
            "${activeName}'s turn" to MaterialTheme.colorScheme.onSurfaceVariant
        }
        MultiplayerStatus.COMPLETED -> {
            val winner = detail.players.firstOrNull { it.user.id == game.winnerId }?.user?.displayName ?: "—"
            "Solved by $winner" to Color(0xFF2E7D32)
        }
        MultiplayerStatus.ABANDONED -> "Game abandoned" to MaterialTheme.colorScheme.error
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(tint.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp))
            .padding(10.dp)
    ) {
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Board(
    detail: MultiplayerGameDetail,
    selected: Pair<Int, Int>?,
    isMyTurn: Boolean,
    onSelect: (Int, Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
    ) {
        for (r in 0 until 9) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0 until 9) {
                    val v = detail.board[r][c]
                    val cell = Cell(
                        value = if (v == 0) null else v,
                        isFixed = v != 0 && !wasPlacedInGame(r, c, detail.moves),
                        notes = emptySet()
                    )
                    val isSelected = selected?.first == r && selected.second == c
                    val rightThick = (c + 1) % 3 == 0
                    val bottomThick = (r + 1) % 3 == 0
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxSize()
                            .border(
                                width = if (rightThick || bottomThick) 1.5.dp else 0.5.dp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            )
                            .clickable { onSelect(r, c) }
                    ) {
                        CellView(
                            cell = cell,
                            isSelected = isSelected,
                            isHighlighted = false,
                            isMatching = false,
                            isError = false,
                            isLocked = cell.value != null,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            }
        }
    }
}

private fun wasPlacedInGame(row: Int, col: Int, moves: List<MultiplayerMove>): Boolean =
    moves.any { it.row == row && it.col == col && it.wasCorrect }

@Composable
private fun PlayersStrip(detail: MultiplayerGameDetail) {
    val stats = perPlayerStats(detail)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        for (p in detail.players) {
            val s = stats[p.user.id] ?: PlayerStats()
            val isActive = detail.game.activePlayerId == p.user.id
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .background(
                        if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Icon(
                    Icons.Filled.Person,
                    contentDescription = null,
                    tint = if (isActive) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.size(6.dp))
                Column {
                    Text(
                        p.user.displayName ?: "—",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "${s.correct}✓ ${s.wrong}✗",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun MoveHistoryStrip(detail: MultiplayerGameDetail) {
    val last = detail.moves.takeLast(3)
    if (last.isEmpty()) return
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                RoundedCornerShape(6.dp)
            )
            .padding(8.dp)
    ) {
        Text(
            "Recent moves",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        for (m in last) {
            val name = detail.players.firstOrNull { it.user.id == m.playerId }?.user?.displayName ?: "—"
            val coord = "${"ABCDEFGHI"[m.row]}${m.col + 1}"
            val symbol = if (m.wasCorrect) "✓" else "✗"
            Text(
                "$symbol $name placed ${m.value} at $coord",
                style = MaterialTheme.typography.bodySmall,
                color = if (m.wasCorrect) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun Pad(enabled: Boolean, onPlace: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        for (n in 1..9) {
            OutlinedButton(
                onClick = { onPlace(n) },
                enabled = enabled,
                modifier = Modifier.weight(1f)
            ) { Text("$n") }
        }
    }
}

@Composable
private fun PendingControls(
    detail: MultiplayerGameDetail,
    myUserId: String?,
    pending: Boolean,
    onStart: () -> Unit
) {
    val isHost = detail.game.createdBy == myUserId
    val joinedCount = detail.players.count { it.status.name == "JOINED" }
    Column {
        PlayersStrip(detail)
        Spacer(Modifier.size(12.dp))
        Text(
            "Invite code: ${detail.game.inviteCode}",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            "Share: https://sudoku.appfoundry.cc/m/${detail.game.inviteCode}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            "Works on iPhone & Android — share with anyone.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.size(12.dp))
        if (isHost) {
            Button(
                onClick = onStart,
                enabled = joinedCount >= 2 && !pending,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (pending) CircularProgressIndicator(modifier = Modifier.size(18.dp))
                else Text(if (joinedCount >= 2) "Start game" else "Need at least 2 players")
            }
        } else {
            Text(
                "Waiting for the host to start.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun EndStats(detail: MultiplayerGameDetail) {
    val stats = perPlayerStats(detail)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                RoundedCornerShape(10.dp)
            )
            .padding(12.dp)
    ) {
        Text("Final stats", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.size(8.dp))
        for (p in detail.players) {
            val s = stats[p.user.id] ?: PlayerStats()
            val isWinner = p.user.id == detail.game.winnerId
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    p.user.displayName ?: "—",
                    fontWeight = if (isWinner) FontWeight.Bold else FontWeight.Normal
                )
                if (isWinner) {
                    Spacer(Modifier.size(4.dp))
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
                }
                Spacer(Modifier.weight(1f))
                Text(
                    "${s.correct} correct · ${s.wrong} miss",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private data class PlayerStats(val correct: Int = 0, val wrong: Int = 0)

private fun perPlayerStats(detail: MultiplayerGameDetail): Map<String, PlayerStats> {
    val out = mutableMapOf<String, PlayerStats>()
    for (m in detail.moves) {
        val s = out[m.playerId] ?: PlayerStats()
        out[m.playerId] = if (m.wasCorrect) s.copy(correct = s.correct + 1)
        else s.copy(wrong = s.wrong + 1)
    }
    return out
}

private fun formatRemaining(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}
