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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.AutoFixOff
import androidx.compose.material.icons.outlined.LightbulbCircle
import androidx.compose.material.icons.outlined.RemoveRedEye
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Small reference sheet explaining what each leaderboard badge means.
 * Reachable from the leaderboard's "ⓘ" button. Badges celebrate the
 * *absence* of an assist — solo solves earn the gold; assisted solves just
 * don't have the badge (no penalty markers). Mirrors BadgeLegendView on iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BadgeLegendSheet(onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Leaderboard Badges",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )

            Text("Badges", style = MaterialTheme.typography.titleSmall)
            LegendRow(
                icon = Icons.Outlined.LightbulbCircle,
                color = Color(0xFF2E7D32),
                title = "Solo",
                description = "Solved without asking the tutor for hints."
            )
            LegendRow(
                icon = Icons.Outlined.AutoFixOff,
                color = Color(0xFF8E24AA),
                title = "Manual",
                description = "Solved without using the auto-pencil button. You did all your candidate-marking by hand."
            )
            LegendRow(
                icon = Icons.Filled.CheckCircle,
                color = Color(0xFF26A69A),
                title = "Flawless",
                description = "Zero incorrect placements during the solve."
            )

            HorizontalDivider()

            Text(
                "Three badges, earned independently. Get all three on the same solve and that's a flex worth bragging about.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "Mistakes also add a small time penalty (about 10% per mistake, capped at five) when ranking the leaderboard — you'll never see the count, just the resulting position.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LegendRow(
    icon: ImageVector,
    color: Color,
    title: String,
    description: String
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(28.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
