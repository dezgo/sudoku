package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.model.Difficulty
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class UserPreferences(
    val highlightMistakes: Boolean = true,
    val highlightConstraints: Boolean = true,
    val soundEffects: Boolean = true,
    val difficulty: Difficulty = Difficulty.MEDIUM,
    val appearance: AppearancePreference = AppearancePreference.SYSTEM
)

class PreferencesRepository(private val dataStore: DataStore<Preferences>) {

    private object Keys {
        val HIGHLIGHT_MISTAKES = booleanPreferencesKey("highlight_mistakes")
        val HIGHLIGHT_CONSTRAINTS = booleanPreferencesKey("highlight_constraints")
        val SOUND_EFFECTS = booleanPreferencesKey("sound_effects")
        val DIFFICULTY = stringPreferencesKey("difficulty")
        val APPEARANCE = stringPreferencesKey("appearance")
    }

    val preferences: Flow<UserPreferences> = dataStore.data.map { prefs ->
        UserPreferences(
            highlightMistakes = prefs[Keys.HIGHLIGHT_MISTAKES] ?: true,
            highlightConstraints = prefs[Keys.HIGHLIGHT_CONSTRAINTS] ?: true,
            soundEffects = prefs[Keys.SOUND_EFFECTS] ?: true,
            difficulty = prefs[Keys.DIFFICULTY]
                ?.let { runCatching { Difficulty.valueOf(it) }.getOrNull() }
                ?: Difficulty.MEDIUM,
            appearance = prefs[Keys.APPEARANCE]
                ?.let { runCatching { AppearancePreference.valueOf(it) }.getOrNull() }
                ?: AppearancePreference.SYSTEM
        )
    }

    suspend fun setHighlightMistakes(value: Boolean) {
        dataStore.edit { it[Keys.HIGHLIGHT_MISTAKES] = value }
    }

    suspend fun setHighlightConstraints(value: Boolean) {
        dataStore.edit { it[Keys.HIGHLIGHT_CONSTRAINTS] = value }
    }

    suspend fun setSoundEffects(value: Boolean) {
        dataStore.edit { it[Keys.SOUND_EFFECTS] = value }
    }

    suspend fun setDifficulty(value: Difficulty) {
        dataStore.edit { it[Keys.DIFFICULTY] = value.name }
    }

    suspend fun setAppearance(value: AppearancePreference) {
        dataStore.edit { it[Keys.APPEARANCE] = value.name }
    }
}
