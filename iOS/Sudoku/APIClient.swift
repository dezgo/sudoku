//
//  APIClient.swift
//  Sudoku
//
//  Thin async HTTP client over URLSession for the Sudoku backend at
//  sudoku.appfoundry.cc. See ../Backend/src/index.ts for the route table
//  and ../../SPEC.md §17 for the contract.
//
//  Shape: pure functions per endpoint. The token is passed in by callers
//  (AuthStore is the only thing that knows where it lives), so this client
//  has no auth state of its own and is trivially testable.
//

import Foundation

enum APIError: Error, Equatable {
    case offline                 // URLError indicating no connectivity
    case http(Int, String?)      // server returned non-2xx; optional `error` body
    case decode                  // response wasn't valid JSON in the expected shape
    case unknown
}

// Wire DTOs are Codable (both directions) at their declaration site so
// AuthStore / GroupsStore can round-trip them through UserDefaults caches
// without running into Swift's "extension outside file" auto-synthesis
// limitation. The cached form uses default camelCase keys (the snake_case
// network strategy is configured on the API client's own coder).

struct AuthVerifyResponse: Codable {
    let token: String
    let user: APIUser
    let needsDisplayName: Bool
}

struct APIUser: Codable, Equatable {
    let id: String
    let displayName: String?
}

struct APIGroup: Codable, Equatable {
    let id: String
    let name: String
}

struct GroupListItem: Codable, Equatable {
    let group: APIGroup
    let memberCount: Int
    // Optional so cached entries from before the field existed still decode.
    let inviteCode: String?
}

struct CreateGroupResponse: Codable {
    let group: APIGroup
    let inviteCode: String
}

struct JoinGroupResponse: Codable {
    let group: APIGroup
}

struct UserResponse: Codable {
    let user: APIUser
}

/// Reply from `GET /v1/version` — drives the in-app update prompt. The
/// client compares its bundle version to `current` (soft prompt) and
/// `minRequired` (hard block).
struct VersionInfo: Codable, Equatable {
    let current: String
    let minRequired: String
    let storeUrl: String
}

struct VersionResponse: Codable {
    let ios: VersionInfo
    let android: VersionInfo
}

/// One completed-daily record returned by `GET /me/scores`. The givens +
/// solution are included so the client can replay the completed board
/// without a second round-trip.
struct RemoteScore: Codable, Equatable {
    let puzzleId: Int
    let elapsedSeconds: Int
    let mistakes: Int
    let completedAt: Int       // unix-millis
    let hintsUsed: Int
    let pencilAssistsUsed: Int
    let highlightMistakesWasOn: Bool
    let highlightRulesWasOn: Bool
    let difficulty: Difficulty
    let date: String
    let givens: [[Int]]
    let solution: [[Int]]
}

struct MyScoresResponse: Codable {
    let scores: [RemoteScore]
}

// MARK: - Multiplayer DTOs

/// One multiplayer game's metadata. The live board is fetched separately
/// (server reconstructs from givens + correct moves). `is_my_turn` and
/// `time_remaining_seconds` are server-computed conveniences.
struct MultiplayerGame: Codable, Equatable, Identifiable, Hashable {
    let id: String
    let puzzleId: Int
    let difficulty: Difficulty
    let status: MultiplayerStatus
    let activePlayerId: String?
    let turnDeadline: Int?            // unix-millis
    let turnDurationSeconds: Int      // 0 = unlimited
    let competitiveMode: Bool
    let createdBy: String
    let createdAt: Int
    let completedAt: Int?
    let winnerId: String?
    let inviteCode: String
    let isMyTurn: Bool
    let timeRemainingSeconds: Int?
}

enum MultiplayerStatus: String, Codable {
    case pending, active, completed, abandoned
}

struct MultiplayerPlayer: Codable, Equatable {
    let user: APIUser
    let joinOrder: Int
    let status: MultiplayerPlayerStatus
    let joinedAt: Int?
}

enum MultiplayerPlayerStatus: String, Codable {
    case invited, joined, declined, left
}

struct MultiplayerMove: Codable, Equatable {
    let moveIndex: Int
    let playerId: String
    let row: Int
    let col: Int
    let value: Int
    let wasCorrect: Bool
    let placedAt: Int
}

/// Response shape for `GET /multiplayer/games/:id`. `board` is the live
/// 9×9 grid (0 = empty, 1-9 = filled).
struct MultiplayerGameDetail: Codable, Equatable {
    let game: MultiplayerGame
    let players: [MultiplayerPlayer]
    let moves: [MultiplayerMove]
    let board: [[Int]]
}

