package com.derekgillett.sudoku.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.AccountCircle
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.model.Puzzle
import com.derekgillett.sudoku.model.PuzzleResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SolvedSheet(
    result: PuzzleResult,
    rank: Int? = null,
    showLeaderboardButton: Boolean = false,
    showSignInPrompt: Boolean = false,
    onLeaderboard: () -> Unit = {},
    onSignIn: () -> Unit = {},
    onDone: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val puzzle: Puzzle? = result.puzzle
    val titleLabel = puzzle?.displayLabel ?: "Puzzle #${result.puzzleID}"

    val iconScale = remember { Animatable(0.4f) }
    val titleScale = remember { Animatable(0.7f) }
    val statsAlpha = remember { Animatable(0f) }
    val buttonAlpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        iconScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
    }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        titleScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessLow))
    }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(250)
        statsAlpha.animateTo(1f, tween(300))
    }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(350)
        buttonAlpha.animateTo(1f, tween(300))
    }

    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheetState
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // Confetti overlay sized to the content.
            Confetti(modifier = Modifier.matchParentSize())

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                IconRow(scale = iconScale.value)

                Text(
                    text = "Solved!",
                    fontSize = 44.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.Default,
                    style = TextStyle(
                        brush = Brush.linearGradient(
                            colors = listOf(Color(0xFF2E7D32), Color(0xFF1565C0))
                        )
                    ),
                    modifier = Modifier.scale(titleScale.value)
                )

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.scale(if (statsAlpha.value > 0.01f) 1f else 0.95f)
                ) {
                    Text(
                        text = titleLabel,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.scale(if (statsAlpha.value > 0.01f) 1f else 0.95f)
                    )
                    Spacer(Modifier.size(6.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Schedule, contentDescription = null)
                            Text(
                                text = " " + formatTime(result.elapsedSeconds),
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }

                if (rank != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = Color(0xFFFFC107)
                        )
                        Text(
                            "Rank #$rank",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                if (showLeaderboardButton) {
                    Button(
                        onClick = onLeaderboard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .scale(if (buttonAlpha.value > 0.01f) 1f else 0.9f)
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.List, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text("View leaderboard")
                    }
                } else if (showSignInPrompt) {
                    Button(
                        onClick = onSignIn,
                        modifier = Modifier
                            .fillMaxWidth()
                            .scale(if (buttonAlpha.value > 0.01f) 1f else 0.9f)
                    ) {
                        Icon(Icons.Outlined.AccountCircle, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text("Sign in to put this on the board")
                    }
                }

                if (showLeaderboardButton || showSignInPrompt) {
                    OutlinedButton(
                        onClick = onDone,
                        modifier = Modifier
                            .fillMaxWidth()
                            .scale(if (buttonAlpha.value > 0.01f) 1f else 0.9f)
                    ) { Text("Done") }
                } else {
                    Button(
                        onClick = onDone,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .scale(if (buttonAlpha.value > 0.01f) 1f else 0.9f)
                    ) { Text("Done") }
                }
            }
        }
    }
}

@Composable
private fun IconRow(scale: Float) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.scale(scale)
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,  // popper-style not in core icons
            contentDescription = null,
            tint = Color(0xFFFB8C00),
            modifier = Modifier
                .size(48.dp)
                .rotate(-20f)
        )
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF2E7D32),
            modifier = Modifier.size(80.dp)
        )
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF8E24AA),
            modifier = Modifier
                .size(48.dp)
                .rotate(20f)
        )
    }
}
