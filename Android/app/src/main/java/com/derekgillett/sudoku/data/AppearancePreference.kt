package com.derekgillett.sudoku.data

enum class AppearancePreference {
    SYSTEM, LIGHT, DARK;

    val label: String get() = when (this) {
        SYSTEM -> "System"
        LIGHT -> "Light"
        DARK -> "Dark"
    }
}
