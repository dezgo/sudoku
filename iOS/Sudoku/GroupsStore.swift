//
//  GroupsStore.swift
//  Sudoku
//
//  Cached list of the signed-in user's groups + create/join/leave operations.
//  Backed by UserDefaults `sudoku.groups.v1` so the home/leaderboard screens
//  can render instantly on launch before the network refresh completes.
//

import Foundation

@MainActor
final class GroupsStore: ObservableObject {
    @Published private(set) var groups: [GroupListItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var lastError: String?

    private let client: APIClient
    private let auth: AuthStore
    private let cacheKey = "sudoku.groups.v1"

    init(client: APIClient, auth: AuthStore) {
        self.client = client
        self.auth = auth
        self.groups = Self.loadCache()
    }

    func refresh() async {
        guard let token = auth.token else {
            groups = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await client.meGroups(token: token)
            groups = fetched
            Self.saveCache(fetched)
        } catch {
            lastError = "Couldn't refresh groups."
        }
    }

    func create(name: String) async throws -> CreateGroupResponse {
        guard let token = auth.token else { throw APIError.unknown }
        let response = try await client.createGroup(token: token, name: name)
        await refresh()
        return response
    }

    func join(inviteCode: String) async throws -> APIGroup {
        guard let token = auth.token else { throw APIError.unknown }
        let group = try await client.joinGroup(token: token, inviteCode: inviteCode)
        await refresh()
        return group
    }

    func leave(groupID: String) async throws {
        guard let token = auth.token else { throw APIError.unknown }
        try await client.leaveGroup(token: token, groupID: groupID)
        await refresh()
    }

    func clear() {
        groups = []
        UserDefaults.standard.removeObject(forKey: cacheKey)
    }

    // MARK: - Cache

    private static let cacheKeyName = "sudoku.groups.v1"

    private static func loadCache() -> [GroupListItem] {
        guard let data = UserDefaults.standard.data(forKey: cacheKeyName) else { return [] }
        return (try? JSONDecoder().decode([GroupListItem].self, from: data)) ?? []
    }

    private static func saveCache(_ groups: [GroupListItem]) {
        guard let data = try? JSONEncoder().encode(groups) else { return }
        UserDefaults.standard.set(data, forKey: cacheKeyName)
    }
}
