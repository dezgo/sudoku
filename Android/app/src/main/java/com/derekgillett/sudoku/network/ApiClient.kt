package com.derekgillett.sudoku.network

import com.derekgillett.sudoku.model.Difficulty
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException

/**
 * Thin async HTTP client over HttpURLConnection for the Sudoku backend.
 * Pure functions per endpoint — auth state lives in AuthRepository, the
 * token is passed in by the caller. Mirrors the Swift APIClient.
 */
class ApiClient(
    private val baseUrl: String = "https://sudoku.appfoundry.cc/v1"
) {
    sealed class ApiException(message: String?) : Exception(message) {
        object Offline : ApiException("offline") { private fun readResolve(): Any = Offline }
        class Http(val status: Int, val detail: String?) : ApiException("http $status")
        object Decode : ApiException("decode") { private fun readResolve(): Any = Decode }
        object Unknown : ApiException("unknown") { private fun readResolve(): Any = Unknown }
    }

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    // Auth ------------------------------------------------------------------

    suspend fun authStart(email: String) {
        sendNoContent("auth/start", "POST", body = mapOf("email" to email))
    }

    suspend fun authVerify(email: String, code: String): AuthVerifyResponse =
        sendJson("auth/verify", "POST", body = mapOf("email" to email, "code" to code))

    // Me --------------------------------------------------------------------

    suspend fun me(token: String): ApiUser =
        sendJson<UserResponse>("me", "GET", token = token).user

    suspend fun putMe(token: String, displayName: String): ApiUser =
        sendJson<UserResponse>(
            "me", "PUT", token = token,
            body = mapOf("display_name" to displayName)
        ).user

    /** Hard-delete the signed-in account and every row tied to it. Required
     *  for App Store Guideline 5.1.1(v) compliance — Android mirrors. */
    suspend fun deleteMe(token: String) {
        sendNoContent("me", "DELETE", token = token)
    }

    suspend fun meGroups(token: String): List<GroupListItem> =
        sendJson("me/groups", "GET", token = token)

    suspend fun meScores(token: String): List<RemoteScore> {
        val r: MyScoresResponse = sendJson("me/scores", "GET", token = token)
        return r.scores
    }

    // Groups ----------------------------------------------------------------

    suspend fun createGroup(token: String, name: String): CreateGroupResponse =
        sendJson("groups", "POST", token = token, body = mapOf("name" to name))

    suspend fun joinGroup(token: String, inviteCode: String): ApiGroup =
        sendJson<JoinGroupResponse>(
            "groups/join", "POST", token = token,
            body = mapOf("invite_code" to inviteCode)
        ).group

    suspend fun leaveGroup(token: String, groupId: String) {
        sendNoContent("groups/$groupId/members/me", "DELETE", token = token)
    }

    suspend fun groupMembers(token: String, groupId: String): List<GroupMember> =
        sendJson("groups/$groupId/members", "GET", token = token)

    // Daily -----------------------------------------------------------------

    suspend fun dailyToday(): DailyTodayResponse =
        sendJson("daily/today", "GET")

    suspend fun version(): VersionResponse =
        sendJson("version", "GET")

    // Scores ----------------------------------------------------------------

    suspend fun postScore(
        token: String,
        puzzleId: Int,
        elapsedSeconds: Int,
        mistakes: Int,
        hintsUsed: Int,
        pencilAssistsUsed: Int,
        highlightMistakesWasOn: Boolean,
        highlightRulesWasOn: Boolean
    ): Int {
        val body = JsonObject(
            mapOf(
                "puzzle_id" to JsonPrimitive(puzzleId),
                "elapsed_seconds" to JsonPrimitive(elapsedSeconds),
                "mistakes" to JsonPrimitive(mistakes),
                "hints_used" to JsonPrimitive(hintsUsed),
                "pencil_assists_used" to JsonPrimitive(pencilAssistsUsed),
                "highlight_mistakes_was_on" to JsonPrimitive(highlightMistakesWasOn),
                "highlight_rules_was_on" to JsonPrimitive(highlightRulesWasOn)
            )
        )
        return sendJsonRaw<ScoreSubmitResponse>("scores", "POST", token, body).rank
    }

    suspend fun groupScores(token: String, groupId: String, puzzleId: Int): List<LeaderboardEntry> =
        sendJson("groups/$groupId/scores/$puzzleId", "GET", token = token)

    // Multiplayer -----------------------------------------------------------

    suspend fun createMultiplayerGame(
        token: String,
        difficulty: Difficulty,
        turnDurationSeconds: Int,
        competitiveMode: Boolean,
        invitedUserIds: List<String>?,
        groupId: String?
    ): MultiplayerCreateResponse {
        val body = JsonObject(
            buildMap {
                put("difficulty", JsonPrimitive(difficulty.name.lowercase()))
                put("turn_duration_seconds", JsonPrimitive(turnDurationSeconds))
                put("competitive_mode", JsonPrimitive(competitiveMode))
                invitedUserIds?.let {
                    put("invited_user_ids", kotlinx.serialization.json.JsonArray(it.map { id -> JsonPrimitive(id) }))
                }
                groupId?.let { put("group_id", JsonPrimitive(it)) }
            }
        )
        return sendJsonRaw("multiplayer/games", "POST", token, body)
    }

    suspend fun multiplayerGame(token: String, gameId: String): MultiplayerGameDetail =
        sendJson("multiplayer/games/$gameId", "GET", token = token)

    suspend fun joinMultiplayerGame(token: String, gameId: String, inviteCode: String?): MultiplayerGame {
        val body = if (inviteCode != null) mapOf("invite_code" to inviteCode) else null
        val r: MultiplayerGameWrap = sendJson(
            "multiplayer/games/$gameId/join", "POST", token = token, body = body
        )
        return r.game
    }

    suspend fun joinMultiplayerByCode(token: String, inviteCode: String): MultiplayerGame {
        val r: MultiplayerGameWrap = sendJson(
            "multiplayer/join-by-code", "POST", token = token,
            body = mapOf("invite_code" to inviteCode)
        )
        return r.game
    }

    suspend fun declineMultiplayerGame(token: String, gameId: String) {
        sendNoContent("multiplayer/games/$gameId/decline", "POST", token = token)
    }

    suspend fun leaveMultiplayerGame(token: String, gameId: String) {
        sendNoContent("multiplayer/games/$gameId/leave", "POST", token = token)
    }

    suspend fun startMultiplayerGame(token: String, gameId: String): MultiplayerGame {
        val r: MultiplayerGameWrap = sendJson(
            "multiplayer/games/$gameId/start", "POST", token = token
        )
        return r.game
    }

    suspend fun postMultiplayerMove(
        token: String, gameId: String,
        row: Int, col: Int, value: Int, idempotencyKey: String
    ): MultiplayerMoveResponse {
        val body = JsonObject(
            mapOf(
                "row" to JsonPrimitive(row),
                "col" to JsonPrimitive(col),
                "value" to JsonPrimitive(value),
                "idempotency_key" to JsonPrimitive(idempotencyKey)
            )
        )
        return sendJsonRaw("multiplayer/games/$gameId/moves", "POST", token, body)
    }

    suspend fun myMultiplayerGames(token: String): MultiplayerListResponse =
        sendJson("me/multiplayer/games", "GET", token = token)

    suspend fun registerPushToken(token: String, platform: String, pushToken: String) {
        sendNoContent(
            "me/push_token", "POST", token = token,
            body = mapOf("platform" to platform, "token" to pushToken)
        )
    }

    suspend fun deletePushToken(token: String, pushToken: String) {
        sendNoContent(
            "me/push_token", "DELETE", token = token,
            body = mapOf("token" to pushToken)
        )
    }

    // Plumbing --------------------------------------------------------------

    private suspend inline fun <reified T> sendJson(
        path: String,
        method: String,
        token: String? = null,
        body: Map<String, String>? = null
    ): T {
        val text = requestText(path, method, token, body)
        return try {
            json.decodeFromString(text)
        } catch (_: SerializationException) {
            throw ApiException.Decode
        } catch (_: IllegalArgumentException) {
            throw ApiException.Decode
        }
    }

    private suspend fun sendNoContent(
        path: String,
        method: String,
        token: String? = null,
        body: Map<String, String>? = null
    ) {
        requestText(path, method, token, body)
    }

    /** Variant that accepts a JsonElement body (for endpoints with non-string fields). */
    private suspend inline fun <reified T> sendJsonRaw(
        path: String,
        method: String,
        token: String?,
        body: JsonElement
    ): T {
        val text = requestTextRaw(path, method, token, json.encodeToString(JsonElement.serializer(), body).toByteArray())
        return try {
            json.decodeFromString(text)
        } catch (_: SerializationException) {
            throw ApiException.Decode
        } catch (_: IllegalArgumentException) {
            throw ApiException.Decode
        }
    }

    private suspend fun requestText(
        path: String,
        method: String,
        token: String?,
        body: Map<String, String>?
    ): String = requestTextRaw(
        path,
        method,
        token,
        body?.let { json.encodeToString(it).toByteArray() }
    )

    private suspend fun requestTextRaw(
        path: String,
        method: String,
        token: String?,
        body: ByteArray?
    ): String = withContext(Dispatchers.IO) {
        val url = URL("$baseUrl/$path")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Content-Type", "application/json")
            token?.let { setRequestProperty("Authorization", "Bearer $it") }
            connectTimeout = 10_000
            readTimeout = 30_000
            doInput = true
            if (body != null) {
                doOutput = true
                outputStream.use { os -> os.write(body) }
            }
        }
        try {
            val status = conn.responseCode
            val text = if (status in 200..299) {
                conn.inputStream?.bufferedReader()?.use { it.readText() } ?: ""
            } else {
                val errorBody = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                val detail = parseErrorDetail(errorBody)
                throw ApiException.Http(status, detail)
            }
            text
        } catch (_: UnknownHostException) {
            throw ApiException.Offline
        } catch (_: SocketTimeoutException) {
            throw ApiException.Offline
        } catch (_: SecurityException) {
            // Manifest missing INTERNET permission, or stricter Android network
            // policy — treat as offline so callers don't crash.
            throw ApiException.Offline
        } catch (e: ApiException) {
            throw e
        } catch (_: IOException) {
            throw ApiException.Unknown
        } finally {
            conn.disconnect()
        }
    }

    private fun parseErrorDetail(body: String): String? = try {
        val obj = json.parseToJsonElement(body) as? JsonObject ?: return null
        (obj["error"] as? JsonPrimitive)?.content
    } catch (_: Throwable) {
        null
    }
}
