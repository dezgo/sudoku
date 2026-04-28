package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.model.PuzzleResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persists completed-puzzle records as a JSON array under a single key.
 */
class PuzzleHistoryRepository(private val dataStore: DataStore<Preferences>) {

    private val key = stringPreferencesKey("history_v1")
    private val json = Json { ignoreUnknownKeys = true }

    val results: Flow<List<PuzzleResult>> = dataStore.data.map { prefs ->
        val raw = prefs[key] ?: return@map emptyList()
        runCatching { json.decodeFromString<List<PuzzleResult>>(raw) }
            .getOrDefault(emptyList())
    }

    suspend fun record(result: PuzzleResult) {
        dataStore.edit { prefs ->
            val current = prefs[key]
                ?.let { runCatching { json.decodeFromString<List<PuzzleResult>>(it) }.getOrNull() }
                ?: emptyList()
            val updated = listOf(result) + current
            prefs[key] = json.encodeToString(updated)
        }
    }

    suspend fun clear() {
        dataStore.edit { prefs ->
            prefs[key] = "[]"
        }
    }
}
