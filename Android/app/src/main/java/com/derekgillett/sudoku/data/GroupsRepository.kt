package com.derekgillett.sudoku.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.ApiGroup
import com.derekgillett.sudoku.network.CreateGroupResponse
import com.derekgillett.sudoku.network.GroupListItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Cached list of the signed-in user's groups + create/join/leave operations.
 * Cache is in DataStore (the existing app-wide preferences store) under
 * `sudoku.groups.v1` per SPEC §4. Mirrors GroupsStore.swift.
 */
class GroupsRepository(
    private val dataStore: DataStore<Preferences>,
    private val client: ApiClient,
    private val auth: AuthRepository
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val cacheKey = stringPreferencesKey("sudoku.groups.v1")

    private val _groups = MutableStateFlow<List<GroupListItem>>(emptyList())
    val groups: StateFlow<List<GroupListItem>> = _groups.asStateFlow()

    init {
        // Prime from disk; fire-and-forget initial read.
    }

    /** Long-lived flow of cached groups, useful for cold launches. */
    val cached: Flow<List<GroupListItem>> = dataStore.data.map { prefs ->
        decodeOrEmpty(prefs[cacheKey])
    }

    /** Force-refresh from the server. Falls back to cache on network failure. */
    suspend fun refresh() {
        val token = auth.token.value ?: run {
            _groups.value = emptyList()
            return
        }
        try {
            val fetched = client.meGroups(token)
            _groups.value = fetched
            saveCache(fetched)
        } catch (_: ApiClient.ApiException) {
            // keep whatever's already in _groups
        }
    }

    suspend fun create(name: String): CreateGroupResponse {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val response = client.createGroup(token, name)
        refresh()
        return response
    }

    suspend fun join(inviteCode: String): ApiGroup {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val group = client.joinGroup(token, inviteCode)
        refresh()
        return group
    }

    suspend fun leave(groupId: String) {
        val token = auth.token.value ?: return
        client.leaveGroup(token, groupId)
        refresh()
    }

    /** Called on sign-out to wipe the cache. */
    suspend fun clear() {
        _groups.value = emptyList()
        dataStore.edit { it.remove(cacheKey) }
    }

    /** Initial load from disk into the in-memory flow. Call once on startup. */
    suspend fun primeFromCache() {
        val prefs = dataStore.data.first()
        _groups.value = decodeOrEmpty(prefs[cacheKey])
    }

    private suspend fun saveCache(groups: List<GroupListItem>) {
        try {
            val text = json.encodeToString(groups)
            dataStore.edit { it[cacheKey] = text }
        } catch (_: SerializationException) {
            // best-effort
        }
    }

    private fun decodeOrEmpty(text: String?): List<GroupListItem> {
        if (text.isNullOrEmpty()) return emptyList()
        return try {
            json.decodeFromString(text)
        } catch (_: SerializationException) {
            emptyList()
        }
    }
}
