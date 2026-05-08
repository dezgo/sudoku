//
//  MultiplayerCreateView.swift
//  Sudoku
//
//  New-game flow for multiplayer. Pick difficulty, turn duration,
//  competitive mode, and who to invite. On success the freshly-created game
//  goes into 'pending' status — host then starts it from the game view
//  once enough players have joined.
//

import SwiftUI

struct MultiplayerCreateView: View {
    @EnvironmentObject private var store: MultiplayerStore
    @EnvironmentObject private var groupsStore: GroupsStore
    @Environment(\.dismiss) private var dismiss

    @State private var difficulty: Difficulty = .medium
    @State private var turnDuration: TurnDurationOption = .twentyFourHours
    @State private var competitiveMode = false
    @State private var selectedGroupID: String?
    @State private var isBusy = false
    @State private var errorText: String?
    @State private var createdInviteCode: String?
    @State private var createdGameID: String?

    var body: some View {
        NavigationStack {
            Form {
                if let inviteCode = createdInviteCode {
                    inviteCodeSection(code: inviteCode)
                } else {
                    Section("Difficulty") {
                        Picker("Difficulty", selection: $difficulty) {
                            ForEach(Difficulty.allCases) { d in
                                Text(d.label).tag(d)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    Section("Turn duration") {
                        Picker("Each turn", selection: $turnDuration) {
                            ForEach(TurnDurationOption.allCases) { opt in
                                Text(opt.label).tag(opt)
                            }
                        }
                    }

                    Section("Competitive mode") {
                        Toggle("Single-winner ranking", isOn: $competitiveMode)
                        Text(competitiveMode
                             ? "A winner is crowned by score (correct − 2 × mistakes)."
                             : "Stats salad — everyone earns a badge category.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if !groupsStore.groups.isEmpty {
                        Section("Invite a group (optional)") {
                            Picker("Group", selection: $selectedGroupID) {
                                Text("No group").tag(String?.none)
                                ForEach(groupsStore.groups, id: \.group.id) { item in
                                    Text(item.group.name).tag(String?.some(item.group.id))
                                }
                            }
                            Text("Everyone in the group is invited automatically. They'll get a push when the game's ready.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let errorText {
                        Section {
                            Text(errorText)
                                .foregroundStyle(.red)
                                .font(.footnote)
                        }
                    }

                    Section {
                        Button {
                            Task { await create() }
                        } label: {
                            HStack {
                                Spacer()
                                if isBusy {
                                    ProgressView()
                                } else {
                                    Text("Create game").fontWeight(.semibold)
                                }
                                Spacer()
                            }
                        }
                        .disabled(isBusy)
                    }
                }
            }
            .navigationTitle("New game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func inviteCodeSection(code: String) -> some View {
        Section("Game ready") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Invite code")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(code)
                    .font(.system(size: 36, weight: .bold, design: .monospaced))
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Text("Anyone can join — works on iPhone or Android, and the link guides friends to the right app store if they don't have it yet. Invited group members already got a push.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ShareLink(item: shareLink(for: code)) {
                    Label("Share invite link", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 8)
        }
    }

    private func shareLink(for code: String) -> String {
        "Join my sudoku game: https://sudoku.appfoundry.cc/m/\(code)"
    }

    private func create() async {
        isBusy = true
        errorText = nil
        defer { isBusy = false }
        do {
            let response = try await store.create(
                difficulty: difficulty,
                turnDurationSeconds: turnDuration.seconds,
                competitiveMode: competitiveMode,
                invitedUserIDs: nil,
                groupID: selectedGroupID
            )
            createdInviteCode = response.inviteCode
            createdGameID = response.game.id
        } catch APIError.offline {
            errorText = "You're offline."
        } catch APIError.http(let status, _) where status == 409 {
            errorText = "You've hit the limit of 10 active games. Finish one first."
        } catch {
            errorText = "Couldn't create the game. Try again."
        }
    }
}

enum TurnDurationOption: Int, CaseIterable, Identifiable {
    case oneHour, sixHours, twentyFourHours, unlimited

    var id: Int { rawValue }

    var seconds: Int {
        switch self {
        case .oneHour: return 3600
        case .sixHours: return 21600
        case .twentyFourHours: return 86400
        case .unlimited: return 0
        }
    }

    var label: String {
        switch self {
        case .oneHour: return "1 hour"
        case .sixHours: return "6 hours"
        case .twentyFourHours: return "24 hours"
        case .unlimited: return "No limit"
        }
    }
}
