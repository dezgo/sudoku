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

    func meGroups(token: String) async throws -> [GroupListItem] {
        try await sendJSON("me/groups", method: "GET", token: token)
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

    // MARK: - Daily

    func dailyToday() async throws -> DailyTodayResponse {
        try await sendJSON("daily/today", method: "GET")
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

    private func sendRaw(
        _ path: String,
        method: String,
        token: String?,
        body: [String: String]?
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
