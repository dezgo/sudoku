package com.derekgillett.sudoku.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

/**
 * Theme entry point. The user's appearance preference (System / Light / Dark)
 * is resolved upstream by the caller; this composable just paints whatever
 * `darkTheme` it's given. Defaults to following the system setting.
 */
@Composable
fun SudokuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content
    )
}
