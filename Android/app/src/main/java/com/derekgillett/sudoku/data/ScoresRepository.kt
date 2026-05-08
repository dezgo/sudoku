package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.RemoteScore
import com.derekgillett.sudoku.network.LeaderboardEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Owns score submission for daily solves. POSTs immediately when authenticated;
 * queues to DataStore (`sudoku.pending_scores.v1`) when offline or signed-out
 * so they get flushed on next launch / after sign-in. Composite PK on the
 * server makes retry safe.
 *
 * Spec §17.4. Offline-fallback puzzles are NOT submitted (caller's job to
 * filter — see SudokuRoot's solve handler).
 *
 * Mirrors ScoresStore.swift.
 */
class ScoresRepository(
    private val dataStore: DataStore<Preferences>,
    private val client: ApiClient,
    private val auth: AuthRepository
) {
    @Serializable
    data class Pending(
        val puzzleId: Int,
        val elapsedSeconds: Int,
        val mistakes: Int,
        val completedAt: Long,
        // Assist markers — optional for backwards compat with queued items
        // from earlier app versions that didn't track them.
        val hintsUsed: Int = 0,
        val pencilAssistsUsed: Int = 0,
        val highlightMistakesWasOn: Boolean = false,
        val highlightRulesWasOn: Boolean = false
    )

    private val json = Json { ignoreUnknownKeys = true }
    private val queueKey = stringPreferencesKey("sudoku.pending_scores.v1")

    private val _lastRank = MutableStateFlow<Int?>(null)
    val lastRank: StateFlow<Int?> = _lastRank.asStateFlow()

    /**
     * Submit a daily-puzzle solve. Returns rank if posted now; null if queued
     * (offline or signed-out). Caller must already have verified the puzzle is
     * a real daily and not an offline-fallback.
     */
    suspend fun submit(
        puzzleId: Int,
        elapsedSeconds: Int,
        mistakes: Int,
        hintsUsed: Int,
        pencilAssistsUsed: Int,
        highlightMistakesWasOn: Boolean,
        highlightRulesWasOn: Boolean
    ): Int? {
        val pending = Pending(
            puzzleId, elapsedSeconds, mistakes, System.currentTimeMillis(),
            hintsUsed, pencilAssistsUsed, highlightMistakesWasOn, highlightRulesWasOn
        )
        val token = auth.token.value
        if (token == null) {
            enqueue(pending)
            return null
        }
        return try {
            val rank = client.postScore(
                token, puzzleId, elapsedSeconds, mistakes,
                hintsUsed, pencilAssistsUsed, highlightMistakesWasOn, highlightRulesWasOn
            )
            _lastRank.value = rank
            rank
        } catch (_: ApiClient.ApiException) {
            enqueue(pending)
            null
        }
    }

    /**
     * Drain the offline queue. Best-effort: anything that still fails stays
     * queued for next time. No-op if not signed in.
     */
    suspend fun flushPending() {
        val token = auth.token.value ?: return
        val queue = loadQueue().toMutableList()
        if (queue.isEmpty()) return

        val remaining = mutableListOf<Pending>()
        for (item in queue) {
            try {
                client.postScore(
                    token, item.puzzleId, item.elapsedSeconds, item.mistakes,
                    item.hintsUsed, item.pencilAssistsUsed,
                    item.highlightMistakesWasOn, item.highlightRulesWasOn
                )
                // Posted (or 4xx — drop, can't recover).
            } catch (_: ApiClient.ApiException.Offline) {
                remaining.add(item)
            } catch (e: ApiClient.ApiException.Http) {
                if (e.status in 500..599) remaining.add(item)
                // 4xx: drop. Bad puzzle_id, expired token, etc.
            } catch (_: ApiClient.ApiException.Unknown) {
                remaining.add(item)
            } catch (_: ApiClient.ApiException) {
                // any other ApiException → drop
            }
        }
        saveQueue(remaining)
    }

    suspend fun fetchLeaderboard(groupId: String, puzzleId: Int): List<LeaderboardEntry> {
        val token = auth.token.value ?: throw ApiClient.ApiException.Http(401, "unauthenticated")
        return client.groupScores(token, groupId, puzzleId)
    }

    /** Fetch this user's completed-daily history from the backend. Returns
     *  empty list on failure. Used at sign-in to seed local history on a
     *  fresh install. */
    suspend fun fetchMyScores(): List<RemoteScore> {
        val token = auth.token.value ?: return emptyList()
        return runCatching { client.meScores(token) }.getOrDefault(emptyList())
    }

    suspend fun clear() {
        _lastRank.value = null
        dataStore.edit { it.remove(queueKey) }
    }

    private suspend fun enqueue(p: Pending) {
        val queue = loadQueue().toMutableList()
        queue.add(p)
        saveQueue(queue)
    }

    private suspend fun loadQueue(): List<Pending> {
        val raw = dataStore.data.first()[queueKey] ?: return emptyList()
        return try {
            json.decodeFromString(raw)
        } catch (_: SerializationException) {
            emptyList()
        }
    }

    private suspend fun saveQueue(items: List<Pending>) {
        try {
            val text = json.encodeToString(items)
            dataStore.edit { it[queueKey] = text }
        } catch (_: SerializationException) {
            // best-effort
        }
    }
}
