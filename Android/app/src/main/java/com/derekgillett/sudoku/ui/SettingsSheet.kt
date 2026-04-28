package com.derekgillett.sudoku.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.data.AppearancePreference
import com.derekgillett.sudoku.data.PreferencesRepository
import com.derekgillett.sudoku.state.SudokuGameViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    viewModel: SudokuGameViewModel,
    prefsRepo: PreferencesRepository,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val state by viewModel.state.collectAsState()
    val prefs by prefsRepo.preferences.collectAsState(initial = null)
    val scope = rememberCoroutineScope()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            Text(
                "Settings",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Highlighting section
            Text(
                "Highlighting",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            ToggleRow(
                label = "Highlight mistakes",
                value = state?.highlightMistakes ?: true,
                onChange = { viewModel.setHighlightMistakes(it) }
            )
            ToggleRow(
                label = "Highlight rules",
                value = state?.highlightConstraints ?: true,
                onChange = { viewModel.setHighlightConstraints(it) }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Appearance section
            Text(
                "Appearance",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            val current = prefs?.appearance ?: AppearancePreference.SYSTEM
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                AppearancePreference.entries.forEachIndexed { idx, value ->
                    SegmentedButton(
                        selected = current == value,
                        onClick = {
                            scope.launch { prefsRepo.setAppearance(value) }
                        },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = idx,
                            count = AppearancePreference.entries.size
                        )
                    ) { Text(value.label) }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun ToggleRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = value, onCheckedChange = onChange)
    }
}
