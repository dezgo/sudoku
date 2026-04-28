package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.state.GameState
import com.derekgillett.sudoku.state.Highlights
import com.derekgillett.sudoku.state.InputMode
import com.derekgillett.sudoku.state.SudokuGameViewModel

@Composable
fun NumberPadView(
    viewModel: SudokuGameViewModel,
    state: GameState,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (n in 1..9) {
                val complete = Highlights.isComplete(state, n)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (complete) MaterialTheme.colorScheme.surface
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                        .clickable(enabled = !complete) { viewModel.enter(n) },
                    contentAlignment = Alignment.Center
                ) {
                    if (!complete) {
                        Text(
                            text = "$n",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // Pencil toggle.
            val pencilOn = state.mode == InputMode.PENCIL
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        if (pencilOn) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .clickable { viewModel.toggleMode() },
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = if (pencilOn) Icons.Filled.Edit else Icons.Outlined.Edit,
                        contentDescription = null,
                        tint = if (pencilOn) MaterialTheme.colorScheme.onPrimary
                        else MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (pencilOn) "Pencil On" else "Pencil Off",
                        fontWeight = FontWeight.SemiBold,
                        color = if (pencilOn) MaterialTheme.colorScheme.onPrimary
                        else MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            // Erase / Undo button.
            val canErase = viewModel.canEraseSelected(state)
            val label = viewModel.eraseLabel(state)
            val isUndo = label == "Undo"
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable(enabled = canErase) { viewModel.clearSelected() }
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = if (isUndo) Icons.AutoMirrored.Filled.Undo
                        else Icons.Filled.Edit,  // a reasonable placeholder; SF "delete.left" has no exact MD twin
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface
                            .copy(alpha = if (canErase) 1f else 0.4f)
                    )
                    Text(
                        text = label,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                            .copy(alpha = if (canErase) 1f else 0.4f)
                    )
                }
            }
        }
    }
}
