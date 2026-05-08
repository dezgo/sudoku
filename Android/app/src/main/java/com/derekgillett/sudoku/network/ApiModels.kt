package com.derekgillett.sudoku.network

import com.derekgillett.sudoku.model.Difficulty
import com.derekgillett.sudoku.model.Puzzle
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

// Wire DTOs for the Sudoku backend at sudoku.appfoundry.cc.
// See ../../../../../Backend/src/index.ts and SPEC.md §17.5.

@Serializable
data class AuthVerifyResponse(
    val token: String,
    val user: ApiUser,
    @SerialName("needs_display_name") val needsDisplayName: Boolean
)

@Serializable
data class ApiUser(
    val id: String,
    @SerialName("display_name") val displayName: String?
)

@Serializable
data class ApiGroup(
    val id: String,
    val name: String
)

@Serializable
data class GroupListItem(
    val group: ApiGroup,
    @SerialName("member_count") val memberCount: Int,
    // Optional so cached entries from before the field existed still decode.
    @SerialName("invite_code") val inviteCode: String? = null
)

@Serializable
data class CreateGroupResponse(
    val group: ApiGroup,
    @SerialName("invite_code") val inviteCode: String
)

@Serializable
data class JoinGroupResponse(val group: ApiGroup)

@Serializable
data class UserResponse(val user: ApiUser)

/** Reply from `GET /v1/version` — drives the in-app update prompt. */
@Serializable
data class VersionInfo(
    val current: String,
    @SerialName("min_required") val minRequired: String,
    @SerialName("store_url") val storeUrl: String
)

@Serializable
data class VersionResponse(
    val ios: VersionInfo,
    val android: VersionInfo
)

/** Members-roster row: a user plus their all-time daily-puzzle stats. */
/** A completed-daily record returned by `GET /me/scores`. Givens + solution
 *  are included so the client can replay the completed board without a
 *  second round-trip. */
@Serializable
data class RemoteScore(
    @SerialName("puzzle_id") val puzzleId: Int,
    @SerialName("elapsed_seconds") val elapsedSeconds: Int,
    val mistakes: Int = 0,
    @SerialName("completed_at") val completedAt: Long,
    @SerialName("hints_used") val hintsUsed: Int = 0,
    @SerialName("pencil_assists_used") val pencilAssistsUsed: Int = 0,
    @SerialName("highlight_mistakes_was_on") val highlightMistakesWasOn: Boolean = true,
    @SerialName("highlight_rules_was_on") val highlightRulesWasOn: Boolean = true,
    @Serializable(with = DifficultyLowercaseSerializer::class)
    val difficulty: Difficulty,
    val date: String,
    val givens: List<List<Int>>,
    val solution: List<List<Int>>
)

@Serializable
data class MyScoresResponse(val scores: List<RemoteScore> = emptyList())

@Serializable
data class GroupMember(
    val user: ApiUser,
    @SerialName("dailies_completed") val dailiesCompleted: Int = 0,
    @SerialName("last_completed_at") val lastCompletedAt: Long? = null
)

// MARK: - Multiplayer DTOs

@Serializable
data class MultiplayerGame(
    val id: String,
    @SerialName("puzzle_id") val puzzleId: Int,
    @Serializable(with = DifficultyLowercaseSerializer::class)
    val difficulty: Difficulty,
    val status: MultiplayerStatus,
    @SerialName("active_player_id") val activePlayerId: String? = null,
    @SerialName("turn_deadline") val turnDeadline: Long? = null,
    @SerialName("turn_duration_seconds") val turnDurationSeconds: Int,
    @SerialName("competitive_mode") val competitiveMode: Boolean = false,
    @SerialName("created_by") val createdBy: String,
    @SerialName("created_at") val createdAt: Long,
    @SerialName("completed_at") val completedAt: Long? = null,
    @SerialName("winner_id") val winnerId: String? = null,
    @SerialName("invite_code") val inviteCode: String,
    @SerialName("is_my_turn") val isMyTurn: Boolean = false,
    @SerialName("time_remaining_seconds") val timeRemainingSeconds: Int? = null
)

@Serializable
enum class MultiplayerStatus {
    @SerialName("pending") PENDING,
    @SerialName("active") ACTIVE,
    @SerialName("completed") COMPLETED,
    @SerialName("abandoned") ABANDONED
}

