package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.generator.DailyPuzzle
import com.derekgillett.sudoku.generator.PuzzleProvider
import com.derekgillett.sudoku.model.Puzzle
import com.derekgillett.sudoku.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.LocalDate
import kotlin.math.abs

/**
 * Resolves "today's daily" by fetching from the server and caching today +
 * tomorrow locally. If the network is unreachable on first launch, falls
 * back to the local generator (SPEC §7) — flagged offline so callers refuse
 * to post a score against a non-canonical puzzle.
 *
 * Mirrors DailyPuzzleStore.swift.
 */
class DailyPuzzleRepository(
    private val dataStore: DataStore<Preferences>,
    private val client: ApiClient,
    private val fallbackProvider: PuzzleProvider
) {
    @Serializable
    private data class Cached(
        val today: Puzzle,
        val tomorrow: Puzzle,
        val fetchedAt: Long
    )

    private val json = Json { ignoreUnknownKeys = true }
    private val cacheKey = stringPreferencesKey("sudoku.daily_cache.v1")

    private val _today = MutableStateFlow<Puzzle?>(null)
    val today: StateFlow<Puzzle?> = _today.asStateFlow()

    private val _tomorrow = MutableStateFlow<Puzzle?>(null)
    val tomorrow: StateFlow<Puzzle?> = _tomorrow.asStateFlow()

    private val _todayIsOffline = MutableStateFlow(false)
    val todayIsOffline: StateFlow<Boolean> = _todayIsOffline.asStateFlow()

    suspend fun primeFromCache() {
        val prefs = dataStore.data.first()
        val raw = prefs[cacheKey] ?: return
        val cached = decodeCacheOrNull(raw) ?: return
        _today.value = cached.today
        _tomorrow.value = cached.tomorrow
    }

    /**
     * Best-effort background refresh. Called on launch and after foreground.
     * Failure is silent — last cached value stays in place; if there's no
     * cache either, [ensureToday] uses the offline-fallback generator.
     */
    suspend fun refresh() {
        try {
            val resp = client.dailyToday()
            val t = resp.today.toPuzzle()
            val tom = resp.tomorrow.toPuzzle()
            _today.value = t
            _tomorrow.value = tom
            _todayIsOffline.value = false
            saveCache(Cached(t, tom, System.currentTimeMillis()))
        } catch (_: ApiClient.ApiException) {
            // keep whatever's in `_today`
        }
    }

    /**
     * Returns today's daily, fetching/falling back as needed. The Boolean is
     * true when the puzzle came from the offline-fallback generator (so the
     * caller knows not to post a score against it later).
     */
    suspend fun ensureToday(): Pair<Puzzle, Boolean> {
        _today.value?.let { if (isCachedTodayStillToday(it)) return it to _todayIsOffline.value }
        refresh()
        _today.value?.let { if (isCachedTodayStillToday(it)) return it to _todayIsOffline.value }
        val fallback = fallbackProvider.dailyPuzzle(LocalDate.now())
        _today.value = fallback
        _todayIsOffline.value = true
        return fallback to true
    }

    /**
     * True when the cached `today` matches the device's current calendar
     * date (used to invalidate yesterday's value if the user kept the app
     * open across midnight).
     */
    private fun isCachedTodayStillToday(cached: Puzzle): Boolean {
        if (!cached.isDaily) return false
        val localTodayId = DailyPuzzle.id(LocalDate.now())
        // Allow ±1 day skew because the server timezone (Sydney) may differ
        // from the device's by one day at boundary moments. (SPEC §17.6)
        return abs(cached.id - localTodayId) <= 1
    }

    private suspend fun saveCache(cached: Cached) {
        try {
            val text = json.encodeToString(cached)
            dataStore.edit { it[cacheKey] = text }
        } catch (_: SerializationException) {
            // best-effort
        }
    }

    private fun decodeCacheOrNull(raw: String): Cached? = try {
        json.decodeFromString(raw)
    } catch (_: SerializationException) {
        null
    }
}
