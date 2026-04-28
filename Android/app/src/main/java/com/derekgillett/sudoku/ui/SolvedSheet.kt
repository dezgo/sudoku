package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.model.PuzzleResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SolvedSheet(
    result: PuzzleResult,
    onDone: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val difficultyLabel = result.puzzle?.difficulty?.label ?: ""

    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = Color(0xFF2E7D32),
                modifier = Modifier.size(96.dp)
            )
            Text(
                "Solved!",
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                val title = if (difficultyLabel.isNotEmpty())
                    "Puzzle #${result.puzzleID} · $difficultyLabel"
                else "Puzzle #${result.puzzleID}"
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.size(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Filled.Schedule, contentDescription = null)
                        Text(formatTime(result.elapsedSeconds))
                    }
                }
            }
            Button(
                onClick = onDone,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
            ) { Text("Done") }
        }
    }
}
