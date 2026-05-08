package com.derekgillett.sudoku.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.utf16CodePoint
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AuthRepository
import com.derekgillett.sudoku.data.GroupsRepository
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.state.SudokuGameViewModel
import com.derekgillett.sudoku.state.TutorHint
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

@Composable
fun GameScreen(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository,
    authRepo: AuthRepository,
    groupsRepo: GroupsRepository,
    onSignIn: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    val s = state ?: return
    var showingSettings by remember { mutableStateOf(false) }
    var confirmingReset by remember { mutableStateOf(false) }

    // Tutor sheet state
    var showingTutor by remember { mutableStateOf(false) }
    var tutorHint by remember { mutableStateOf<TutorHint?>(null) }
    var tutorStepIndex by remember { mutableIntStateOf(0) }

    // Auto-pencil pending banner state — tap fires action only after the
    // window expires, so the user never sees marks they're about to undo.
    var autoPencilPending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    var autoPencilJob by remember { mutableStateOf<Job?>(null) }

    fun cancelAutoPencilPending() {
        autoPencilJob?.cancel()
        autoPencilJob = null
        autoPencilPending = false
    }

    fun tappedAutoPencil() {
        cancelAutoPencilPending()
        autoPencilPending = true
        autoPencilJob = scope.launch {
            delay(3_000)
            // Clear pending *before* mutating so the cells-watcher below
            // doesn't immediately cancel itself when the fill happens.
            autoPencilPending = false
            autoPencilJob = null
            viewModel.autoPencil()
        }
    }

    // Cancel pending auto-pencil if the user does anything else (place,
    // erase, etc.) — mirrors iOS's onChange-of-cells handler.
    LaunchedEffect(autoPencilPending) {
        if (!autoPencilPending) return@LaunchedEffect
        snapshotFlow { state?.cells }
            .drop(1)
            .collect {
                if (autoPencilPending) cancelAutoPencilPending()
            }
    }

    // Hardware-keyboard support for tablets/devices with attached keyboards.
    // The focus requester grabs focus on first composition so key events
    // route here without the user having to tap something first.
    val keyboardFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { keyboardFocus.requestFocus() } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .padding(vertical = 12.dp)
            .focusRequester(keyboardFocus)
            .focusable()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                handleGameKey(event.key, event.utf16CodePoint, viewModel, s)
            },
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ANDROID-ONLY DIVERGENCE: header is split across two rows.
        // iOS uses a single row but its phone widths + SwiftUI's auto-shrink
        // accommodate the title + stats + 4 action icons in one line. On
        // Android Compose, that combination overflows on typical phone
        // widths. Splitting into [title row] + [stats + icons row] keeps
        // the title fully readable AND the icon cluster at full size.
        // (See feedback_dual_platform_workflow memory — preserve this on
        // future iOS-to-Android ports.)

        // Row 1: title + solved-seal.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = s.puzzle.displayLabel,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            if (s.isSolved) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF2E7D32)
                )
            }
        }

        // Row 2: stats on the left, action icons on the right.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (s.highlightMistakes) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = if (s.mistakeCount > 0) Color(0xFFD32F2F)
                        else MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        "${s.mistakeCount}",
                        fontWeight = FontWeight.SemiBold,
                        color = if (s.mistakeCount > 0) Color(0xFFD32F2F)
                        else MaterialTheme.colorScheme.onSurface
                    )
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(Icons.Filled.Schedule, contentDescription = null)
                Text(s.formattedTime, fontWeight = FontWeight.SemiBold)
            }
            Spacer(modifier = Modifier.weight(1f))
            // Use plain clickable Boxes rather than Material3 IconButton —
            // IconButton imposes internal sizing tokens that ignore the
            // child Icon's Modifier.size, so icons render at the default
            // 24dp regardless of what we ask for. A bare Box gives full
            // control over the icon size while keeping a 48dp tap target.
            HeaderIcon(
                icon = Icons.Filled.AutoFixHigh,
                description = "Auto-pencil",
                enabled = !s.isPaused && !s.isSolved && !autoPencilPending,
                onClick = { tappedAutoPencil() }
            )
            HeaderIcon(
                icon = Icons.Filled.Lightbulb,
                description = "Tutor",
                tint = Color(0xFFFBC02D),
                enabled = !s.isPaused && !s.isSolved,
                onClick = {
                    tutorStepIndex = 0
                    tutorHint = viewModel.nextTutorHint()
                    showingTutor = true
                    // Charge the "hint used" badge as soon as a hint is shown,
                    // even if the user dismisses without tapping Apply / Got it.
                    // Empty state (no hint available) is free.
                    if (tutorHint != null) {
                        viewModel.noteHintViewed()
                    }
                }
            )
            HeaderIcon(
                icon = if (s.isPaused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                description = if (s.isPaused) "Resume" else "Pause",
                onClick = { viewModel.togglePause() }
            )
            HeaderIcon(
                icon = Icons.Filled.Settings,
                description = "Settings",
                onClick = { showingSettings = true }
            )
        }

        Box {
            BoardView(
                state = s,
                onSelect = { r, c -> viewModel.select(r, c) },
                onResume = { viewModel.togglePause() },
                modifier = Modifier.padding(horizontal = 8.dp),
                tutorHighlights = if (showingTutor) tutorHint?.steps?.getOrNull(tutorStepIndex)?.highlights else null
            )
        }

        NumberPadView(
            viewModel = viewModel,
            state = s,
            modifier = Modifier.padding(horizontal = 8.dp)
        )

        // Bottom controls — Home + Reset.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = { viewModel.goHome() },
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Filled.Home, contentDescription = null)
                Spacer(Modifier.size(6.dp))
                Text("Home")
            }
            OutlinedButton(
                onClick = { confirmingReset = true },
                modifier = Modifier.weight(1f)
            ) {
                Text("Reset")
            }
        }

        // Auto-pencil pending banner — slides in below the controls during
        // the cancel window. Single tap on Cancel aborts the pending fill.
        AnimatedVisibility(
            visible = autoPencilPending,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it }),
            exit = fadeOut() + slideOutVertically(targetOffsetY = { it })
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    Icons.Filled.AutoFixHigh,
                    contentDescription = null,
                    tint = Color(0xFFFBC02D)
                )
                Text(
                    "Auto-pencilling…",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { cancelAutoPencilPending() }) {
                    Text("Cancel")
                }
            }
        }
    }

    if (showingSettings) {
        SettingsSheet(
            viewModel = viewModel,
            prefsRepo = prefsRepo,
            authRepo = authRepo,
            groupsRepo = groupsRepo,
            onSignIn = {
                showingSettings = false
                onSignIn()
            },
            onDismiss = { showingSettings = false }
        )
    }
    if (confirmingReset) {
        AlertDialog(
            onDismissRequest = { confirmingReset = false },
            title = { Text("Reset puzzle?") },
            text = { Text("This will clear your progress on this puzzle.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.reset()
                    confirmingReset = false
                }) { Text("Reset") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingReset = false }) { Text("Cancel") }
            }
        )
    }
    if (showingTutor) {
        TutorSheet(
            hint = tutorHint,
            stepIndex = tutorStepIndex,
            hasAnyPencilMarks = s.hasAnyPencilMarks,
            onStepIndexChange = { tutorStepIndex = it },
            onApply = { hint ->
                viewModel.applyTutorHint(hint)
                showingTutor = false
                tutorHint = null
                tutorStepIndex = 0
            },
            onDismiss = {
                showingTutor = false
                tutorHint = null
                tutorStepIndex = 0
            }
        )
    }
}

