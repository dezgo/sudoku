package com.derekgillett.sudoku.ui

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
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Puzzle #${result.puzzleID} · ${puzzle.difficulty.label}",
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
