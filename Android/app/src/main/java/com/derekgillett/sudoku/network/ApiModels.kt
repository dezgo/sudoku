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
