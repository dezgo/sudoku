package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.model.Cell

private val SelectedTint: Color = Color(0xFFFFD54F).copy(alpha = 0.55f)
private val MatchingTint: Color = Color(0xFF3F8AE0).copy(alpha = 0.45f)
private val HighlightTint: Color = Color(0xFF3F8AE0).copy(alpha = 0.30f)

@Composable
fun CellView(
    cell: Cell,
    isSelected: Boolean,
    isHighlighted: Boolean,
    isMatching: Boolean,
    isError: Boolean,
    isLocked: Boolean,
    modifier: Modifier = Modifier
) {
    val background = when {
        isSelected -> SelectedTint
        isMatching -> MatchingTint
        isHighlighted -> HighlightTint
        else -> Color.Transparent
    }
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(background),
        contentAlignment = Alignment.Center
    ) {
        if (cell.value != null) {
            Text(
                text = "${cell.value}",
                fontSize = 22.sp,
                fontWeight = if (isLocked) FontWeight.Bold else FontWeight.Normal,
                color = if (isError) Color(0xFFD32F2F) else MaterialTheme.colorScheme.onSurface
            )
        } else if (cell.notes.isNotEmpty()) {
            NotesGrid(cell.notes)
        }
    }
}

@Composable
private fun NotesGrid(notes: Set<Int>) {
    Column(
        modifier = Modifier.padding(2.dp),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        for (r in 0 until 3) {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                for (c in 0 until 3) {
                    val n = r * 3 + c + 1
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        if (notes.contains(n)) {
                            Text(
                                text = "$n",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontFamily = FontFamily.Default
                            )
                        }
                    }
                }
            }
        }
    }
}
