//
//  MultiplayerStore.swift
//  Sudoku
//
//  Cached list of the signed-in user's multiplayer games + create / move
//  operations. Mirrors GroupsStore's shape: it fetches via APIClient using
//  AuthStore's token. UI views observe via @EnvironmentObject.
//

import Foundation

@MainActor
final class MultiplayerStore: ObservableObject {
    @Published private(set) var inProgress: [MultiplayerGame] = []
    @Published private(set) var completed: [MultiplayerGame] = []
    @Published private(set) var isLoading = false
    @Published private(set) var lastError: String?

    private let client: APIClient
    private let auth: AuthStore

    init(client: APIClient, auth: AuthStore) {
        self.client = client
        self.auth = auth
    }

    func refresh() async {
        guard let token = auth.token else {
            inProgress = []
            completed = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await client.myMultiplayerGames(token: token)
            inProgress = response.inProgress
            completed = response.completed
            lastError = nil
        } catch {
            lastError = "Couldn't refresh games."
        }
    }

    func create(
        difficulty: Difficulty,
        turnDurationSeconds: Int,
        competitiveMode: Bool,
        invitedUserIDs: [String]?,
        groupID: String?
    ) async throws -> MultiplayerCreateResponse {
        guard let token = auth.token else { throw APIError.unknown }
        let response = try await client.createMultiplayerGame(
            token: token,
            difficulty: difficulty,
            turnDurationSeconds: turnDurationSeconds,
            competitiveMode: competitiveMode,
            invitedUserIDs: invitedUserIDs,
            groupID: groupID
        )
        await refresh()
        return response
    }

    func detail(gameID: String) async throws -> MultiplayerGameDetail {
        guard let token = auth.token else { throw APIError.unknown }
        return try await client.multiplayerGame(token: token, gameID: gameID)
    }

    func join(gameID: String, inviteCode: String?) async throws -> MultiplayerGame {
        guard let token = auth.token else { throw APIError.unknown }
        let game = try await client.joinMultiplayerGame(
            token: token, gameID: gameID, inviteCode: inviteCode
        )
        await refresh()
        return game
    }

    /// Join via just an invite code (universal-link entry point — the URL
    /// carries only the 6-char code, not the game ID).
    func joinByCode(_ code: String) async throws -> MultiplayerGame {
        guard let token = auth.token else { throw APIError.unknown }
        let game = try await client.joinMultiplayerByCode(token: token, inviteCode: code)
        await refresh()
        return game
    }

    func decline(gameID: String) async throws {
        guard let token = auth.token else { throw APIError.unknown }
        try await client.declineMultiplayerGame(token: token, gameID: gameID)
        await refresh()
    }

    func leave(gameID: String) async throws {
        guard let token = auth.token else { throw APIError.unknown }
        try await client.leaveMultiplayerGame(token: token, gameID: gameID)
        await refresh()
    }

    func start(gameID: String) async throws -> MultiplayerGame {
        guard let token = auth.token else { throw APIError.unknown }
        let game = try await client.startMultiplayerGame(token: token, gameID: gameID)
        await refresh()
        return game
    }

    func postMove(gameID: String, row: Int, col: Int, value: Int) async throws -> MultiplayerMoveResponse {
        guard let token = auth.token else { throw APIError.unknown }
        let response = try await client.postMultiplayerMove(
            token: token, gameID: gameID,
            row: row, col: col, value: value,
            idempotencyKey: UUID().uuidString
        )
        await refresh()
        return response
    }

    func clear() {
        inProgress = []
        completed = []
    }
}
