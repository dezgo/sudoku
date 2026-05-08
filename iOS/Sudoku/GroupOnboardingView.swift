//
//  GroupOnboardingView.swift
//  Sudoku
//
//  Shown right after first sign-in (or any time a signed-in user has zero
//  groups). Two-button choice: create a new group, or paste an invite code.
//  Skipping is allowed — anonymous-style play continues; the user can add
//  a group later from Settings.
//

import SwiftUI

struct GroupOnboardingView: View {
    @EnvironmentObject private var groups: GroupsStore

    let onDone: () -> Void
    let onSkip: () -> Void
    let initialMode: Mode

    enum Mode: Equatable { case picker, creating, joining }

    @State private var mode: Mode

    init(onDone: @escaping () -> Void, onSkip: @escaping () -> Void, initialMode: Mode = .picker) {
        self.onDone = onDone
        self.onSkip = onSkip
        self.initialMode = initialMode
        _mode = State(initialValue: initialMode)
    }
    @State private var groupName: String = ""
    @State private var inviteCode: String = ""
    @State private var inviteCodeShown: String?  // shown after creating
    @State private var errorText: String?
    @State private var isBusy = false

    var body: some View {
        VStack(spacing: 16) {
            switch mode {
            case .picker:    pickerView
            case .creating:  createView
            case .joining:   joinView
            }
            Spacer()
        }
    }

    // MARK: - Picker

    private var pickerView: some View {
        VStack(spacing: 16) {
            Text("Groups are how you compare times with your friends and family. The same daily, separate leaderboards.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                groupName = ""
                errorText = nil
                mode = .creating
            } label: {
                Label("Create a group", systemImage: "plus.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button {
                inviteCode = ""
                errorText = nil
                mode = .joining
            } label: {
                Label("Join with a code", systemImage: "qrcode")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            Button("Skip for now", action: onSkip)
                .font(.footnote)
                .padding(.top, 8)
        }
    }

    // MARK: - Create

    private var createView: some View {
        VStack(spacing: 16) {
            if let inviteCodeShown {
                createdConfirmation(code: inviteCodeShown)
            } else {
                Text("Pick a name for your group. You can share the join code with friends after.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                TextField("e.g. The Gillett Family", text: $groupName)
                    .padding()
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                errorTextView

                Button {
                    Task { await submitCreate() }
                } label: {
                    if isBusy { ProgressView() } else { Text("Create").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(groupName.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)

                if initialMode == .picker {
                    Button("Back") { mode = .picker }
                        .font(.footnote)
                }
            }
        }
    }

    private func createdConfirmation(code: String) -> some View {
        VStack(spacing: 12) {
            Label("Group created", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.headline)

            Text("Share this code with the people you want in:")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(code)
                .font(.system(size: 36, weight: .bold, design: .monospaced))
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))

            ShareLink(item: "Join my Sudoku group with code: \(code)") {
                Label("Share invite", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            Button("Done", action: onDone)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Join

    private var joinView: some View {
        VStack(spacing: 16) {
            Text("Type the 6-character code your friend sent you.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextField("ABC23F", text: $inviteCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .padding()
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .font(.system(.title2, design: .monospaced))

            errorTextView

            Button {
                Task { await submitJoin() }
            } label: {
                if isBusy { ProgressView() } else { Text("Join").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(inviteCode.trimmingCharacters(in: .whitespaces).count != 6 || isBusy)

            if initialMode == .picker {
                Button("Back") { mode = .picker }
                    .font(.footnote)
            }
        }
    }

    // MARK: - Helpers

    private var errorTextView: some View {
        Group {
            if let errorText {
                Text(errorText)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func submitCreate() async {
        errorText = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await groups.create(name: groupName.trimmingCharacters(in: .whitespaces))
            inviteCodeShown = response.inviteCode
        } catch APIError.offline {
            errorText = "You're offline."
        } catch {
            errorText = "Couldn't create the group. Try again."
        }
    }

    private func submitJoin() async {
        errorText = nil
        isBusy = true
        defer { isBusy = false }
        let trimmed = inviteCode.trimmingCharacters(in: .whitespaces).uppercased()
        do {
            _ = try await groups.join(inviteCode: trimmed)
            onDone()
        } catch APIError.http(404, _) {
            errorText = "We don't recognise that code."
        } catch APIError.offline {
            errorText = "You're offline."
        } catch {
            errorText = "Couldn't join. Try again."
        }
    }
}