@Serializable
data class MultiplayerPlayer(
    val user: ApiUser,
    @SerialName("join_order") val joinOrder: Int,
    val status: MultiplayerPlayerStatus,
    @SerialName("joined_at") val joinedAt: Long? = null
)

@Serializable
enum class MultiplayerPlayerStatus {
    @SerialName("invited") INVITED,
    @SerialName("joined") JOINED,
    @SerialName("declined") DECLINED,
    @SerialName("left") LEFT
}

@Serializable
data class MultiplayerMove(
    @SerialName("move_index") val moveIndex: Int,
    @SerialName("player_id") val playerId: String,
    val row: Int,
    val col: Int,
    val value: Int,
    @SerialName("was_correct") val wasCorrect: Boolean,
    @SerialName("placed_at") val placedAt: Long
)

@Serializable
data class MultiplayerGameDetail(
    val game: MultiplayerGame,
    val players: List<MultiplayerPlayer>,
    val moves: List<MultiplayerMove>,
    val board: List<List<Int>>
)

@Serializable
data class MultiplayerCreateResponse(
    val game: MultiplayerGame,
    @SerialName("invite_code") val inviteCode: String
)

@Serializable
data class MultiplayerListResponse(
    @SerialName("in_progress") val inProgress: List<MultiplayerGame> = emptyList(),
    val completed: List<MultiplayerGame> = emptyList()
)

@Serializable
data class MultiplayerMoveResponse(
    val move: MultiplayerMove,
    val game: MultiplayerGame,
    val board: List<List<Int>>
)

@Serializable
internal data class MultiplayerGameWrap(val game: MultiplayerGame)

@Serializable
data class PuzzleResponse(
    @SerialName("puzzle_id") val puzzleId: Int,
    val date: String,
    @Serializable(with = DifficultyLowercaseSerializer::class)
    val difficulty: Difficulty,
    val givens: List<List<Int>>,
    val solution: List<List<Int>>
) {
    fun toPuzzle() = Puzzle(
        id = puzzleId,
        difficulty = difficulty,
        givens = givens,
        solution = solution
    )
}

@Serializable
data class DailyTodayResponse(
    val today: PuzzleResponse,
    val tomorrow: PuzzleResponse
)

@Serializable
data class ScoreSubmitResponse(val rank: Int)

@Serializable
data class LeaderboardEntry(
    @SerialName("display_name") val displayName: String?,
    @SerialName("elapsed_seconds") val elapsedSeconds: Int,
    /** What the server used for ranking (raw + mistake penalty). Defaults to
     *  elapsedSeconds for backwards-compat with pre-effective_seconds servers. */
    @SerialName("effective_seconds") val effectiveSeconds: Int = -1,
    @SerialName("completed_at") val completedAt: Long,
    val rank: Int,
    // Assist markers — defaults make older server responses (pre-migration
    // 0002) decode cleanly. Pessimistic defaults: assume each assist *was*
    // used so we don't falsely award the Purist badge to old rows.
    @SerialName("hints_used") val hintsUsed: Int = 1,
    @SerialName("pencil_assists_used") val pencilAssistsUsed: Int = 1,
    @SerialName("highlight_mistakes_was_on") val highlightMistakesWasOn: Boolean = true,
    @SerialName("highlight_rules_was_on") val highlightRulesWasOn: Boolean = true,
    // Server-derived from raw mistake count. Default false so older
    // responses don't falsely award the Flawless badge.
    val flawless: Boolean = false
) {
    /** Effective seconds, falling back to raw if the server didn't send it. */
    val effectiveSecondsOrFallback: Int
        get() = if (effectiveSeconds > 0) effectiveSeconds else elapsedSeconds
}

/**
 * The server emits Difficulty as lowercase ("medium"); the local Difficulty
 * enum's default Kotlinx serializer would expect "MEDIUM". Localized
 * serializer keeps the wire and storage formats independent.
 */
private object DifficultyLowercaseSerializer : KSerializer<Difficulty> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("Difficulty", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Difficulty) {
        encoder.encodeString(value.name.lowercase())
    }

    override fun deserialize(decoder: Decoder): Difficulty {
        return Difficulty.valueOf(decoder.decodeString().uppercase())
    }
}
