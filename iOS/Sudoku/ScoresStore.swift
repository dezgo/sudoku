//
//  ScoresStore.swift
//  Sudoku
//
//  Owns score submission for daily solves. POSTs immediately when authenticated;
//  queues to UserDefaults `sudoku.pending_scores.v1` when offline or signed-out
//  so they get flushed on next launch / after sign-in. Composite PK on the
//  server makes retry safe.
//
//  Spec §17.4. Offline-fallback puzzles are NOT submitted (caller's job to
//  filter — see ContentView's solve handler).
//

import Foundation

@MainActor
final class ScoresStore: ObservableObject {
    struct Pending: Codable, Equatable {
        let puzzleID: Int
        let elapsedSeconds: Int
        let mistakes: Int
        let completedAt: Date
        // Assist markers — optional for backwards compat with queued items
        // from earlier app versions that didn't track them.
        var hintsUsed: Int? = nil
        var pencilAssistsUsed: Int? = nil
        var highlightMistakesWasOn: Bool? = nil
        var highlightRulesWasOn: Bool? = nil
    }

    /// Last successful submission's rank, used by the fanfare to show
    /// "Rank #3 in <group>". Cleared on each new submit.
    @Published private(set) var lastRank: Int?
    @Published private(set) var pendingCount: Int = 0

    private let client: APIClient
    private let auth: AuthStore
    private let queueKey = "sudoku.pending_scores.v1"

    init(client: APIClient, auth: AuthStore) {
        self.client = client
        self.auth = auth
        self.pendingCount = Self.loadQueue().count
    }

    /// Submit a daily-puzzle solve. Returns the rank if posted now, nil if
    /// queued for later (offline, or not signed in). Caller must have already
    /// verified the puzzle is a real daily and not an offline-fallback.
    @discardableResult
    func submit(
        puzzleID: Int,
        elapsedSeconds: Int,
        mistakes: Int,
        hintsUsed: Int,
        pencilAssistsUsed: Int,
        highlightMistakesWasOn: Bool,
        highlightRulesWasOn: Bool
    ) async -> Int? {
        let pending = Pending(
            puzzleID: puzzleID,
            elapsedSeconds: elapsedSeconds,
            mistakes: mistakes,
            completedAt: Date(),
            hintsUsed: hintsUsed,
            pencilAssistsUsed: pencilAssistsUsed,
            highlightMistakesWasOn: highlightMistakesWasOn,
            highlightRulesWasOn: highlightRulesWasOn
        )
        guard let token = auth.token else {
            enqueue(pending)
            return nil
        }
        do {
            let rank = try await client.postScore(
                token: token,
                puzzleID: puzzleID,
                elapsedSeconds: elapsedSeconds,
                mistakes: mistakes,
                hintsUsed: hintsUsed,
                pencilAssistsUsed: pencilAssistsUsed,
                highlightMistakesWasOn: highlightMistakesWasOn,
                highlightRulesWasOn: highlightRulesWasOn
            )
            lastRank = rank
            return rank
        } catch {
            enqueue(pending)
            return nil
        }
    }

    /// Drain the offline queue. Best-effort: anything that still fails stays
    /// queued for next time. No-op if not signed in.
    func flushPending() async {
        guard let token = auth.token else { return }
        var queue = Self.loadQueue()
        guard !queue.isEmpty else { return }

        var remaining: [Pending] = []
        for item in queue {
            do {
                _ = try await client.postScore(
                    token: token,
                    puzzleID: item.puzzleID,
                    elapsedSeconds: item.elapsedSeconds,
                    mistakes: item.mistakes,
                    hintsUsed: item.hintsUsed ?? 0,
                    pencilAssistsUsed: item.pencilAssistsUsed ?? 0,
                    highlightMistakesWasOn: item.highlightMistakesWasOn ?? false,
                    highlightRulesWasOn: item.highlightRulesWasOn ?? false
                )
                // Posted (or 4xx — drop it; can't recover).
            } catch APIError.offline {
                remaining.append(item)
            } catch APIError.http(let status, _) where (500..<600).contains(status) {
                remaining.append(item)
            } catch APIError.unknown {
                remaining.append(item)
            } catch {
                // 4xx: drop. Bad puzzle_id, expired token, etc. — no point retrying.
            }
        }
        queue = remaining
        Self.saveQueue(queue)
        pendingCount = queue.count
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: queueKey)
        pendingCount = 0
        lastRank = nil
    }

    /// Fetch the per-group leaderboard for a given puzzle. Throws on auth /
    /// network / membership failures so the view can render an appropriate
    /// empty state.
    func fetchLeaderboard(groupID: String, puzzleID: Int) async throws -> [LeaderboardEntry] {
        guard let token = auth.token else { throw APIError.http(401, "unauthenticated") }
        return try await client.groupScores(token: token, groupID: groupID, puzzleID: puzzleID)
    }

    // MARK: - Queue persistence

    private func enqueue(_ p: Pending) {
        var queue = Self.loadQueue()
        queue.append(p)
        Self.saveQueue(queue)
        pendingCount = queue.count
    }

    private static let queueKeyName = "sudoku.pending_scores.v1"

    private static func loadQueue() -> [Pending] {
        guard let data = UserDefaults.standard.data(forKey: queueKeyName) else { return [] }
        return (try? JSONDecoder().decode([Pending].self, from: data)) ?? []
    }

    private static func saveQueue(_ items: [Pending]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: queueKeyName)
    }
}
