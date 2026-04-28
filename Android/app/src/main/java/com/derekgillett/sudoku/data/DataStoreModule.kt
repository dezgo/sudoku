package com.derekgillett.sudoku.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

/**
 * Single app-wide Preferences DataStore. Holds JSON-encoded blobs for
 * history and saves, plus simple typed preferences for settings.
 */
val Context.sudokuDataStore: DataStore<Preferences> by preferencesDataStore(name = "sudoku")
