//
//  LeaderboardView.swift
//  Sudoku
//
//  Per-group leaderboard for a given daily puzzle. Top 10 + the user's own
//  row pinned below if they're outside the top 10. Group picker at the top
//  when the user is in 2+ groups.
//
//  Spec §17.4.
//

import SwiftUI

private let TOP_N = 10

struct LeaderboardView: View {
    let puzzleID: Int
    let puzzleLabel: String

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groupsStore: GroupsStore
    @EnvironmentObject private var scoresStore: ScoresStore

    @State private var selectedGroupID: String?
    @State private var rows: [LeaderboardEntry] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Leaderboard")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
                .task {
                    if selectedGroupID == nil {
                        selectedGroupID = groupsStore.groups.first?.group.id
                    }
                    await loadIfNeeded()
                }
                .onChange(of: selectedGroupID) { _, _ in
                    Task { await loadIfNeeded() }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !auth.isSignedIn {
            signedOutEmpty
        } else if groupsStore.groups.isEmpty {
            noGroupsEmpty
        } else {
            VStack(spacing: 0) {
                if groupsStore.groups.count >= 2 {
                    Picker("Group", selection: Binding(
                        get: { selectedGroupID ?? groupsStore.groups.first?.group.id ?? "" },
                        set: { selectedGroupID = $0 }
                    )) {
                        ForEach(groupsStore.groups, id: \.group.id) { item in
                            Text(item.group.name).tag(item.group.id)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding()
                }

                Text(puzzleLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 8)

                listBody
            }
        }
    }

    @ViewBuilder
    private var listBody: some View {
        if isLoading && rows.isEmpty {
            ProgressView().padding()
            Spacer()
        } else if let err = errorMessage, rows.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title2)
                    .foregroundStyle(.orange)
                Text(err).foregroundStyle(.secondary)
                Button("Try again") { Task { await loadIfNeeded(force: true) } }
            }
            .padding()
            Spacer()
        } else if rows.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "trophy")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("No one's solved today's daily yet.")
                    .foregroundStyle(.secondary)
                Text("Be the first.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            Spacer()
        } else {
            List {
                let top = Array(rows.prefix(TOP_N))
                ForEach(top) { entry in
                    row(entry, highlight: isMe(entry))
                }
                if let mine = myRow, mine.rank > TOP_N {
                    Section {
                        row(mine, highlight: true)
                    } header: {
                        Text("Your rank")
                    }
                }
            }
            .listStyle(.plain)
        }
    }

    private var signedOutEmpty: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Sign in to see leaderboards.")
                .font(.headline)
            Text("You'll be able to compare your time with friends in your groups.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding()
    }

    private var noGroupsEmpty: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.3")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Join a group to see leaderboards.")
                .font(.headline)
            Text("Create one and share the invite code, or join with a code from a friend. Settings → Groups.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding()
    }

    private func row(_ entry: LeaderboardEntry, highlight: Bool) -> some View {
        HStack(spacing: 12) {
            Text("\(entry.rank)")
                .font(.headline.monospacedDigit())
                .foregroundStyle(highlight ? Color.accentColor : .primary)
                .frame(width: 32, alignment: .trailing)
            Text(entry.displayName ?? "—")
                .font(.body)
                .fontWeight(highlight ? .semibold : .regular)
            Spacer()
            Text(formatTime(entry.elapsedSeconds))
                .font(.body.monospacedDigit())
                .foregroundStyle(highlight ? Color.accentColor : .primary)
        }
        .padding(.vertical, 2)
    }

    private var myRow: LeaderboardEntry? {
        guard let me = auth.user else { return nil }
        return rows.first { $0.displayName == me.displayName && me.displayName != nil }
    }

    private func isMe(_ entry: LeaderboardEntry) -> Bool {
        guard let me = auth.user, let myName = me.displayName else { return false }
        return entry.displayName == myName
    }

    private func loadIfNeeded(force: Bool = false) async {
        guard auth.isSignedIn else { return }
        guard let groupID = selectedGroupID ?? groupsStore.groups.first?.group.id else { return }
        if !force && isLoading { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            rows = try await scoresStore.fetchLeaderboard(groupID: groupID, puzzleID: puzzleID)
        } catch APIError.offline {
            errorMessage = "You're offline."
        } catch {
            errorMessage = "Couldn't load leaderboard."
        }
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