/**
 * Header icon button. A 48dp clickable Box wrapping a 32dp Icon — bypasses
 * Material3 IconButton's internal sizing tokens that constrain icons to the
 * default 24dp regardless of any Modifier.size on the child.
 */
@Composable
private fun HeaderIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    tint: Color = androidx.compose.ui.graphics.Color.Unspecified,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = description,
            tint = if (enabled) (if (tint == androidx.compose.ui.graphics.Color.Unspecified) MaterialTheme.colorScheme.onSurface else tint)
                   else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
            modifier = Modifier.size(32.dp)
        )
    }
}


/**
 * Hardware-keyboard handler for the playing screen. Maps:
 *   - Digits 1–9 → place / pencil-toggle (depends on current mode)
 *   - 0 / Backspace / Delete → clear selected cell
 *   - P or Space → toggle pencil ↔ normal
 *   - Arrow keys → move the selected cell, defaulting to (0, 0) if none.
 * Returns true when the key was consumed so it doesn't propagate.
 */
private fun handleGameKey(
    key: Key,
    utf16CodePoint: Int,
    viewModel: SudokuGameViewModel,
    state: com.derekgillett.sudoku.state.GameState
): Boolean {
    if (state.isPaused || state.isSolved) return false

    // Digits 1–9 — accept either the dedicated number-row keys or the
    // numpad keys (some external keyboards report different Key values).
    val digit = when (key) {
        Key.One, Key.NumPad1 -> 1
        Key.Two, Key.NumPad2 -> 2
        Key.Three, Key.NumPad3 -> 3
        Key.Four, Key.NumPad4 -> 4
        Key.Five, Key.NumPad5 -> 5
        Key.Six, Key.NumPad6 -> 6
        Key.Seven, Key.NumPad7 -> 7
        Key.Eight, Key.NumPad8 -> 8
        Key.Nine, Key.NumPad9 -> 9
        else -> 0
    }
    if (digit in 1..9) {
        viewModel.enter(digit)
        return true
    }
    if (key == Key.Zero || key == Key.NumPad0 || key == Key.Backspace || key == Key.Delete) {
        viewModel.clearSelected()
        return true
    }
    val ch = utf16CodePoint.toChar()
    if (key == Key.Spacebar || ch == 'p' || ch == 'P') {
        viewModel.toggleMode()
        return true
    }
    val sel = state.selected
    val (row, col) = sel?.let { it.row to it.col } ?: (0 to 0)
    val (dRow, dCol) = when (key) {
        Key.DirectionUp -> -1 to 0
        Key.DirectionDown -> 1 to 0
        Key.DirectionLeft -> 0 to -1
        Key.DirectionRight -> 0 to 1
        else -> return false
    }
    viewModel.select((row + dRow).coerceIn(0, 8), (col + dCol).coerceIn(0, 8))
    return true
}
