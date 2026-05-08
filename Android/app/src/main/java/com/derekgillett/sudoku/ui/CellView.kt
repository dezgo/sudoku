package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.model.Cell
import com.derekgillett.sudoku.state.TutorHighlight

private val SelectedTint: Color = Color(0xFFFFD54F).copy(alpha = 0.55f)
private val MatchingTint: Color = Color(0xFF3F8AE0).copy(alpha = 0.45f)
private val HighlightTint: Color = Color(0xFF3F8AE0).copy(alpha = 0.30f)

private val TutorFocusTint: Color = Color(0xFF1976D2).copy(alpha = 0.18f)
private val TutorEliminatorTint: Color = Color(0xFFFB8C00).copy(alpha = 0.30f)
private val TutorTargetTint: Color = Color(0xFF43A047).copy(alpha = 0.45f)

@Composable
fun CellView(
    cell: Cell,
    isSelected: Boolean,
    isHighlighted: Boolean,
    isMatching: Boolean,
    isError: Boolean,
    isLocked: Boolean,
    tutorHighlight: TutorHighlight.Kind? = null,
    tutorCandidateColors: Map<Int, Color> = emptyMap(),
    modifier: Modifier = Modifier
) {
    val background = when (tutorHighlight) {
        TutorHighlight.Kind.TARGET -> TutorTargetTint
        TutorHighlight.Kind.ELIMINATOR -> TutorEliminatorTint
        TutorHighlight.Kind.FOCUS -> TutorFocusTint
        null -> when {
            isSelected -> SelectedTint
            isMatching -> MatchingTint
            isHighlighted -> HighlightTint
            else -> Color.Transparent
        }
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
            // Always render the user's own pencil marks. The tutor calls
            // out specific digits by tinting them — never synthesises marks
            // the user didn't write.
            NotesGrid(notes = cell.notes, tutorCandidateColors = tutorCandidateColors)
        }
    }
}

@Composable
private fun NotesGrid(notes: Set<Int>, tutorCandidateColors: Map<Int, Color>) {
    val defaultColor = MaterialTheme.colorScheme.onSurfaceVariant
    // Tight line-height + disabled font padding + use the full cell area
    // (no outer padding) keeps notes from clipping at the bottom of each
    // cell-third on small Android cells. iOS gets enough breathing room
    // from SwiftUI's default text metrics.
    val tightStyle = LocalTextStyle.current.copy(
        platformStyle = PlatformTextStyle(includeFontPadding = false)
    )
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        for (r in 0 until 3) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                for (c in 0 until 3) {
                    val n = r * 3 + c + 1
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        contentAlignment = Alignment.Center
                    ) {
                        if (notes.contains(n)) {
                            val tint = tutorCandidateColors[n] ?: defaultColor
                            Text(
                                text = "$n",
                                fontSize = 12.sp,
                                lineHeight = 12.sp,
                                color = tint,
                                fontFamily = FontFamily.Default,
                                style = tightStyle
                            )
                        }
                    }
                }
            }
        }
    }
}
