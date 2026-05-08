package com.derekgillett.sudoku.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.AutoFixOff
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.LightbulbCircle
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.RemoveRedEye
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.ScoresRepository
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.LeaderboardEntry

private const val TOP_N = 10

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaderboardSheet(
    puzzleId: Int,
    puzzleLabel: String,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    scoresRepo: ScoresRepository,
    onDismiss: () -> Unit,
    /** When the viewer just finished the puzzle themselves, the host can pass
     *  in the local mistake count so tapping their own row in the player
     *  detail sheet shows the exact penalty math. */
    ownMistakeCount: Int? = null
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val groups by groupsRepo.groups.collectAsState()
    val user by authRepo.user.collectAsState()
    val isSignedIn = authRepo.isSignedIn

    var selectedGroupId by remember(groups) {
        mutableStateOf(groups.firstOrNull()?.group?.id)
    }
    var rows by remember { mutableStateOf<List<LeaderboardEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showingBadgeLegend by remember { mutableStateOf(false) }
    var selectedEntry by remember { mutableStateOf<LeaderboardEntry?>(null) }

    LaunchedEffect(selectedGroupId, puzzleId) {
        val gid = selectedGroupId ?: return@LaunchedEffect
        if (!isSignedIn) return@LaunchedEffect
        isLoading = true
        errorMessage = null
        try {
            rows = scoresRepo.fetchLeaderboard(gid, puzzleId)
        } catch (_: ApiClient.ApiException.Offline) {
            errorMessage = "You're offline."
        } catch (_: ApiClient.ApiException) {
            errorMessage = "Couldn't load leaderboard."
        }
        isLoading = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    "Leaderboard",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )
                androidx.compose.material3.IconButton(
                    onClick = { showingBadgeLegend = true },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        androidx.compose.material.icons.Icons.Outlined.Info,
                        contentDescription = "What do the badges mean?",
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                puzzleLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))

            when {
                !isSignedIn -> SignedOutEmpty()
                groups.isEmpty() -> NoGroupsEmpty()
                else -> {
                    if (groups.size >= 2) {
                        SingleChoiceSegmentedButtonRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            groups.forEachIndexed { i, item ->
                                SegmentedButton(
                                    selected = item.group.id == selectedGroupId,
                                    onClick = { selectedGroupId = item.group.id },
                                    shape = SegmentedButtonDefaults.itemShape(index = i, count = groups.size)
                                ) { Text(item.group.name) }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    when {
                        isLoading && rows.isEmpty() ->
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(24.dp),
                                contentAlignment = Alignment.Center
                            ) { CircularProgressIndicator() }

                        errorMessage != null && rows.isEmpty() ->
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(errorMessage!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.height(8.dp))
                                TextButton(onClick = {
                                    selectedGroupId = selectedGroupId  // re-trigger LaunchedEffect
                                }) { Text("Try again") }
                            }

                        rows.isEmpty() ->
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    "No one's solved today's daily yet.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Be the first.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                        else -> {
                            val top = rows.take(TOP_N)
                            val myName = user?.displayName
                            val myRow = if (myName != null) rows.firstOrNull { it.displayName == myName } else null
                            val pinnedRow = myRow?.takeIf { it.rank > TOP_N }

                            LazyColumn(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                items(top, key = { it.rank }) { entry ->
                                    LeaderboardRow(
                                        entry = entry,
                                        highlight = myName != null && entry.displayName == myName,
                                        onClick = { selectedEntry = entry }
                                    )
                                }
                                if (pinnedRow != null) {
                                    item {
                                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                                        Text(
                                            "Your rank",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                    item {
                                        LeaderboardRow(
                                            entry = pinnedRow,
                                            highlight = true,
                                            onClick = { selectedEntry = pinnedRow }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showingBadgeLegend) {
        BadgeLegendSheet(onDismiss = { showingBadgeLegend = false })
    }

    selectedEntry?.let { entry ->
        val isMe = user?.displayName != null && user?.displayName == entry.displayName
        LeaderboardEntryDetailSheet(
            entry = entry,
            isMe = isMe,
            myMistakeCount = if (isMe) ownMistakeCount else null,
            onDismiss = { selectedEntry = null }
        )
    }
}

@Composable
private fun LeaderboardRow(
    entry: LeaderboardEntry,
    highlight: Boolean,
    onClick: () -> Unit
) {
    val color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            "${entry.rank}",
            modifier = Modifier.size(width = 32.dp, height = 24.dp),
            color = color,
            fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal,
            textAlign = TextAlign.End
        )
        Spacer(Modifier.size(12.dp))
        Text(
            entry.displayName ?: "—",
            color = color,
            fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal
        )
        Spacer(Modifier.size(8.dp))
        BadgeRow(entry)
        Spacer(Modifier.weight(1f))
        Text(
            formatTime(entry.effectiveSecondsOrFallback),
            color = color,
            fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal
        )
        Spacer(Modifier.size(4.dp))
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp)
        )
    }
}

/** Three independent badges — no mega-badge. Each shows when the
 * corresponding "didn't use" condition holds. More legible than rolling
 * three signals into one gold star. Highlighting toggles aren't surfaced
 * — they're learning aids, not real assists. */
@Composable
private fun BadgeRow(entry: LeaderboardEntry) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (entry.hintsUsed == 0) {
            Icon(
                Icons.Outlined.LightbulbCircle,
                contentDescription = "Solo — solved without using the tutor",
                tint = androidx.compose.ui.graphics.Color(0xFF2E7D32),
                modifier = Modifier.size(18.dp)
            )
        }
        if (entry.pencilAssistsUsed == 0) {
            Icon(
                Icons.Outlined.AutoFixOff,
                contentDescription = "Manual — solved without auto-pencil",
                tint = androidx.compose.ui.graphics.Color(0xFF8E24AA),
                modifier = Modifier.size(18.dp)
            )
        }
        if (entry.flawless) {
            Icon(
                Icons.Filled.CheckCircle,
                contentDescription = "Flawless — solved without any mistakes",
                tint = androidx.compose.ui.graphics.Color(0xFF26A69A),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun SignedOutEmpty() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Outlined.Person,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Sign in to see leaderboards.",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "You'll be able to compare your time with friends in your groups.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun NoGroupsEmpty() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Outlined.Person,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Join a group to see leaderboards.",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Create one and share the invite code, or join with a code from a friend. Settings → Groups.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}
