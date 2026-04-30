package com.derekgillett.sudoku.ui

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.network.ApiClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupOnboardingSheet(
    groupsRepo: GroupsRepository,
    onDone: () -> Unit,
    onSkip: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onSkip,
        sheetState = sheetState
    ) {
        Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
            Text(
                "Add a group",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            GroupOnboardingContent(
                groupsRepo = groupsRepo,
                onComplete = onDone
            )
            Spacer(Modifier.size(24.dp))
        }
    }
}

private enum class OnboardingMode { PICKER, CREATING, JOINING }

/**
 * Shared content used by both the standalone GroupOnboardingSheet (Settings →
 * Add a group) and the SignInSheet's final step.
 */
@Composable
fun GroupOnboardingContent(
    groupsRepo: GroupsRepository,
    onComplete: () -> Unit
) {
    var mode by remember { mutableStateOf(OnboardingMode.PICKER) }
    var groupName by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var createdInviteCode: String? by remember { mutableStateOf(null) }
    var errorText: String? by remember { mutableStateOf(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    when (mode) {
        OnboardingMode.PICKER -> {
            Text(
                "Groups are how you compare times with your friends and family. The same daily, separate leaderboards.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(16.dp))
            Button(
                onClick = {
                    groupName = ""
                    errorText = null
                    mode = OnboardingMode.CREATING
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("Create a group")
            }
            Spacer(Modifier.size(8.dp))
            OutlinedButton(
                onClick = {
                    inviteCode = ""
                    errorText = null
                    mode = OnboardingMode.JOINING
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Join with a code")
            }
            Spacer(Modifier.size(8.dp))
            TextButton(onClick = onComplete) { Text("Skip for now") }
        }

        OnboardingMode.CREATING -> {
            val code = createdInviteCode
            if (code != null) {
                CreatedConfirmation(
                    code = code,
                    onShare = {
                        val intent = Intent().apply {
                            action = Intent.ACTION_SEND
                            putExtra(Intent.EXTRA_TEXT, "Join my Sudoku group with code: $code")
                            type = "text/plain"
                        }
                        context.startActivity(Intent.createChooser(intent, null))
                    },
                    onDone = onComplete
                )
            } else {
                Text(
                    "Pick a name for your group. You can share the join code with friends after.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.size(12.dp))
                OutlinedTextField(
                    value = groupName,
                    onValueChange = { groupName = it; errorText = null },
                    label = { Text("Group name") },
                    placeholder = { Text("e.g. The Gillett Family") },
                    singleLine = true,
                    isError = errorText != null,
                    supportingText = errorText?.let { { Text(it) } },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.size(12.dp))
                Button(
                    onClick = {
                        busy = true
                        errorText = null
                        scope.launch {
                            val result = runCatching { groupsRepo.create(groupName.trim()) }
                            result.onSuccess { createdInviteCode = it.inviteCode }
                                .onFailure {
                                    errorText = if (it is ApiClient.ApiException.Offline)
                                        "You're offline." else "Couldn't create the group."
                                }
                            busy = false
                        }
                    },
                    enabled = groupName.isNotBlank() && !busy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
                    else Text("Create")
                }
                TextButton(onClick = { mode = OnboardingMode.PICKER }, enabled = !busy) {
                    Text("Back")
                }
            }
        }

        OnboardingMode.JOINING -> {
            Text(
                "Type the 6-character code your friend sent you.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(12.dp))
            OutlinedTextField(
                value = inviteCode,
                onValueChange = {
                    // Server expects uppercase base32 (no 0/1/I/L/O); keep input clean.
                    inviteCode = it.uppercase().take(6)
                    errorText = null
                },
                label = { Text("Invite code") },
                placeholder = { Text("ABC23F") },
                singleLine = true,
                keyboardOptions = KeyboardOptions.Default.copy(
                    capitalization = KeyboardCapitalization.Characters
                ),
                isError = errorText != null,
                supportingText = errorText?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.size(12.dp))
            Button(
                onClick = {
                    busy = true
                    errorText = null
                    scope.launch {
                        val result = runCatching { groupsRepo.join(inviteCode.trim().uppercase()) }
                        result.onSuccess { onComplete() }
                            .onFailure {
                                errorText = when (it) {
                                    is ApiClient.ApiException.Offline -> "You're offline."
                                    is ApiClient.ApiException.Http ->
                                        if (it.status == 404) "We don't recognise that code." else "Couldn't join."
                                    else -> "Couldn't join."
                                }
                            }
                        busy = false
                    }
                },
                enabled = inviteCode.length == 6 && !busy,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
                else Text("Join")
            }
            TextButton(onClick = { mode = OnboardingMode.PICKER }, enabled = !busy) {
                Text("Back")
            }
        }
    }
}

@Composable
private fun CreatedConfirmation(
    code: String,
    onShare: () -> Unit,
    onDone: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.size(8.dp))
        Text(
            "Group created",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.size(8.dp))
        Text(
            "Share this code with the people you want in:",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.size(12.dp))
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = code,
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
        Spacer(Modifier.size(12.dp))
        OutlinedButton(onClick = onShare, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Share, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Share invite")
        }
        Spacer(Modifier.size(8.dp))
        Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done") }
    }
}
