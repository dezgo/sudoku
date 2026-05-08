package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.state.TutorHint

/**
 * Bottom sheet that walks the user through a single tutor hint. The host
 * (GameScreen) reads the current step's highlights and passes them into
 * BoardView so the tints render on the board underneath.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TutorSheet(
    hint: TutorHint?,
    stepIndex: Int,
    hasAnyPencilMarks: Boolean,
    onStepIndexChange: (Int) -> Unit,
    onApply: (TutorHint) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (hint != null) {
                Header(hint, stepIndex)
                Text(
                    text = hint.steps[stepIndex].narration,
                    style = MaterialTheme.typography.bodyLarge
                )
                Legend()
                Controls(
                    hint = hint,
                    stepIndex = stepIndex,
                    onStepIndexChange = onStepIndexChange,
                    onApply = onApply
                )
            } else {
                EmptyState(hasAnyPencilMarks = hasAnyPencilMarks)
            }
        }
    }
}

@Composable
private fun Header(hint: TutorHint, stepIndex: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = Color(0xFFFBC02D))
        Text(hint.technique.label, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(
            "Step ${stepIndex + 1} of ${hint.steps.size}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun Legend() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        LegendChip(color = Color(0xFF1976D2).copy(alpha = 0.18f), label = "Looking here")
        LegendChip(color = Color(0xFFFB8C00).copy(alpha = 0.30f), label = "Rules it out")
        LegendChip(color = Color(0xFF43A047).copy(alpha = 0.45f), label = "Goes here")
    }
}

@Composable
private fun LegendChip(color: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .background(color, RoundedCornerShape(3.dp))
        )
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Controls(
    hint: TutorHint,
    stepIndex: Int,
    onStepIndexChange: (Int) -> Unit,
    onApply: (TutorHint) -> Unit
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(
            onClick = { if (stepIndex > 0) onStepIndexChange(stepIndex - 1) },
            enabled = stepIndex > 0,
            modifier = Modifier.weight(1f)
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
            Spacer(Modifier.size(6.dp))
            Text("Back")
        }
        if (stepIndex == hint.steps.size - 1) {
            val isPlacement = hint.placement != null
            Button(
                onClick = { onApply(hint) },
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    imageVector = if (isPlacement) Icons.Filled.Check else Icons.Filled.ThumbUp,
                    contentDescription = null
                )
                Spacer(Modifier.size(6.dp))
                Text(if (isPlacement) "Apply" else "Got it")
            }
        } else {
            Button(
                onClick = { onStepIndexChange(stepIndex + 1) },
                modifier = Modifier.weight(1f)
            ) {
                Text("Next")
                Spacer(Modifier.size(6.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
            }
        }
    }
}

@Composable
private fun EmptyState(hasAnyPencilMarks: Boolean) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            Icons.Filled.HelpOutline,
            contentDescription = null,
            modifier = Modifier.size(44.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            if (hasAnyPencilMarks) "Stuck on this one" else "No simple move spotted",
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = if (hasAnyPencilMarks) {
                "I checked everything I know — singles, pairs/triples/quads (naked + hidden), pointing pair, box-line, X-wing, XY-wing, swordfish, jellyfish. Nothing fits. This board likely needs chain reasoning (XYZ-wing, W-wing, simple coloring, forcing chains) or some plain old guess-and-check."
            } else {
                "Tap the wand to auto-fill pencil marks first — the pair and pointing techniques need them to work."
            },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
