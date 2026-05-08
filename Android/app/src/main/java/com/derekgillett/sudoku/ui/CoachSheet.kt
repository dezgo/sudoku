package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import com.derekgillett.sudoku.data.CoachRepository
import com.derekgillett.sudoku.state.CoachGame
import com.derekgillett.sudoku.state.CoachScenario
import com.derekgillett.sudoku.state.InputMode
import com.derekgillett.sudoku.state.TutorTechnique
import kotlinx.coroutines.launch

/**
 * Coach Mode entry sheet — grid of technique cards. Tapping a card opens
 * the scenario sheet. Mirrors CoachListView.swift on iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachSheet(
    coachRepo: CoachRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val completed by coachRepo.completed.collectAsState(initial = emptySet())
    var playingScenario: CoachScenario? by remember { mutableStateOf(null) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            Text(
                "Coach",
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            Text(
                "Pick a technique to practise. Each scenario sets up a board where the named pattern is the next useful move — spot it and apply it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(CoachScenario.validScenarios) { scenario ->
                    CoachCard(
                        scenario = scenario,
                        isComplete = completed.contains(scenario.id),
                        onClick = { playingScenario = scenario }
                    )
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }

    playingScenario?.let { scenario ->
        CoachScenarioSheet(
            scenario = scenario,
            onComplete = { playingScenario = null },
            onDismiss = { playingScenario = null },
            coachRepo = coachRepo
        )
    }
}

@Composable
private fun CoachCard(
    scenario: CoachScenario,
    isComplete: Boolean,
    onClick: () -> Unit
) {
    val tierColor = when (scenario.technique.tier) {
        TutorTechnique.Tier.SIMPLE -> Color(0xFF43A047)
        TutorTechnique.Tier.MEDIUM -> Color(0xFFFB8C00)
        TutorTechnique.Tier.HARD -> Color(0xFFD32F2F)
    }
    val tierLabel = when (scenario.technique.tier) {
        TutorTechnique.Tier.SIMPLE -> "Simple"
        TutorTechnique.Tier.MEDIUM -> "Medium"
        TutorTechnique.Tier.HARD -> "Hard"
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                shape = RoundedCornerShape(12.dp)
            )
            .border(1.dp, tierColor.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    scenario.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                if (isComplete) {
                    Icon(
                        Icons.Filled.EmojiEvents,
                        contentDescription = "Completed",
                        tint = Color(0xFFFFC107)
                    )
                }
            }
            Text(
                tierLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Play view for a single Coach scenario. Re-uses CellView for cell rendering.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachScenarioSheet(
    scenario: CoachScenario,
    onComplete: () -> Unit,
    onDismiss: () -> Unit,
    coachRepo: CoachRepository
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val game = remember(scenario.id) { CoachGame(scenario) }
    val state by game.state.collectAsState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.isComplete) {
        if (state.isComplete) {
            coachRepo.markComplete(scenario)
        }
    }

    if (!game.isLoadable) {
        // Defensive: if the scenario fails to validate at load time, just
        // close. The UI normally only shows valid scenarios via
        // CoachScenario.validScenarios, so this branch is unreachable.
        LaunchedEffect(Unit) { onDismiss() }
        return
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text(
                scenario.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        color = Color(0xFFFFF59D).copy(alpha = 0.4f),
                        shape = RoundedCornerShape(8.dp)
                    )
                    .padding(10.dp)
            ) {
                Text(scenario.intro, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.size(12.dp))
            CoachBoard(state = state, onSelect = { r, c -> game.select(r, c) })
            Spacer(Modifier.size(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = { game.toggleMode() },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (state.mode == InputMode.PENCIL) "Pencil" else "Normal")
                }
                OutlinedButton(
                    onClick = { game.reset() },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Reset")
                }
            }
            Spacer(Modifier.size(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                for (n in 1..9) {
                    OutlinedButton(
                        onClick = { game.enter(n) },
                        modifier = Modifier.weight(1f)
                    ) { Text("$n") }
                }
                OutlinedButton(
                    onClick = { game.clearSelected() },
                    modifier = Modifier.weight(1.2f)
                ) { Text("⌫") }
            }
            if (state.isComplete) {
                Spacer(Modifier.size(16.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.EmojiEvents,
                            contentDescription = null,
                            tint = Color(0xFFFFC107),
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(
                            "Nice — ${scenario.title} cleared.",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.size(12.dp))
                        Button(onClick = onComplete) { Text("Back to Coach") }
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun CoachBoard(
    state: CoachGame.State,
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
                    val cell = state.cells[r][c]
                    val sel = state.selected
                    val isSelected = sel?.row == r && sel.col == c
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
                            isLocked = cell.isFixed,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            }
        }
    }
}
