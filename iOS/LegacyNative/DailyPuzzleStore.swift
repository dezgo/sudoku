//
//  DailyPuzzleStore.swift
//  Sudoku
//
//  Resolves "today's daily" by fetching from the server and caching today +
//  tomorrow locally. If the network is unreachable on first launch, falls
//  back to the local generator (SPEC §7) — flagged as offline so callers can
//  later refuse to post a score against a non-canonical puzzle.
//

import Foundation

@MainActor
final class DailyPuzzleStore: ObservableObject {
    struct Cached: Codable {
        var today: Puzzle
        var tomorrow: Puzzle
        var fetchedAt: Date
    }

    @Published private(set) var today: Puzzle?
    @Published private(set) var tomorrow: Puzzle?
    @Published private(set) var todayIsOffline = false

    private let client: APIClient
    private let fallbackProvider: PuzzleProvider
    private let cacheKey = "sudoku.daily_cache.v1"

    init(client: APIClient, fallbackProvider: PuzzleProvider) {
        self.client = client
        self.fallbackProvider = fallbackProvider
        if let cached = Self.loadCache() {
            self.today = cached.today
            self.tomorrow = cached.tomorrow
        }
    }

    /// Best-effort background refresh. Called on launch and after foreground.
    /// Failure is silent — if we can't reach the server, last cached value
    /// stays in place; if there's no cache either, `ensureToday` will use
    /// the offline-fallback generator.
    func refresh() async {
        do {
            let resp = try await client.dailyToday()
            let t = resp.today.toPuzzle()
            let tom = resp.tomorrow.toPuzzle()
            today = t
            tomorrow = tom
            todayIsOffline = false
            Self.saveCache(Cached(today: t, tomorrow: tom, fetchedAt: Date()))
        } catch {
            // Keep whatever's already in `today`.
        }
    }

    /// Returns today's daily, fetching/falling back as needed. The Bool is
    /// true when the puzzle came from the offline-fallback generator (so the
    /// caller knows not to post a score against it later).
    func ensureToday() async -> (Puzzle, Bool) {
        if let cached = today, isCachedTodayStillToday(cached) {
            return (cached, todayIsOffline)
        }
        await refresh()
        if let cached = today, isCachedTodayStillToday(cached) {
            return (cached, todayIsOffline)
        }
        // Last resort: the local generator. Marks the puzzle offline.
        let fallback = fallbackProvider.dailyPuzzle(for: Date())
        today = fallback
        todayIsOffline = true
        return (fallback, true)
    }

    /// True when the cached `today` matches the device's current calendar
    /// date (used to invalidate yesterday's value if the user kept the app
    /// open across midnight).
    private func isCachedTodayStillToday(_ cached: Puzzle) -> Bool {
        guard cached.isDaily else { return false }
        let localTodayID = DailyPuzzle.id(for: Date())
        // Allow a one-day skew because the server date is in Sydney while the
        // device may be in a different timezone — the server's "today" can
        // legitimately differ from the device's by ±1 day.
        return abs(cached.id - localTodayID) <= 1
    }

    // MARK: - Cache

    private static let cacheKeyName = "sudoku.daily_cache.v1"

    private static func loadCache() -> Cached? {
        guard let data = UserDefaults.standard.data(forKey: cacheKeyName) else { return nil }
        return try? JSONDecoder().decode(Cached.self, from: data)
    }

    private static func saveCache(_ cached: Cached) {
        guard let data = try? JSONEncoder().encode(cached) else { return }
        UserDefaults.standard.set(data, forKey: cacheKeyName)
    }
}
