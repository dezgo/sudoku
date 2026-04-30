package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import kotlinx.coroutines.launch

private enum class Step { EMAIL, CODE, DISPLAY_NAME, GROUP_ONBOARDING }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignInSheet(
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    var step by remember { mutableStateOf(Step.EMAIL) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var errorText by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun advanceFromVerified() {
        scope.launch {
            groupsRepo.refresh()
            step = if (groupsRepo.groups.value.isEmpty()) Step.GROUP_ONBOARDING else {
                onDismiss()
                return@launch
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!busy) onDismiss() },
        sheetState = sheetState
    ) {
        Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
            Text(
                when (step) {
                    Step.EMAIL -> "Sign in"
                    Step.CODE -> "Enter code"
                    Step.DISPLAY_NAME -> "Choose a name"
                    Step.GROUP_ONBOARDING -> "Groups"
                },
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            when (step) {
                Step.EMAIL -> EmailStep(
                    email = email,
                    onEmailChange = { email = it; errorText = null },
                    error = errorText,
                    busy = busy,
                    onSubmit = {
                        busy = true
                        errorText = null
                        scope.launch {
                            errorText = runCatching {
                                authRepo.startSignIn(email)
                                step = Step.CODE
                                code = ""
                                null
                            }.getOrElse { msgFor(it) }
                            busy = false
                        }
                    }
                )

                Step.CODE -> CodeStep(
                    email = email,
                    code = code,
                    onCodeChange = { code = it.filter { ch -> ch.isDigit() }.take(6); errorText = null },
                    error = errorText,
                    busy = busy,
                    onSubmit = {
                        busy = true
                        errorText = null
                        scope.launch {
                            val result = runCatching { authRepo.verifySignIn(email, code) }
                            result.onSuccess { needsName ->
                                if (needsName) step = Step.DISPLAY_NAME
                                else advanceFromVerified()
                            }.onFailure { errorText = msgFor(it) }
                            busy = false
                        }
                    },
                    onUseDifferentEmail = {
                        code = ""
                        errorText = null
                        step = Step.EMAIL
                    }
                )

                Step.DISPLAY_NAME -> DisplayNameStep(
                    displayName = displayName,
                    onDisplayNameChange = { displayName = it; errorText = null },
                    error = errorText,
                    busy = busy,
                    onSubmit = {
                        busy = true
                        errorText = null
                        scope.launch {
                            errorText = runCatching {
                                authRepo.setDisplayName(displayName)
                                advanceFromVerified()
                                null
                            }.getOrElse { msgFor(it) }
                            busy = false
                        }
                    }
                )

                Step.GROUP_ONBOARDING -> GroupOnboardingContent(
                    groupsRepo = groupsRepo,
                    onComplete = onDismiss
                )
            }
            Spacer(Modifier.size(24.dp))
        }
    }

    LaunchedEffect(step) {
        // Auto-clear error on step change.
        errorText = null
    }
}

@Composable
private fun EmailStep(
    email: String,
    onEmailChange: (String) -> Unit,
    error: String?,
    busy: Boolean,
    onSubmit: () -> Unit
) {
    Text(
        "We'll send you a 6-digit code.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.size(12.dp))
    OutlinedTextField(
        value = email,
        onValueChange = onEmailChange,
        label = { Text("Email") },
        placeholder = { Text("you@example.com") },
        singleLine = true,
        keyboardOptions = KeyboardOptions.Default.copy(
            keyboardType = KeyboardType.Email,
            capitalization = KeyboardCapitalization.None
        ),
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.size(12.dp))
    Button(
        onClick = onSubmit,
        enabled = email.isNotBlank() && !busy,
        modifier = Modifier.fillMaxWidth()
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
        else Text("Send code")
    }
}

@Composable
private fun CodeStep(
    email: String,
    code: String,
    onCodeChange: (String) -> Unit,
    error: String?,
    busy: Boolean,
    onSubmit: () -> Unit,
    onUseDifferentEmail: () -> Unit
) {
    Text(
        "Code sent to $email.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.size(12.dp))
    OutlinedTextField(
        value = code,
        onValueChange = onCodeChange,
        label = { Text("6-digit code") },
        placeholder = { Text("123456") },
        singleLine = true,
        keyboardOptions = KeyboardOptions.Default.copy(keyboardType = KeyboardType.NumberPassword),
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.size(12.dp))
    Button(
        onClick = onSubmit,
        enabled = code.length == 6 && !busy,
        modifier = Modifier.fillMaxWidth()
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
        else Text("Verify")
    }
    TextButton(onClick = onUseDifferentEmail, enabled = !busy) {
        Text("Use a different email")
    }
}

@Composable
private fun DisplayNameStep(
    displayName: String,
    onDisplayNameChange: (String) -> Unit,
    error: String?,
    busy: Boolean,
    onSubmit: () -> Unit
) {
    Text(
        "This is what shows up on the leaderboard.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.size(12.dp))
    OutlinedTextField(
        value = displayName,
        onValueChange = onDisplayNameChange,
        label = { Text("Display name") },
        singleLine = true,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.size(12.dp))
    Button(
        onClick = onSubmit,
        enabled = displayName.isNotBlank() && !busy,
        modifier = Modifier.fillMaxWidth()
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
        else Text("Continue")
    }
}

private fun msgFor(t: Throwable): String = when (t) {
    AuthRepository.SignInError.InvalidEmail -> "That doesn't look like a valid email."
    AuthRepository.SignInError.WrongCode -> "That code didn't match."
    AuthRepository.SignInError.CodeExpired -> "Code expired — request a new one."
    AuthRepository.SignInError.TooManyAttempts -> "Too many tries. Request a new code."
    AuthRepository.SignInError.Offline -> "You're offline."
    else -> "Something went wrong. Try again."
}
