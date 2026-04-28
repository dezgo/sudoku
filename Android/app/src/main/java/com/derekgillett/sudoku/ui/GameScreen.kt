package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Home
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.state.SudokuGameViewModel

@Composable
fun GameScreen(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository
) {
    val state by viewModel.state.collectAsState()
    val s = state ?: return
    var showingSettings by remember { mutableStateOf(false) }
    var confirmingReset by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header row.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Sudoku #${s.puzzleID} · ${s.difficulty.label}",
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
            Spacer(modifier = Modifier.weight(1f))
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
            IconButton(onClick = { viewModel.togglePause() }) {
                Icon(
                    imageVector = if (s.isPaused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                    contentDescription = if (s.isPaused) "Resume" else "Pause"
                )
            }
            IconButton(onClick = { showingSettings = true }) {
                Icon(Icons.Filled.Settings, contentDescription = "Settings")
            }
        }

        BoardView(
            state = s,
            onSelect = { r, c -> viewModel.select(r, c) },
            onResume = { viewModel.togglePause() },
            modifier = Modifier.padding(horizontal = 8.dp)
        )

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
    }

    if (showingSettings) {
        SettingsSheet(
            viewModel = viewModel,
            prefsRepo = prefsRepo,
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
}
