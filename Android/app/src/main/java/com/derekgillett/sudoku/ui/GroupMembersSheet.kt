package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.ApiGroup
import com.derekgillett.sudoku.network.GroupMember
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Bottom sheet listing the roster of a single group. Reachable from the
 * Groups section of the Settings sheet by tapping a group row. Mirrors
 * GroupMembersView.swift on iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupMembersSheet(
    group: ApiGroup,
    groupsRepo: GroupsRepository,
    authRepo: AuthRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val me by authRepo.user.collectAsState()
    var members by remember { mutableStateOf<List<GroupMember>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText: String? by remember { mutableStateOf(null) }
    val dateFmt = remember { SimpleDateFormat("MMM d", Locale.getDefault()) }

    LaunchedEffect(group.id) {
        loading = true
        errorText = null
        runCatching { groupsRepo.members(group.id) }
            .onSuccess { members = it }
            .onFailure {
                errorText = if (it is ApiClient.ApiException.Offline)
                    "You're offline." else "Couldn't load members."
            }
        loading = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
            Text(
                group.name,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            when {
                loading -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp),
                        horizontalArrangement = Arrangement.Center
                    ) { CircularProgressIndicator() }
                }
                errorText != null -> {
                    Text(
                        errorText!!,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp)
                    )
                }
                else -> {
                    members.forEach { member ->
                        val isMe = me?.id == member.user.id
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                        ) {
                            Icon(
                                Icons.Outlined.AccountCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.size(12.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        member.user.displayName ?: "—",
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = if (isMe) FontWeight.SemiBold else FontWeight.Normal
                                    )
                                    if (isMe) {
                                        Spacer(Modifier.size(8.dp))
                                        Text(
                                            "(you)",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                Text(
                                    statsLine(member, dateFmt),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

private fun statsLine(member: GroupMember, fmt: SimpleDateFormat): String {
    val n = member.dailiesCompleted
    val dailies = "$n " + if (n == 1) "daily" else "dailies"
    val ts = member.lastCompletedAt
    return when {
        ts != null -> "$dailies · last ${fmt.format(Date(ts))}"
        n == 0 -> "no dailies yet"
        else -> dailies
    }
}
