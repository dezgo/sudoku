package com.derekgillett.sudoku.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
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

    suspend fun meGroups(token: String): List<GroupListItem> =
        sendJson("me/groups", "GET", token = token)

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

    // Daily -----------------------------------------------------------------

    suspend fun dailyToday(): DailyTodayResponse =
        sendJson("daily/today", "GET")

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

    private suspend fun requestText(
        path: String,
        method: String,
        token: String?,
        body: Map<String, String>?
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
                outputStream.use { os -> os.write(json.encodeToString(body).toByteArray()) }
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
