package com.derekgillett.sudoku.ui

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun formatTime(seconds: Int): String {
    return "%02d:%02d".format(seconds / 60, seconds % 60)
}

private val dateTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d, h:mm a")

internal fun formatDateTime(epochMillis: Long): String {
    val dt = LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneId.systemDefault())
    return dt.format(dateTimeFormatter)
}

private val dateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEE, MMM d")

internal fun formatDate(epochMillis: Long): String {
    val dt = LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneId.systemDefault())
    return dt.format(dateFormatter)
}
