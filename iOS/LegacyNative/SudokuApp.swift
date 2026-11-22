//
//  SudokuApp.swift
//  Sudoku
//

import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let openMultiplayerGame = Notification.Name("openMultiplayerGame")
}

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
final class SudokuAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private weak var auth: AuthStore?
    private let client = APIClient()

    func bind(auth: AuthStore) {
        self.auth = auth
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        if let gameID = info["game_id"] as? String {
            NotificationCenter.default.post(
                name: .openMultiplayerGame,
                object: nil,
                userInfo: ["game_id": gameID]
            )
        }
        completionHandler()
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
