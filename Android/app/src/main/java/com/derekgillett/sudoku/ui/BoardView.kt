package com.derekgillett.sudoku.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.state.GameState
import com.derekgillett.sudoku.state.Highlights
import com.derekgillett.sudoku.state.TutorHighlight

@Composable
fun BoardView(
    state: GameState,
    onSelect: (Int, Int) -> Unit,
    onResume: () -> Unit,
    modifier: Modifier = Modifier,
    /** When non-null, the tutor is active. The board renders tutor tints
     * and suppresses the normal selection / matching / highlight colors so
     * the step's narration stays visually unambiguous. */
    tutorHighlights: List<TutorHighlight>? = null
) {
    val tutorActive = tutorHighlights != null
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
                        val info = tutorHighlights?.let { tutorInfo(it, r, c) }
                        val sel = state.selected
                        val isSelected = !tutorActive && sel?.row == r && sel.col == c
                        val isHighlighted = !tutorActive && (
                            Highlights.isHighlighted(state, r, c) ||
                                Highlights.isUnavailableForSelectedValue(state, r, c)
                            )
                        val isMatching = !tutorActive && Highlights.isMatchingNumber(state, r, c)
                        val isError = !tutorActive && state.highlightMistakes &&
                            Highlights.hasConflict(state, r, c)
                        val isLocked = Highlights.isLocked(state, r, c)

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clickable(enabled = !tutorActive) { onSelect(r, c) }
                        ) {
                            CellView(
                                cell = cell,
                                isSelected = isSelected,
                                isHighlighted = isHighlighted,
                                isMatching = isMatching,
                                isError = isError,
                                isLocked = isLocked,
                                tutorHighlight = info?.kind,
                                tutorCandidateColors = info?.colors ?: emptyMap()
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

        if (state.isPaused) {
            PauseCover(onResume = onResume)
        }
    }
}

private data class TutorCellInfo(val kind: TutorHighlight.Kind, val colors: Map<Int, Color>)

/**
 * Resolves the tutor decoration for a single cell. Background tint comes
 * from the highest-priority highlight kind (target > eliminator > focus).
 * The candidate-digit color map lets one cell tint different digits
 * differently — needed for hidden pair, where pair digits stay (green) and
 * the others get crossed out (red) all in the same cell.
 */
private fun tutorInfo(highlights: List<TutorHighlight>, row: Int, col: Int): TutorCellInfo? {
    var bestKind: TutorHighlight.Kind? = null
    val digitKinds = HashMap<Int, TutorHighlight.Kind>()
    for (h in highlights) {
        if (h.row != row || h.col != col) continue
        bestKind = when (h.kind) {
            TutorHighlight.Kind.TARGET -> TutorHighlight.Kind.TARGET
            TutorHighlight.Kind.ELIMINATOR ->
                if (bestKind != TutorHighlight.Kind.TARGET) TutorHighlight.Kind.ELIMINATOR else bestKind
            TutorHighlight.Kind.FOCUS ->
                bestKind ?: TutorHighlight.Kind.FOCUS
        }
        for (d in h.candidates) {
            val existing = digitKinds[d]
            // Target wins over eliminator for the same digit.
            if (existing == null || (existing == TutorHighlight.Kind.ELIMINATOR && h.kind == TutorHighlight.Kind.TARGET)) {
                digitKinds[d] = h.kind
            }
        }
    }
    val kind = bestKind ?: return null
    val colors = digitKinds.mapNotNull { (d, k) ->
        when (k) {
            TutorHighlight.Kind.TARGET -> d to Color(0xFF2E7D32)
            TutorHighlight.Kind.ELIMINATOR -> d to Color(0xFFD32F2F)
            TutorHighlight.Kind.FOCUS -> null
        }
    }.toMap()
    return TutorCellInfo(kind, colors)
}

@Composable
private fun PauseCover(onResume: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
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
