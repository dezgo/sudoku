package com.derekgillett.sudoku.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.state.GameState
import com.derekgillett.sudoku.state.Highlights

@Composable
fun BoardView(
    state: GameState,
    onSelect: (Int, Int) -> Unit,
    onResume: () -> Unit,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
    ) {
        val boardModifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)

        Column(modifier = boardModifier) {
            for (r in 0 until 9) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                ) {
                    for (c in 0 until 9) {
                        val cell = state.cells[r][c]
                        val sel = state.selected
                        val isSelected = sel?.row == r && sel.col == c
                        val isHighlighted = Highlights.isHighlighted(state, r, c) ||
                            Highlights.isUnavailableForSelectedValue(state, r, c)
                        val isMatching = Highlights.isMatchingNumber(state, r, c)
                        val isError = state.highlightMistakes &&
                            Highlights.hasConflict(state, r, c)
                        val isLocked = Highlights.isLocked(state, r, c)

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clickable { onSelect(r, c) }
                        ) {
                            CellView(
                                cell = cell,
                                isSelected = isSelected,
                                isHighlighted = isHighlighted,
                                isMatching = isMatching,
                                isError = isError,
                                isLocked = isLocked
                            )
                        }
                    }
                }
            }
        }

        // Grid lines overlay
        val lineColor = MaterialTheme.colorScheme.onSurface
        val secondaryColor = MaterialTheme.colorScheme.outline
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cell = size.width / 9f
            for (i in 0..9) {
                val isThick = i % 3 == 0
                val width = if (isThick) 2f else 0.5f
                val color = if (isThick) lineColor else secondaryColor
                // horizontal
                drawLine(
                    color = color,
                    start = androidx.compose.ui.geometry.Offset(0f, i * cell),
                    end = androidx.compose.ui.geometry.Offset(size.width, i * cell),
                    strokeWidth = width
                )
                // vertical
                drawLine(
                    color = color,
                    start = androidx.compose.ui.geometry.Offset(i * cell, 0f),
                    end = androidx.compose.ui.geometry.Offset(i * cell, size.height),
                    strokeWidth = width
                )
            }
        }

        if (state.isPaused) {
            PauseCover(onResume = onResume)
        }
    }
}

@Composable
private fun PauseCover(onResume: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            // Absorb taps so the cells underneath aren't accidentally selected.
            .clickable(enabled = true, onClick = {}),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "Paused",
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(onClick = onResume) {
                Text("Resume")
            }
        }
    }
}
