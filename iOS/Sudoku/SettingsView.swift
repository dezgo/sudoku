//
//  SettingsView.swift
//  Sudoku
//

import SwiftUI

enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct SettingsView: View {
    @ObservedObject var game: SudokuGame
    @AppStorage("sudoku.appearance") private var appearance: AppearancePreference = .system
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groups: GroupsStore
    @Environment(\.dismiss) private var dismiss

    @State private var showingSignIn = false
    @State private var showingAddGroup = false
    @State private var leavingGroup: APIGroup?

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                groupsSection

                Section("Highlighting") {
                    Toggle("Highlight mistakes", isOn: $game.highlightMistakes)
                    Toggle("Highlight rules", isOn: $game.highlightConstraints)
                }

                Section("Appearance") {
                    Picker("Theme", selection: $appearance) {
                        ForEach(AppearancePreference.allCases) { p in
                            Text(p.label).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingSignIn) { SignInView() }
            .sheet(isPresented: $showingAddGroup) {
                NavigationStack {
                    GroupOnboardingView(
                        onDone: { showingAddGroup = false },
                        onSkip: { showingAddGroup = false }
                    )
                    .padding()
                    .navigationTitle("Add a group")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Cancel") { showingAddGroup = false }
                        }
                    }
                }
            }
            .alert("Leave group?", isPresented: leaveAlertBinding, presenting: leavingGroup) { group in
                Button("Leave", role: .destructive) {
                    Task { try? await groups.leave(groupID: group.id) }
                }
                Button("Cancel", role: .cancel) { }
            } message: { group in
                Text("You'll stop seeing the leaderboard for \(group.name).")
            }
        }
    }

    @ViewBuilder
    private var accountSection: some View {
        Section("Account") {
            if let name = auth.displayName {
                HStack {
                    Image(systemName: "person.crop.circle.fill")
                    Text(name)
                    Spacer()
                }
                Button(role: .destructive) {
                    auth.signOut()
                    groups.clear()
                } label: {
                    Text("Sign out")
                }
            } else if auth.isSignedIn {
                // Edge case: signed in but no display name yet. Re-open the
                // sign-in sheet so the user can set it.
                Button("Set display name") { showingSignIn = true }
            } else {
                Button {
                    showingSignIn = true
                } label: {
                    Label("Sign in", systemImage: "person.crop.circle")
                }
            }
        }
    }

    @ViewBuilder
    private var groupsSection: some View {
        if auth.isSignedIn {
            Section("Groups") {
                ForEach(groups.groups, id: \.group.id) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.group.name)
                                Text("\(item.memberCount) member\(item.memberCount == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Leave") { leavingGroup = item.group }
                                .buttonStyle(.borderless)
                                .foregroundStyle(.red)
                                .font(.footnote)
                        }
                        if let code = item.inviteCode {
                            HStack(spacing: 8) {
                                Text("Code")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(code)
                                    .font(.system(.caption, design: .monospaced))
                                Spacer()
                                ShareLink(item: "Join my Sudoku group with code: \(code)") {
                                    Image(systemName: "square.and.arrow.up")
                                        .font(.caption)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Button {
                    showingAddGroup = true
                } label: {
                    Label("Add a group", systemImage: "plus")
                }
            }
        }
    }

    private var leaveAlertBinding: Binding<Bool> {
        Binding(
            get: { leavingGroup != nil },
            set: { if !$0 { leavingGroup = nil } }
        )
    }
}
