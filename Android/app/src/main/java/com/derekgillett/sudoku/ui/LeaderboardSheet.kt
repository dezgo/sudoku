package com.derekgillett.sudoku.ui

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
import androidx.compose.material.icons.outlined.Person
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
    onDismiss: () -> Unit
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
            Text(
                "Leaderboard",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )
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
                                        highlight = myName != null && entry.displayName == myName
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
                                    item { LeaderboardRow(entry = pinnedRow, highlight = true) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRow(entry: LeaderboardEntry, highlight: Boolean) {
    val color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
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
            modifier = Modifier.weight(1f),
            color = color,
            fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal
        )
        Text(
            formatTime(entry.elapsedSeconds),
            color = color,
            fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal
        )
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
