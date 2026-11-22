//
//  GroupMembersView.swift
//  Sudoku
//

import SwiftUI

/// Shows the roster of a single group — display names of every member,
/// fetched on appear. Reachable from the Groups section of the Settings
/// sheet by tapping a group row.
struct GroupMembersView: View {
    let group: APIGroup

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groupsStore: GroupsStore
    @State private var members: [GroupMember] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private static let lastDailyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    var body: some View {
        List {
            if isLoading && members.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
                .listRowSeparator(.hidden)
            } else if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .listRowSeparator(.hidden)
            } else {
                ForEach(members, id: \.user.id) { member in
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(member.user.displayName ?? "—")
                                    .fontWeight(isMe(member.user) ? .semibold : .regular)
                                if isMe(member.user) {
                                    Text("(you)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Text(statsLine(for: member))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .navigationTitle(group.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func isMe(_ user: APIUser) -> Bool {
        guard let me = auth.user else { return false }
        return user.id == me.id
    }

    private func statsLine(for member: GroupMember) -> String {
        let n = member.dailiesCompleted
        let dailies = "\(n) dail\(n == 1 ? "y" : "ies")"
        if let ms = member.lastCompletedAt {
            let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
            return "\(dailies) · last \(Self.lastDailyFormatter.string(from: date))"
        }
        return n == 0 ? "no dailies yet" : dailies
    }

    private func load(force: Bool = false) async {
        if isLoading && !force { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            members = try await groupsStore.members(groupID: group.id)
        } catch APIError.offline {
            errorMessage = "You're offline. Pull to refresh when you're back online."
        } catch {
            errorMessage = "Couldn't load members."
        }
    }
}
