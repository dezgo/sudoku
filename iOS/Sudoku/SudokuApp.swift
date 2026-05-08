//
//  SudokuApp.swift
//  Sudoku
//

import SwiftUI
import UIKit

@main
struct SudokuApp: App {
    @StateObject private var auth: AuthStore
    @StateObject private var groupsStore: GroupsStore
    @StateObject private var dailyStore: DailyPuzzleStore
    @StateObject private var scoresStore: ScoresStore
    @StateObject private var multiplayerStore: MultiplayerStore
    @UIApplicationDelegateAdaptor(SudokuAppDelegate.self) private var appDelegate

    init() {
        let client = APIClient()
        let auth = AuthStore(client: client)
        let groups = GroupsStore(client: client, auth: auth)
        let daily = DailyPuzzleStore(
            client: client,
            fallbackProvider: GeneratedPuzzleProvider()
        )
        let scores = ScoresStore(client: client, auth: auth)
        let multiplayer = MultiplayerStore(client: client, auth: auth)
        _auth = StateObject(wrappedValue: auth)
        _groupsStore = StateObject(wrappedValue: groups)
        _dailyStore = StateObject(wrappedValue: daily)
        _scoresStore = StateObject(wrappedValue: scores)
        _multiplayerStore = StateObject(wrappedValue: multiplayer)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(groupsStore)
                .environmentObject(dailyStore)
                .environmentObject(scoresStore)
                .environmentObject(multiplayerStore)
                .onAppear {
                    appDelegate.bind(auth: auth)
                }
        }
    }
}

/// Bridges UIKit's APNs callbacks into our backend. APNs hands us a device
/// token via `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`;
/// we hex-encode it and POST to `/me/push_token`. Kept tiny — no other UIKit
/// surface needed.
final class SudokuAppDelegate: NSObject, UIApplicationDelegate {
    private weak var auth: AuthStore?
    private let client = APIClient()

    func bind(auth: AuthStore) {
        self.auth = auth
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Request notification permission lazily — the user signs in first,
        // then we ask for permission once we know they have an account that
        // can receive pushes. See AuthStore for that hook.
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { [weak self] in
            guard let auth = await self?.auth, let bearer = auth.token else { return }
            try? await self?.client.registerPushToken(token: bearer, platform: "ios", pushToken: token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Non-fatal — user just won't get pushes for now.
        print("APNs registration failed: \(error)")
    }
}
