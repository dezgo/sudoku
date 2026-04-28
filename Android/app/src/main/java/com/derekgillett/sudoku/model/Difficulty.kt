package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable

@Serializable
enum class Difficulty {
    EASY, MEDIUM, HARD;

    val label: String
        get() = when (this) {
            EASY -> "Easy"
            MEDIUM -> "Medium"
            HARD -> "Hard"
        }
}
