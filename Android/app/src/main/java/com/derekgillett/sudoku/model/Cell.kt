package com.derekgillett.sudoku.model

import kotlinx.serialization.Serializable

@Serializable
data class Cell(
    val value: Int? = null,
    val isFixed: Boolean = false,
    val notes: Set<Int> = emptySet()
)
