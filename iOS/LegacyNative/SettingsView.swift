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
    @AppStorage("sudoku.sound_effects") private var soundEffectsEnabled: Bool = true
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groups: GroupsStore
    @Environment(\.dismiss) private var dismiss

    @State private var showingSignIn = false
    @State private var showingAddGroup = false
    @State private var addGroupInitialMode: GroupOnboardingView.Mode = .picker
    @State private var leavingGroup: APIGroup?
    @State private var confirmingDeleteAccount = false
    @State private var deleteAccountError: String?
    @State private var isDeletingAccount = false

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                groupsSection

                Section("Highlighting") {
                    Toggle("Highlight mistakes", isOn: $game.highlightMistakes)
                    Toggle("Highlight rules", isOn: $game.highlightConstraints)
                }

                Section("Sounds") {
                    Toggle("Sound effects", isOn: $soundEffectsEnabled)
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
                        onSkip: { showingAddGroup = false },
                        initialMode: addGroupInitialMode
                    )
                    .padding()
                    .navigationTitle(addGroupSheetTitle)
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
            .alert("Delete your account?", isPresented: $confirmingDeleteAccount) {
                Button("Cancel", role: .cancel) { }
                Button("Delete", role: .destructive) {
                    Task { await performDeleteAccount() }
                }
            } message: {
                Text("This permanently erases your account, daily history, group memberships, and any games you've played. This can't be undone.")
            }
        }
    }

    private func performDeleteAccount() async {
        isDeletingAccount = true
        deleteAccountError = nil
        defer { isDeletingAccount = false }
        do {
            try await auth.deleteAccount()
            groups.clear()
            dismiss()
        } catch APIError.offline {
            deleteAccountError = "You're offline. Try again when you're back online."
        } catch {
            deleteAccountError = "Couldn't delete your account. Please try again or contact support."
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
                Button(role: .destructive) {
                    confirmingDeleteAccount = true
                } label: {
                    if isDeletingAccount {
                        HStack {
                            ProgressView()
                            Text("Deleting…")
                        }
                    } else {
                        Text("Delete account")
                    }
                }
                .disabled(isDeletingAccount)
                if let deleteAccountError {
                    Text(deleteAccountError)
                        .font(.caption)
                        .foregroundStyle(.red)
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
                    NavigationLink {
                        GroupMembersView(group: item.group)
                    } label: {
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
                }
                Button {
                    addGroupInitialMode = .creating
                    showingAddGroup = true
                } label: {
                    Label("Create a group", systemImage: "plus.circle")
                }
                Button {
                    addGroupInitialMode = .joining
                    showingAddGroup = true
                } label: {
                    Label("Join with a code", systemImage: "qrcode")
                }
            }
        }
    }

    private var addGroupSheetTitle: String {
        switch addGroupInitialMode {
        case .creating: return "Create a group"
        case .joining:  return "Join with a code"
        case .picker:   return "Add a group"
        }
    }

    private var leaveAlertBinding: Binding<Bool> {
        Binding(
            get: { leavingGroup != nil },
            set: { if !$0 { leavingGroup = nil } }
        )
    }
}
