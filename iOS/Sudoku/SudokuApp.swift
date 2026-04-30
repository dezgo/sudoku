//
//  SudokuApp.swift
//  Sudoku
//

import SwiftUI

@main
struct SudokuApp: App {
    @StateObject private var auth: AuthStore
    @StateObject private var groupsStore: GroupsStore
    @StateObject private var dailyStore: DailyPuzzleStore
    @StateObject private var scoresStore: ScoresStore

    init() {
        let client = APIClient()
        let auth = AuthStore(client: client)
        let groups = GroupsStore(client: client, auth: auth)
        let daily = DailyPuzzleStore(
            client: client,
            fallbackProvider: GeneratedPuzzleProvider()
        )
        let scores = ScoresStore(client: client, auth: auth)
        _auth = StateObject(wrappedValue: auth)
        _groupsStore = StateObject(wrappedValue: groups)
        _dailyStore = StateObject(wrappedValue: daily)
        _scoresStore = StateObject(wrappedValue: scores)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(groupsStore)
                .environmentObject(dailyStore)
                .environmentObject(scoresStore)
        }
    }
}
