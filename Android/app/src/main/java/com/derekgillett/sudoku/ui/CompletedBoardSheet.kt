package com.derekgillett.sudoku.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.SudokuApplication
import com.derekgillett.sudoku.audio.SoundManager
import com.derekgillett.sudoku.model.Puzzle
import com.derekgillett.sudoku.model.PuzzleResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompletedBoardSheet(
    result: PuzzleResult,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val puzzle = result.puzzle ?: run { onDismiss(); return }
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        val app = context.applicationContext as? SudokuApplication
        app?.container?.soundManager?.play(SoundManager.Effect.SOLVED)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Confetti(modifier = Modifier.matchParentSize())

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                FanfareHeader()
                Text(
                    puzzle.displayLabel,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CalendarMonth, contentDescription = null)
                        Text(
                            " " + formatDateTime(result.completedAt),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Schedule, contentDescription = null)
                        Text(
                            " " + formatTime(result.elapsedSeconds),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
                ReadOnlyBoard(puzzle)
            }
        }
    }
}

/**
 * Fanfare header — triple-icon flourish and gradient "Solved!" title.
 * Mirrors the live solve fanfare so revisiting a completed puzzle replays
 * the celebration. Confetti is drawn by the caller as a sibling overlay.
 */
@Composable
private fun FanfareHeader() {
    val iconScale = remember { Animatable(0.4f) }
    val titleScale = remember { Animatable(0.7f) }

    LaunchedEffect(Unit) {
        iconScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
    }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        titleScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessLow))
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        IconRow(scale = iconScale.value)
        Text(
            text = "Solved!",
            fontSize = 36.sp,
            fontWeight = FontWeight.ExtraBold,
            fontFamily = FontFamily.Default,
            style = TextStyle(
                brush = Brush.linearGradient(
                    colors = listOf(Color(0xFF2E7D32), Color(0xFF1565C0))
                )
            ),
            modifier = Modifier.scale(titleScale.value)
        )
    }
}

@Composable
private fun IconRow(scale: Float) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.scale(scale)
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,  // popper-style not in core icons
            contentDescription = null,
            tint = Color(0xFFFB8C00),
            modifier = Modifier
                .size(40.dp)
                .rotate(-20f)
        )
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF2E7D32),
            modifier = Modifier.size(64.dp)
        )
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF8E24AA),
            modifier = Modifier
                .size(40.dp)
                .rotate(20f)
        )
    }
}

@Composable
private fun ReadOnlyBoard(puzzle: Puzzle) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
    ) {
        Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            for (r in 0 until 9) {
                Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    for (c in 0 until 9) {
                        val isFixed = puzzle.givens[r][c] != 0
                        val v = if (isFixed) puzzle.givens[r][c]
                        else puzzle.solution?.get(r)?.get(c) ?: 0
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(),
                            contentAlignment = Alignment.Center
                        ) {
                            if (v != 0) {
                                Text(
                                    "$v",
                                    fontSize = 22.sp,
                                    fontWeight = if (isFixed) FontWeight.Bold else FontWeight.Normal
                                )
                            }
                        }
                    }
                }
            }
        }
        val lineColor = MaterialTheme.colorScheme.onSurface
        val secondaryColor = MaterialTheme.colorScheme.outline
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cell = size.width / 9f
            for (i in 0..9) {
                val isThick = i % 3 == 0
                val width = if (isThick) 2f else 0.5f
                val color = if (isThick) lineColor else secondaryColor
                drawLine(
                    color = color,
                    start = androidx.compose.ui.geometry.Offset(0f, i * cell),
                    end = androidx.compose.ui.geometry.Offset(size.width, i * cell),
                    strokeWidth = width
                )
                drawLine(
                    color = color,
                    start = androidx.compose.ui.geometry.Offset(i * cell, 0f),
                    end = androidx.compose.ui.geometry.Offset(i * cell, size.height),
                    strokeWidth = width
                )
            }
        }
    }
}
