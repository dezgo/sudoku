package com.derekgillett.sudoku.data

import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.MultiplayerCreateResponse
import com.derekgillett.sudoku.network.MultiplayerGame
import com.derekgillett.sudoku.network.MultiplayerGameDetail
import com.derekgillett.sudoku.network.MultiplayerMoveResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * Cached list of the signed-in user's multiplayer games + create / move
 * operations. Mirrors MultiplayerStore.swift.
 */
class MultiplayerRepository(
    private val client: ApiClient,
    private val auth: AuthRepository
) {
    private val _inProgress = MutableStateFlow<List<MultiplayerGame>>(emptyList())
    val inProgress: StateFlow<List<MultiplayerGame>> = _inProgress.asStateFlow()

    private val _completed = MutableStateFlow<List<MultiplayerGame>>(emptyList())
    val completed: StateFlow<List<MultiplayerGame>> = _completed.asStateFlow()

    /** App-Links delivered invite code waiting to be auto-joined.
     *  MainActivity writes to it from onCreate/onNewIntent; SudokuRoot
     *  observes and either auto-joins (if signed in) or prompts sign-in
     *  first and auto-joins on success. */
    private val _pendingInviteCode = MutableStateFlow<String?>(null)
    val pendingInviteCode: StateFlow<String?> = _pendingInviteCode.asStateFlow()

    fun setPendingInviteCode(code: String?) { _pendingInviteCode.value = code }
    fun clearPendingInviteCode() { _pendingInviteCode.value = null }

    suspend fun refresh() {
        val token = auth.token.value ?: run {
            _inProgress.value = emptyList()
            _completed.value = emptyList()
            return
        }
        try {
            val response = client.myMultiplayerGames(token)
            _inProgress.value = response.inProgress
            _completed.value = response.completed
        } catch (_: ApiClient.ApiException) {
            // keep existing cached state on failure
        }
    }

    suspend fun create(
        difficulty: Difficulty,
        turnDurationSeconds: Int,
        competitiveMode: Boolean,
        invitedUserIds: List<String>?,
        groupId: String?
    ): MultiplayerCreateResponse {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val response = client.createMultiplayerGame(
            token, difficulty, turnDurationSeconds, competitiveMode,
            invitedUserIds, groupId
        )
        refresh()
        return response
    }

    suspend fun detail(gameId: String): MultiplayerGameDetail {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        return client.multiplayerGame(token, gameId)
    }

    suspend fun join(gameId: String, inviteCode: String?): MultiplayerGame {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val game = client.joinMultiplayerGame(token, gameId, inviteCode)
        refresh()
        return game
    }

    /** App-Links entry: only the 6-char invite code is known. */
    suspend fun joinByCode(inviteCode: String): MultiplayerGame {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val game = client.joinMultiplayerByCode(token, inviteCode)
        refresh()
        return game
    }

    suspend fun decline(gameId: String) {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        client.declineMultiplayerGame(token, gameId)
        refresh()
    }

    suspend fun leave(gameId: String) {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        client.leaveMultiplayerGame(token, gameId)
        refresh()
    }

    suspend fun start(gameId: String): MultiplayerGame {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val game = client.startMultiplayerGame(token, gameId)
        refresh()
        return game
    }

    suspend fun postMove(gameId: String, row: Int, col: Int, value: Int): MultiplayerMoveResponse {
        val token = auth.token.value ?: throw ApiClient.ApiException.Unknown
        val response = client.postMultiplayerMove(
            token, gameId, row, col, value, UUID.randomUUID().toString()
        )
        refresh()
        return response
    }

    fun clear() {
        _inProgress.value = emptyList()
        _completed.value = emptyList()
    }
}
