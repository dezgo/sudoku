package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import com.derekgillett.sudoku.state.CoachScenario
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Local persistence for Coach Mode completion. One bool per scenario ID
 * stored as a DataStore string set. Mirrors CoachStore.swift.
 */
class CoachRepository(private val dataStore: DataStore<Preferences>) {

    private val key = stringSetPreferencesKey("sudoku.coach.completed.v1")

    val completed: Flow<Set<String>> = dataStore.data.map { prefs ->
        prefs[key] ?: emptySet()
    }

    suspend fun markComplete(scenario: CoachScenario) {
        dataStore.edit { prefs ->
            val current = prefs[key] ?: emptySet()
            if (!current.contains(scenario.id)) {
                prefs[key] = current + scenario.id
            }
        }
    }
}
