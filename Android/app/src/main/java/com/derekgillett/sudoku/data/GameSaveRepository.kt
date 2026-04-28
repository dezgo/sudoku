package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.model.GameSave
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persists in-progress game saves as a JSON map keyed by puzzle ID.
 * Only one save per puzzle.
 */
class GameSaveRepository(private val dataStore: DataStore<Preferences>) {

    private val key = stringPreferencesKey("saves_v1")
    private val json = Json { ignoreUnknownKeys = true }

    val saves: Flow<Map<Int, GameSave>> = dataStore.data.map { prefs ->
        val raw = prefs[key] ?: return@map emptyMap()
        // JSON object keys are strings — decode then re-key by Int.
        runCatching {
            json.decodeFromString<Map<String, GameSave>>(raw)
                .mapKeys { it.key.toInt() }
        }.getOrDefault(emptyMap())
    }

    /** All saves, most-recently-played first. */
    val inProgress: Flow<List<GameSave>> = saves.map { map ->
        map.values.sortedByDescending { it.lastPlayedAt }
    }

    val mostRecent: Flow<GameSave?> = inProgress.map { it.firstOrNull() }

    suspend fun save(value: GameSave) {
        dataStore.edit { prefs ->
            val current = currentMap(prefs)
            val updated = current.toMutableMap().also { it[value.puzzle.id] = value }
            prefs[key] = json.encodeToString(updated.mapKeys { it.key.toString() })
        }
    }

    suspend fun remove(puzzleID: Int) {
        dataStore.edit { prefs ->
            val current = currentMap(prefs).toMutableMap()
            current.remove(puzzleID)
            prefs[key] = json.encodeToString(current.mapKeys { it.key.toString() })
        }
    }

    suspend fun load(puzzleID: Int): GameSave? {
        var found: GameSave? = null
        dataStore.edit { prefs ->
            found = currentMap(prefs)[puzzleID]
        }
        return found
    }

    private fun currentMap(prefs: Preferences): Map<Int, GameSave> {
        val raw = prefs[key] ?: return emptyMap()
        return runCatching {
            json.decodeFromString<Map<String, GameSave>>(raw)
                .mapKeys { it.key.toInt() }
        }.getOrDefault(emptyMap())
    }
}
