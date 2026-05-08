package com.derekgillett.sudoku.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import android.content.Intent
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AppearancePreference
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.ApiGroup
import com.derekgillett.sudoku.state.SudokuGameViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    onSignIn: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    val user by authRepo.user.collectAsState()
    val groups by groupsRepo.groups.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var showingAddGroup by remember { mutableStateOf(false) }
    var addGroupInitialMode by remember { mutableStateOf(OnboardingMode.PICKER) }
    var viewingMembersOf: ApiGroup? by remember { mutableStateOf(null) }
    var leavingGroup: ApiGroup? by remember { mutableStateOf(null) }
    var confirmingDeleteAccount by remember { mutableStateOf(false) }
    var deleteAccountError: String? by remember { mutableStateOf(null) }
    var isDeletingAccount by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            Text(
                "Settings",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Account section
            Text(
                "Account",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            val displayName = user?.displayName
            if (displayName != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Outlined.AccountCircle, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text(displayName, style = MaterialTheme.typography.bodyLarge)
                }
                TextButton(
                    onClick = {
                        authRepo.signOut()
                        scope.launch { groupsRepo.clear() }
                    }
                ) {
                    Text("Sign out", color = MaterialTheme.colorScheme.error)
                }
                TextButton(
                    onClick = { confirmingDeleteAccount = true },
                    enabled = !isDeletingAccount
                ) {
                    Text(
                        if (isDeletingAccount) "Deleting…" else "Delete account",
                        color = MaterialTheme.colorScheme.error
                    )
                }
                deleteAccountError?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            } else if (authRepo.isSignedIn) {
                TextButton(onClick = onSignIn) {
                    Text("Set display name")
                }
            } else {
                TextButton(onClick = onSignIn) {
                    Icon(Icons.Outlined.AccountCircle, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Sign in")
                }
            }

            // Groups section (only when signed in)
            if (authRepo.isSignedIn) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                Text(
                    "Groups",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
                groups.forEach { item ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { viewingMembersOf = item.group }
                                    .padding(vertical = 4.dp)
                            ) {
                                Text(item.group.name, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    "${item.memberCount} member${if (item.memberCount == 1) "" else "s"}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            TextButton(onClick = { leavingGroup = item.group }) {
                                Text("Leave", color = MaterialTheme.colorScheme.error)
                            }
                        }
                        item.inviteCode?.let { code ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 2.dp)
                            ) {
                                Text(
                                    "Code",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.size(8.dp))
                                Text(
                                    code,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace
                                )
                                Spacer(Modifier.weight(1f))
                                IconButton(onClick = {
                                    val intent = Intent().apply {
                                        action = Intent.ACTION_SEND
                                        putExtra(Intent.EXTRA_TEXT, "Join my Sudoku group with code: $code")
                                        type = "text/plain"
                                    }
                                    context.startActivity(Intent.createChooser(intent, null))
                                }) {
                                    Icon(
                                        Icons.Outlined.Share,
                                        contentDescription = "Share invite",
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                }
                TextButton(onClick = {
                    addGroupInitialMode = OnboardingMode.CREATING
                    showingAddGroup = true
                }) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.size(6.dp))
                    Text("Create a group")
                }
                TextButton(onClick = {
                    addGroupInitialMode = OnboardingMode.JOINING
                    showingAddGroup = true
                }) {
                    Icon(Icons.Outlined.QrCode, contentDescription = null)
                    Spacer(Modifier.size(6.dp))
                    Text("Join with a code")
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Highlighting section
            Text(
                "Highlighting",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            ToggleRow(
                label = "Highlight mistakes",
                value = state?.highlightMistakes ?: true,
                onChange = { viewModel.setHighlightMistakes(it) }
            )
            ToggleRow(
                label = "Highlight rules",
                value = state?.highlightConstraints ?: true,
                onChange = { viewModel.setHighlightConstraints(it) }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Sounds section
            Text(
                "Sounds",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            ToggleRow(
                label = "Sound effects",
                value = prefs?.soundEffects ?: true,
                onChange = { v -> scope.launch { prefsRepo.setSoundEffects(v) } }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Appearance section
            Text(
                "Appearance",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            val current = prefs?.appearance ?: AppearancePreference.SYSTEM
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                AppearancePreference.entries.forEachIndexed { idx, value ->
                    SegmentedButton(
                        selected = current == value,
                        onClick = {
                            scope.launch { prefsRepo.setAppearance(value) }
                        },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = idx,
                            count = AppearancePreference.entries.size
                        )
                    ) { Text(value.label) }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }

    if (showingAddGroup) {
        GroupOnboardingSheet(
            groupsRepo = groupsRepo,
            onDone = { showingAddGroup = false },
            onSkip = { showingAddGroup = false },
            initialMode = addGroupInitialMode
        )
    }

    viewingMembersOf?.let { group ->
        GroupMembersSheet(
            group = group,
            groupsRepo = groupsRepo,
            authRepo = authRepo,
            onDismiss = { viewingMembersOf = null }
        )
    }

    leavingGroup?.let { group ->
        AlertDialog(
            onDismissRequest = { leavingGroup = null },
            title = { Text("Leave group?") },
            text = { Text("You'll stop seeing the leaderboard for ${group.name}.") },
            confirmButton = {
                TextButton(onClick = {
                    val target = group
                    leavingGroup = null
                    scope.launch { runCatching { groupsRepo.leave(target.id) } }
                }) {
                    Text("Leave", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { leavingGroup = null }) { Text("Cancel") }
            }
        )
    }

    if (confirmingDeleteAccount) {
        AlertDialog(
            onDismissRequest = { confirmingDeleteAccount = false },
            title = { Text("Delete your account?") },
            text = {
                Text(
                    "This permanently erases your account, daily history, group memberships, and any games you've played. This can't be undone."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDeleteAccount = false
                    isDeletingAccount = true
                    deleteAccountError = null
                    scope.launch {
                        try {
                            authRepo.deleteAccount()
                            groupsRepo.clear()
                            onDismiss()
                        } catch (_: ApiClient.ApiException.Offline) {
                            deleteAccountError = "You're offline. Try again when you're back online."
                        } catch (_: Exception) {
                            deleteAccountError =
                                "Couldn't delete your account. Please try again or contact support."
                        }
                        isDeletingAccount = false
                    }
                }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDeleteAccount = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun ToggleRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = value, onCheckedChange = onChange)
    }
}
