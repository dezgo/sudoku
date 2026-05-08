package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.MultiplayerRepository
import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.network.ApiClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultiplayerCreateSheet(
    multiplayerRepo: MultiplayerRepository,
    groupsRepo: GroupsRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val groups by groupsRepo.groups.collectAsState()
    val scope = rememberCoroutineScope()

    var difficulty by remember { mutableStateOf(Difficulty.MEDIUM) }
    var turnDuration by remember { mutableStateOf(TurnDurationOption.TWENTY_FOUR_HOURS) }
    var competitive by remember { mutableStateOf(false) }
    var selectedGroupId: String? by remember { mutableStateOf(null) }
    var groupMenuOpen by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var errorText: String? by remember { mutableStateOf(null) }
    var createdInviteCode: String? by remember { mutableStateOf(null) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            Text(
                "New game",
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            if (createdInviteCode != null) {
                CreatedInviteSection(code = createdInviteCode!!, onDone = onDismiss)
            } else {
                Text("Difficulty", style = MaterialTheme.typography.titleSmall)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    Difficulty.entries.forEachIndexed { idx, value ->
                        SegmentedButton(
                            selected = difficulty == value,
                            onClick = { difficulty = value },
                            shape = SegmentedButtonDefaults.itemShape(idx, Difficulty.entries.size)
                        ) { Text(value.label) }
                    }
                }
                Spacer(Modifier.size(16.dp))

                Text("Turn duration", style = MaterialTheme.typography.titleSmall)
                Column {
                    TurnDurationOption.entries.forEach { opt ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            androidx.compose.material3.RadioButton(
                                selected = turnDuration == opt,
                                onClick = { turnDuration = opt }
                            )
                            Spacer(Modifier.size(8.dp))
                            Text(opt.label)
                        }
                    }
                }
                Spacer(Modifier.size(16.dp))

                Text("Competitive mode", style = MaterialTheme.typography.titleSmall)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Switch(checked = competitive, onCheckedChange = { competitive = it })
                    Spacer(Modifier.size(8.dp))
                    Text(
                        if (competitive)
                            "Single-winner ranking (correct − 2 × mistakes)"
                        else
                            "Stats salad — everyone earns a badge",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.size(16.dp))

                if (groups.isNotEmpty()) {
                    Text("Invite a group (optional)", style = MaterialTheme.typography.titleSmall)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { groupMenuOpen = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val label = selectedGroupId
                                ?.let { id -> groups.firstOrNull { it.group.id == id }?.group?.name ?: "Pick a group" }
                                ?: "No group"
                            Text(label)
                        }
                        DropdownMenu(
                            expanded = groupMenuOpen,
                            onDismissRequest = { groupMenuOpen = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("No group") },
                                onClick = { selectedGroupId = null; groupMenuOpen = false }
                            )
                            groups.forEach { item ->
                                DropdownMenuItem(
                                    text = { Text(item.group.name) },
                                    onClick = {
                                        selectedGroupId = item.group.id
                                        groupMenuOpen = false
                                    }
                                )
                            }
                        }
                    }
                }

                errorText?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.size(8.dp))
                }

                Button(
                    onClick = {
                        busy = true
                        errorText = null
                        scope.launch {
                            try {
                                val response = multiplayerRepo.create(
                                    difficulty = difficulty,
                                    turnDurationSeconds = turnDuration.seconds,
                                    competitiveMode = competitive,
                                    invitedUserIds = null,
                                    groupId = selectedGroupId
                                )
                                createdInviteCode = response.inviteCode
                            } catch (e: ApiClient.ApiException.Http) {
                                errorText = if (e.status == 409)
                                    "You've hit the limit of 10 active games. Finish one first."
                                else "Couldn't create the game. Try again."
                            } catch (_: ApiClient.ApiException) {
                                errorText = "Couldn't create the game."
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
                    else Text("Create game")
                }
                Spacer(Modifier.size(8.dp))
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("Cancel")
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun CreatedInviteSection(code: String, onDone: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            "Game ready",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.size(12.dp))
        Text("Invite code", style = MaterialTheme.typography.labelSmall)
        Text(
            code,
            fontSize = 36.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    shape = RoundedCornerShape(12.dp)
                )
                .padding(16.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.size(12.dp))
        Text(
            "Share this code with anyone you want in. Group members already got a push.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.size(16.dp))
        Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done") }
    }
}

enum class TurnDurationOption(val seconds: Int, val label: String) {
    ONE_HOUR(3600, "1 hour"),
    SIX_HOURS(21600, "6 hours"),
    TWENTY_FOUR_HOURS(86400, "24 hours"),
    UNLIMITED(0, "No limit")
}
