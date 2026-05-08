package com.derekgillett.sudoku.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.derekgillett.sudoku.network.ApiClient
import com.derekgillett.sudoku.network.ApiUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Authoritative client-side state for the signed-in user. Owns the bearer
 * token (EncryptedSharedPreferences-backed, per SPEC §17.2) and the cached
 * user identity. Mirrors AuthStore.swift.
 */
class AuthRepository(
    context: Context,
    private val client: ApiClient
) {
    sealed class SignInError(message: String) : Exception(message) {
        object InvalidEmail : SignInError("invalid_email")
        object WrongCode : SignInError("wrong_code")
        object CodeExpired : SignInError("code_expired")
        object TooManyAttempts : SignInError("too_many_attempts")
        object Offline : SignInError("offline")
        object Server : SignInError("server")
    }

    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "sudoku_secure",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val json = Json { ignoreUnknownKeys = true }

    private val _token = MutableStateFlow(prefs.getString(KEY_TOKEN, null))
    val token: StateFlow<String?> = _token.asStateFlow()

    private val _user = MutableStateFlow(loadCachedUser())
    val user: StateFlow<ApiUser?> = _user.asStateFlow()

    val isSignedIn: Boolean get() = _token.value != null
    val displayName: String? get() = _user.value?.displayName

    suspend fun startSignIn(email: String) {
        val trimmed = email.trim().lowercase()
        try {
            client.authStart(trimmed)
        } catch (_: ApiClient.ApiException.Offline) {
            throw SignInError.Offline
        } catch (e: ApiClient.ApiException.Http) {
            if (e.status == 400) throw SignInError.InvalidEmail
            throw SignInError.Server
        } catch (_: ApiClient.ApiException) {
            throw SignInError.Server
        }
    }

    /** @return true if the verified user still needs a display name. */
    suspend fun verifySignIn(email: String, code: String): Boolean {
        val trimmedEmail = email.trim().lowercase()
        val trimmedCode = code.trim()
        val response = try {
            client.authVerify(trimmedEmail, trimmedCode)
        } catch (_: ApiClient.ApiException.Offline) {
            throw SignInError.Offline
        } catch (e: ApiClient.ApiException.Http) {
            when (e.detail) {
                "wrong_code" -> throw SignInError.WrongCode
                "code_expired" -> throw SignInError.CodeExpired
                "too_many_attempts" -> throw SignInError.TooManyAttempts
                else -> throw SignInError.Server
            }
        } catch (_: ApiClient.ApiException) {
            throw SignInError.Server
        }
        persistToken(response.token)
        persistUser(response.user)
        return response.needsDisplayName
    }

    suspend fun setDisplayName(name: String) {
        val token = _token.value ?: throw SignInError.Server
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        val updated = try {
            client.putMe(token, trimmed)
        } catch (_: ApiClient.ApiException.Offline) {
            throw SignInError.Offline
        } catch (_: ApiClient.ApiException) {
            throw SignInError.Server
        }
        persistUser(updated)
    }

    fun signOut() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_USER).apply()
        _token.value = null
        _user.value = null
    }

    /** Hard-delete the account on the server, then clear all local auth.
     *  Throws on network / server failure so the caller can surface the
     *  error. Required by App Store Guideline 5.1.1(v). */
    suspend fun deleteAccount() {
        val token = _token.value ?: return
        client.deleteMe(token)
        signOut()
    }

    private fun persistToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
        _token.value = token
    }

    private fun persistUser(user: ApiUser) {
        try {
            prefs.edit().putString(KEY_USER, json.encodeToString(user)).apply()
        } catch (_: SerializationException) {
            // best-effort cache
        }
        _user.value = user
    }

    private fun loadCachedUser(): ApiUser? {
        val raw = prefs.getString(KEY_USER, null) ?: return null
        return try {
            json.decodeFromString<ApiUser>(raw)
        } catch (_: SerializationException) {
            null
        }
    }

    companion object {
        private const val KEY_TOKEN = "api_token"
        private const val KEY_USER = "api_user_v1"
    }
}
