package com.derekgillett.sudoku.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AutoFixOff
import androidx.compose.material.icons.outlined.LightbulbCircle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.derekgillett.sudoku.network.LeaderboardEntry
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Bottom sheet shown when a leaderboard row is tapped. Spells out badges so
 * users don't have to flip back to the legend, and shows raw vs effective
 * time so the mistake penalty is visible without leaking the raw count.
 * For your OWN row we additionally show the exact mistake count + penalty;
 * for others, only raw + effective. Mirrors LeaderboardEntryDetailView.swift.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaderboardEntryDetailSheet(
    entry: LeaderboardEntry,
    isMe: Boolean,
    myMistakeCount: Int?,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val dateFmt = remember { SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault()) }
    val effective = entry.effectiveSecondsOrFallback

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            // Header: rank + name
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "#${entry.rank}",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.size(12.dp))
                Column {
                    Text(
                        entry.displayName ?: "—",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (isMe) {
                        Text(
                            "You",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            Spacer(Modifier.size(16.dp))
            HorizontalDivider()
            Spacer(Modifier.size(12.dp))

            // Time breakdown
            Text("Time", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.size(4.dp))
            kvRow("Raw time", formatTime(entry.elapsedSeconds))
            if (effective > entry.elapsedSeconds) {
                val mistakes = myMistakeCount
                if (isMe && mistakes != null && mistakes > 0) {
                    val cappedPercent = (if (mistakes < 5) mistakes else 5) * 10
                    kvRow("Mistakes", mistakes.toString())
                    kvRow(
                        "Penalty",
                        "+$cappedPercent%",
                        valueColor = Color(0xFFE65100)
                    )
                }
                kvRow("Effective time", formatTime(effective), bold = true)
                if (!isMe) {
                    Spacer(Modifier.size(4.dp))
                    Text(
                        "Effective time includes a small penalty for any mistakes during the solve. Used for ranking; raw count of mistakes isn't shown here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("No mistake penalty", modifier = Modifier.weight(1f))
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF2E7D32),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(Modifier.size(16.dp))
            HorizontalDivider()
            Spacer(Modifier.size(12.dp))

            // Badges
            Text("Badges earned", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.size(4.dp))
            var hasAny = false
            if (entry.hintsUsed == 0) {
                hasAny = true
                badgeRow(
                    Icons.Outlined.LightbulbCircle, Color(0xFF2E7D32),
                    "Solo", "Solved without using the tutor."
                )
            }
            if (entry.pencilAssistsUsed == 0) {
                hasAny = true
                badgeRow(
                    Icons.Outlined.AutoFixOff, Color(0xFF8E24AA),
                    "Manual", "Solved without auto-pencil."
                )
            }
            if (entry.flawless) {
                hasAny = true
                badgeRow(
                    Icons.Filled.CheckCircle, Color(0xFF26A69A),
                    "Flawless", "Zero incorrect placements."
                )
            }
            if (!hasAny) {
                Text(
                    "No badges earned on this solve.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(Modifier.size(16.dp))
            HorizontalDivider()
            Spacer(Modifier.size(12.dp))

            Text("Solved at", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.size(4.dp))
            Text(
                dateFmt.format(Date(entry.completedAt)),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun kvRow(
    label: String,
    value: String,
    bold: Boolean = false,
    valueColor: Color = Color.Unspecified
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Text(
            value,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
            color = if (valueColor == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant
            else valueColor
        )
    }
}

@Composable
private fun badgeRow(icon: ImageVector, tint: Color, title: String, subtitle: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
        Column {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

