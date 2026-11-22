//
//  ShellApp.swift
//  Sudoku
//
//  Since 2.0.0 the App Store app is a shell around https://sudokucrew.com/play
//  (the old native app lives in ../LegacyNative, not built). Every web deploy
//  reaches iPhone players without an App Store release.
//
//  What the shell adds over the website:
//   - First launch after updating from the native app hands its saved sign-in
//     to the web app (in the #fragment, never sent to a server), then deletes
//     it, so nobody is signed out by the update.
//   - Push notifications: the web app tells the shell who's signed in (via the
//     `sudokuShell` message handler); the shell registers for APNs and sends
//     the device token to /v1/me/push_token, so multiplayer turn alerts work.
//     Tapping one opens that game.
//   - Links to sudokucrew.com (and old sudoku.appfoundry.cc/m/ invites) open in the app.
//

import SwiftUI
import UIKit
import UserNotifications
import WebKit

let webHome = URL(string: "https://sudokucrew.com/play/")!
let apiBase = URL(string: "https://sudokucrew.com/v1/")!

@main
struct SudokuShellApp: App {
    @UIApplicationDelegateAdaptor(ShellAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            WebShellView(model: appDelegate.model)
                .ignoresSafeArea()
                .onOpenURL { appDelegate.model.open(incoming: $0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { appDelegate.model.open(incoming: url) }
                }
        }
    }
}

// MARK: - Model: the one web view, plus the push-token plumbing

@MainActor
final class ShellModel: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    private var bearer: String?
    private var deviceToken: String?
    private var registeredPair: String?

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.limitsNavigationsToAppBoundDomains = true
        config.applicationNameForUserAgent = "SudokuCrewApp/ios"
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(WeakHandler(self), name: "sudokuShell")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .systemGroupedBackground
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.load(URLRequest(url: launchURL()))
    }

    /// Home, plus the old native app's sign-in on the first launch after updating.
    private func launchURL() -> URL {
        guard let token = Keychain.getString(account: "api-token") else { return webHome }
        Keychain.setString(nil, account: "api-token")
        var c = URLComponents(url: webHome, resolvingAgainstBaseURL: false)!
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        c.percentEncodedFragment = "signin=" + (token.addingPercentEncoding(withAllowedCharacters: allowed) ?? token)
        return c.url ?? webHome
    }

    /// A universal link or notification: show the matching page in the app.
    func open(incoming url: URL) {
        var target = url
        if url.host?.lowercased() == "sudoku.appfoundry.cc", url.path.hasPrefix("/m/") {
            let code = url.path.dropFirst(3).replacingOccurrences(of: "/", with: "")
            target = URL(string: "https://sudokucrew.com/play/?join=\(code)")!
        } else if url.host?.lowercased() != "sudokucrew.com" {
            return
        }
        webView.load(URLRequest(url: target))
    }

    func openGame(id: String) {
        guard let q = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return }
        webView.load(URLRequest(url: URL(string: "https://sudokucrew.com/play/?game=\(q)")!))
    }

    // Messages from the web app: {type: "signedIn", token} / {type: "signedOut"}.
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "signedIn":
            guard let token = body["token"] as? String, !token.isEmpty else { return }
            let changed = bearer != token
            bearer = token
            if changed { askForNotifications() }
            registerIfReady()
        case "signedOut":
            if let bearer, let deviceToken { Task { await Self.send("DELETE", bearer: bearer, pushToken: deviceToken) } }
            bearer = nil
            registeredPair = nil
        default:
            break
        }
    }

    private func askForNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(deviceToken: String) {
        self.deviceToken = deviceToken
        registerIfReady()
    }

    private func registerIfReady() {
        guard let bearer, let deviceToken else { return }
        let pair = bearer + deviceToken
        guard pair != registeredPair else { return }
        registeredPair = pair
        Task { await Self.send("POST", bearer: bearer, pushToken: deviceToken) }
    }

    private static func send(_ method: String, bearer: String, pushToken: String) async {
        var req = URLRequest(url: apiBase.appendingPathComponent("me/push_token"))
        req.httpMethod = method
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["platform": "ios", "token": pushToken])
        _ = try? await URLSession.shared.data(for: req)
    }

    // Anything outside sudokucrew.com (mail links, store links, other sites) opens outside the app.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let host = url.host?.lowercased()
        if (url.scheme == "https" && host == "sudokucrew.com") || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            return decisionHandler(.allow)
        }
        if host == "sudoku.appfoundry.cc" {
            open(incoming: url)
            return decisionHandler(.cancel)
        }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    // target=_blank / window.open → same rule.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host?.lowercased() == "sudokucrew.com" { webView.load(URLRequest(url: url)) }
            else { UIApplication.shared.open(url) }
        }
        return nil
    }

    // If iOS throws the page away in the background, bring it back.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // Offline on launch: keep retrying quietly rather than showing a blank page.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak webView] in
            if webView?.url == nil { webView?.load(URLRequest(url: webHome)) }
        }
    }
}

/// WKUserContentController holds its handler strongly; this breaks the cycle.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(c, didReceive: message)
    }
}

struct WebShellView: UIViewRepresentable {
    let model: ShellModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - App delegate: APNs callbacks

final class ShellAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor lazy var model = ShellModel()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in model.didRegister(deviceToken: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error)")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let gameID = response.notification.request.content.userInfo["game_id"] as? String {
            Task { @MainActor in model.openGame(id: gameID) }
        }
        completionHandler()
    }
}
