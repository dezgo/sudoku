package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.model.Difficulty
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewGameSheet(
    prefsRepo: PreferencesRepository,
    onStart: (Difficulty) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    val scope = rememberCoroutineScope()

    var selected by remember(prefs?.difficulty) {
        mutableStateOf(prefs?.difficulty ?: Difficulty.MEDIUM)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            Text(
                "New Game",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                Difficulty.entries.forEachIndexed { idx, value ->
                    SegmentedButton(
                        selected = selected == value,
                        onClick = { selected = value },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = idx,
                            count = Difficulty.entries.size
                        )
                    ) { Text(value.label) }
                }
            }

            Spacer(Modifier.size(24.dp))

            Button(
                onClick = {
                    scope.launch { prefsRepo.setDifficulty(selected) }
                    onStart(selected)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Start")
            }

            Spacer(Modifier.size(16.dp))
        }
    }
}
