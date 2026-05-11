//
//  AuthStore.swift
//  Sudoku
//
//  Authoritative client-side state for the signed-in user. Owns the bearer
//  token (Keychain-backed) and the cached user identity (UserDefaults). All
//  authenticated API calls funnel through here.
//

import Foundation

@MainActor
final class AuthStore: ObservableObject {
    enum SignInError: Error, Equatable {
        case invalidEmail
        case wrongCode
        case codeExpired
        case tooManyAttempts
        case offline
        case server
    }

    @Published private(set) var user: APIUser?
    @Published private(set) var token: String?

    private let client: APIClient
    private let userKey = "sudoku.identity.v1"
    private let tokenAccount = "api-token"

    var isSignedIn: Bool { token != nil }
    var displayName: String? { user?.displayName }

    init(client: APIClient) {
        self.client = client
        let storedToken = Keychain.getString(account: tokenAccount)
        let storedUser = Self.loadUser()
        self.token = storedToken
        self.user = storedUser

        // Watch for auth-expired signals from APIClient. Any authed call
        // that returns 401 means our token is stale — clear local auth so
        // the UI shows the signed-out state and the user re-signs in.
        NotificationCenter.default.addObserver(
            forName: .apiUnauthorized, object: nil, queue: .main
        ) { [weak self] _ in
            self?.signOut()
        }
    }

    // MARK: - Sign-in flow

    func startSignIn(email: String) async throws {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        do {
            try await client.authStart(email: trimmed)
        } catch APIError.offline {
            throw SignInError.offline
        } catch APIError.http(400, _) {
            throw SignInError.invalidEmail
        } catch {
            throw SignInError.server
        }
    }

    func verifySignIn(email: String, code: String) async throws -> Bool {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let response: AuthVerifyResponse
        do {
            response = try await client.authVerify(email: trimmedEmail, code: trimmedCode)
        } catch APIError.offline {
            throw SignInError.offline
        } catch APIError.http(400, let detail) {
            switch detail {
            case "wrong_code":          throw SignInError.wrongCode
            case "code_expired":        throw SignInError.codeExpired
            case "too_many_attempts":   throw SignInError.tooManyAttempts
            default:                    throw SignInError.server
            }
        } catch {
            throw SignInError.server
        }

        token = response.token
        user = response.user
        Keychain.setString(response.token, account: tokenAccount)
        Self.saveUser(response.user)
        return response.needsDisplayName
    }

    func setDisplayName(_ name: String) async throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard let token else { throw SignInError.server }
        do {
            let updated = try await client.putMe(token: token, displayName: trimmed)
            user = updated
            Self.saveUser(updated)
        } catch APIError.offline {
            throw SignInError.offline
        } catch {
            throw SignInError.server
        }
    }

    func signOut() {
        token = nil
        user = nil
        Keychain.setString(nil, account: tokenAccount)
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    /// Hard-delete the account on the server, then clear all local auth.
    /// Throws on network / server failure — the caller surfaces the error
    /// so the user can retry. App Store Guideline 5.1.1(v) requires this
    /// path to be reachable in-app.
    func deleteAccount() async throws {
        guard let token else { return }
        try await client.deleteMe(token: token)
        // Successful server delete → wipe local state.
        signOut()
    }

    // MARK: - Persistence
	
    private static func loadUser() -> APIUser? {
        guard let data = UserDefaults.standard.data(forKey: "sudoku.identity.v1") else { return nil }
        return try? JSONDecoder().decode(APIUser.self, from: data)
    }

    private static func saveUser(_ user: APIUser) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: "sudoku.identity.v1")
    }
}