struct MultiplayerCreateResponse: Codable {
    let game: MultiplayerGame
    let inviteCode: String
}

struct MultiplayerListResponse: Codable {
    let inProgress: [MultiplayerGame]
    let completed: [MultiplayerGame]
}

struct MultiplayerMoveResponse: Codable {
    let move: MultiplayerMove
    let game: MultiplayerGame
    let board: [[Int]]
}

/// Members-roster row: a user plus their all-time daily-puzzle stats.
/// `lastCompletedAt` is unix-millis; nil means they've never solved a daily.
/// Custom decoder uses `decodeIfPresent` for the stats fields so older backend
/// responses (pre-stats endpoint) still decode — both default to "no dailies".
struct GroupMember: Codable, Equatable {
    let user: APIUser
    let dailiesCompleted: Int
    let lastCompletedAt: Int?

    private enum CodingKeys: String, CodingKey {
        case user, dailiesCompleted, lastCompletedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        user = try c.decode(APIUser.self, forKey: .user)
        dailiesCompleted = try c.decodeIfPresent(Int.self, forKey: .dailiesCompleted) ?? 0
        lastCompletedAt = try c.decodeIfPresent(Int.self, forKey: .lastCompletedAt)
    }
}

struct PuzzleResponse: Codable {
    let puzzleId: Int
    let date: String
    let difficulty: Difficulty
    let givens: [[Int]]
    let solution: [[Int]]

    func toPuzzle() -> Puzzle {
        Puzzle(id: puzzleId, difficulty: difficulty, givens: givens, solution: solution)
    }
}

struct DailyTodayResponse: Codable {
    let today: PuzzleResponse
    let tomorrow: PuzzleResponse
}

struct ScoreSubmitResponse: Codable {
    let rank: Int
}

struct LeaderboardEntry: Equatable, Identifiable {
    let displayName: String?
    let elapsedSeconds: Int
    /// What the server used for ranking — `elapsed_seconds × (1 + 0.10 ×
    /// min(mistakes, 5))`. Exposing this lets the client show "raw vs
    /// effective" without ever leaking the raw mistake count. Falls back
    /// to elapsedSeconds for backwards-compat with older server responses.
    let effectiveSeconds: Int
    let completedAt: Int
    let rank: Int
    // Assist markers. Custom decoder uses decodeIfPresent so older backend
    // responses (pre-migration 0002) still decode — missing fields default
    // to "no badge earned" (i.e., conservatively assume assists were used)
    // until we've confirmed otherwise. The UI inverts these into "badges".
    let hintsUsed: Int
    let pencilAssistsUsed: Int
    let highlightMistakesWasOn: Bool
    let highlightRulesWasOn: Bool
    /// Server-derived flag: the solve had zero mistakes. Backend computes it
    /// from the raw mistake count (which is *not* exposed on the leaderboard
    /// — see SPEC §17.4). Default false on older responses where the field
    /// is missing, so we don't falsely award the Flawless badge.
    let flawless: Bool

    var id: Int { rank }

    /// True when the solve used no real assists (no tutor hints, no
    /// auto-pencil) AND was flawless. The highlighting toggles deliberately
    /// don't gate Purist anymore — they're learning aids, not assists, and
    /// punishing their use created a perverse incentive to disable helpful
    /// UI just for a badge.
    var isPurist: Bool {
        hintsUsed == 0 && pencilAssistsUsed == 0 && flawless
    }
}

extension LeaderboardEntry: Codable {
    private enum CodingKeys: String, CodingKey {
        case displayName, elapsedSeconds, effectiveSeconds, completedAt, rank
        case hintsUsed, pencilAssistsUsed
        case highlightMistakesWasOn, highlightRulesWasOn
        case flawless
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        let elapsed = try c.decode(Int.self, forKey: .elapsedSeconds)
        elapsedSeconds = elapsed
        // Pre-migration servers don't return effective_seconds — fall back
        // to raw so the player sheet still works (just shows raw == effective).
        effectiveSeconds = try c.decodeIfPresent(Int.self, forKey: .effectiveSeconds) ?? elapsed
        completedAt = try c.decode(Int.self, forKey: .completedAt)
        rank = try c.decode(Int.self, forKey: .rank)
        // Default to "assist was used" (no badge) when the backend hasn't
        // yet shipped the new columns — pessimistic but safe.
        hintsUsed = try c.decodeIfPresent(Int.self, forKey: .hintsUsed) ?? 1
        pencilAssistsUsed = try c.decodeIfPresent(Int.self, forKey: .pencilAssistsUsed) ?? 1
        highlightMistakesWasOn = try c.decodeIfPresent(Bool.self, forKey: .highlightMistakesWasOn) ?? true
        highlightRulesWasOn = try c.decodeIfPresent(Bool.self, forKey: .highlightRulesWasOn) ?? true
        // Default to false on older responses — don't falsely award Flawless.
        flawless = try c.decodeIfPresent(Bool.self, forKey: .flawless) ?? false
    }
}

actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL = URL(string: "https://sudoku.appfoundry.cc/v1")!,
         session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = dec

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = enc
    }

    // MARK: - Auth

    func authStart(email: String) async throws {
        try await sendNoContent("auth/start", method: "POST", body: ["email": email])
    }

    func authVerify(email: String, code: String) async throws -> AuthVerifyResponse {
        try await sendJSON("auth/verify", method: "POST", body: ["email": email, "code": code])
    }

    // MARK: - Me

    func me(token: String) async throws -> APIUser {
        let r: UserResponse = try await sendJSON("me", method: "GET", token: token)
        return r.user
    }

    func putMe(token: String, displayName: String) async throws -> APIUser {
        let r: UserResponse = try await sendJSON(
            "me", method: "PUT", token: token,
            body: ["display_name": displayName]
        )
        return r.user
    }

    /// Hard-delete the signed-in account and every row tied to it (scores,
    /// group memberships, multiplayer history, push tokens, auth tokens).
    /// Required for App Store Guideline 5.1.1(v) compliance.
    func deleteMe(token: String) async throws {
        try await sendNoContent("me", method: "DELETE", token: token)
    }

    func meGroups(token: String) async throws -> [GroupListItem] {
        try await sendJSON("me/groups", method: "GET", token: token)
    }

    func meScores(token: String) async throws -> [RemoteScore] {
        let r: MyScoresResponse = try await sendJSON("me/scores", method: "GET", token: token)
        return r.scores
    }

    // MARK: - Groups

    func createGroup(token: String, name: String) async throws -> CreateGroupResponse {
        try await sendJSON("groups", method: "POST", token: token, body: ["name": name])
    }

    func joinGroup(token: String, inviteCode: String) async throws -> APIGroup {
        let r: JoinGroupResponse = try await sendJSON(
            "groups/join", method: "POST", token: token,
            body: ["invite_code": inviteCode]
        )
        return r.group
    }

    func leaveGroup(token: String, groupID: String) async throws {
        try await sendNoContent(
            "groups/\(groupID)/members/me",
            method: "DELETE", token: token
        )
    }

    func groupMembers(token: String, groupID: String) async throws -> [GroupMember] {
        // Backend returns [{ user: {...}, dailies_completed, last_completed_at }].
        try await sendJSON(
            "groups/\(groupID)/members",
            method: "GET", token: token
        )
    }

    // MARK: - Daily

    func dailyToday() async throws -> DailyTodayResponse {
        try await sendJSON("daily/today", method: "GET")
    }

    func version() async throws -> VersionResponse {
        try await sendJSON("version", method: "GET")
    }

    // MARK: - Scores

    func postScore(
        token: String,
        puzzleID: Int,
        elapsedSeconds: Int,
        mistakes: Int,
        hintsUsed: Int,
        pencilAssistsUsed: Int,
        highlightMistakesWasOn: Bool,
        highlightRulesWasOn: Bool
    ) async throws -> Int {
        let body: [String: Any] = [
            "puzzle_id": puzzleID,
            "elapsed_seconds": elapsedSeconds,
            "mistakes": mistakes,
            "hints_used": hintsUsed,
            "pencil_assists_used": pencilAssistsUsed,
            "highlight_mistakes_was_on": highlightMistakesWasOn,
            "highlight_rules_was_on": highlightRulesWasOn,
        ]
        let r: ScoreSubmitResponse = try await sendJSONRaw("scores", method: "POST", token: token, body: body)
        return r.rank
    }

    func groupScores(token: String, groupID: String, puzzleID: Int) async throws -> [LeaderboardEntry] {
        try await sendJSON("groups/\(groupID)/scores/\(puzzleID)", method: "GET", token: token)
    }

    // MARK: - Multiplayer

    func createMultiplayerGame(
        token: String,
        difficulty: Difficulty,
        turnDurationSeconds: Int,
        competitiveMode: Bool,
        invitedUserIDs: [String]?,
        groupID: String?
    ) async throws -> MultiplayerCreateResponse {
        var body: [String: Any] = [
            "difficulty": difficulty.rawValue,
            "turn_duration_seconds": turnDurationSeconds,
            "competitive_mode": competitiveMode,
        ]
        if let invitedUserIDs { body["invited_user_ids"] = invitedUserIDs }
        if let groupID { body["group_id"] = groupID }
        return try await sendJSONRaw("multiplayer/games", method: "POST", token: token, body: body)
    }

    func multiplayerGame(token: String, gameID: String) async throws -> MultiplayerGameDetail {
        try await sendJSON("multiplayer/games/\(gameID)", method: "GET", token: token)
    }

    func joinMultiplayerGame(token: String, gameID: String, inviteCode: String?) async throws -> MultiplayerGame {
        var body: [String: String] = [:]
        if let inviteCode { body["invite_code"] = inviteCode }
        struct R: Codable { let game: MultiplayerGame }
        let r: R = try await sendJSON(
            "multiplayer/games/\(gameID)/join",
            method: "POST", token: token, body: body
        )
        return r.game
    }

    /// Look up a game by its 6-char invite code and join atomically.
    /// Used by the universal-link flow where the URL only carries the
    /// code (not the game ID).
    func joinMultiplayerByCode(token: String, inviteCode: String) async throws -> MultiplayerGame {
        struct R: Codable { let game: MultiplayerGame }
        let r: R = try await sendJSON(
            "multiplayer/join-by-code",
            method: "POST", token: token, body: ["invite_code": inviteCode]
        )
        return r.game
    }

    func declineMultiplayerGame(token: String, gameID: String) async throws {
        try await sendNoContent("multiplayer/games/\(gameID)/decline", method: "POST", token: token)
    }

    func leaveMultiplayerGame(token: String, gameID: String) async throws {
        try await sendNoContent("multiplayer/games/\(gameID)/leave", method: "POST", token: token)
    }

    func startMultiplayerGame(token: String, gameID: String) async throws -> MultiplayerGame {
        struct R: Codable { let game: MultiplayerGame }
        let r: R = try await sendJSON(
            "multiplayer/games/\(gameID)/start",
            method: "POST", token: token
        )
        return r.game
    }

    func postMultiplayerMove(
        token: String, gameID: String,
        row: Int, col: Int, value: Int, idempotencyKey: String
    ) async throws -> MultiplayerMoveResponse {
        let body: [String: Any] = [
            "row": row,
            "col": col,
            "value": value,
            "idempotency_key": idempotencyKey,
        ]
        return try await sendJSONRaw("multiplayer/games/\(gameID)/moves", method: "POST", token: token, body: body)
    }

    func myMultiplayerGames(token: String) async throws -> MultiplayerListResponse {
        try await sendJSON("me/multiplayer/games", method: "GET", token: token)
    }

    func registerPushToken(token: String, platform: String, pushToken: String) async throws {
        try await sendNoContent(
            "me/push_token", method: "POST", token: token,
            body: ["platform": platform, "token": pushToken]
        )
    }

    func deletePushToken(token: String, pushToken: String) async throws {
        try await sendNoContent(
            "me/push_token", method: "DELETE", token: token,
            body: ["token": pushToken]
        )
    }

    // MARK: - Plumbing

    private func sendJSON<T: Decodable>(
        _ path: String,
        method: String,
        token: String? = nil,
        body: [String: String]? = nil
    ) async throws -> T {
        let data = try await sendRaw(path, method: method, token: token, body: body)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decode
        }
    }

    private func sendNoContent(
        _ path: String,
        method: String,
        token: String? = nil,
        body: [String: String]? = nil
    ) async throws {
        _ = try await sendRaw(path, method: method, token: token, body: body)
    }

    /// Variant that allows non-string JSON bodies (numbers etc). Used by
    /// `/scores` which carries integer fields. Same shape as `sendJSON`.
    private func sendJSONRaw<T: Decodable>(
        _ path: String,
        method: String,
        token: String? = nil,
        body: [String: Any]
    ) async throws -> T {
        let data = try await sendRawAny(path, method: method, token: token, body: body)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decode
        }
    }

    private func sendRaw(
        _ path: String,
        method: String,
        token: String?,
        body: [String: String]?
    ) async throws -> Data {
        try await sendRawAny(path, method: method, token: token, body: body as [String: Any]?)
    }

    private func sendRawAny(
        _ path: String,
        method: String,
        token: String?,
        body: [String: Any]?
    ) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await session.data(for: req)
        } catch let urlErr as URLError where urlErr.code == .notConnectedToInternet
                                          || urlErr.code == .networkConnectionLost
                                          || urlErr.code == .timedOut {
            throw APIError.offline
        } catch {
            throw APIError.unknown
        }

        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard (200..<300).contains(http.statusCode) else {
            // Best-effort: try to surface the server's `error` field for diagnostics.
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.http(http.statusCode, detail)
        }
        return data
    }
}
