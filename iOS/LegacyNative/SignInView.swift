//
//  SignInView.swift
//  Sudoku
//
//  Multi-step sign-in sheet: email → 6-digit code → display name (new users
//  only) → create-or-join a group (users with no groups). Each step is a
//  small subview switched by a local enum.
//

import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groups: GroupsStore
    @Environment(\.dismiss) private var dismiss

    enum Step: Equatable {
        case email
        case code
        case displayName
        case groupOnboarding
    }

    @State private var step: Step = .email
    @State private var email: String = ""
    @State private var code: String = ""
    @State private var displayName: String = ""
    @State private var errorText: String?
    @State private var isBusy = false

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .email:            emailStep
                case .code:             codeStep
                case .displayName:      displayNameStep
                case .groupOnboarding:  GroupOnboardingView(
                    onDone: { dismiss() },
                    onSkip: { dismiss() }
                )
                }
            }
            .padding()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled(isBusy)
    }

    private var title: String {
        switch step {
        case .email:            return "Sign in"
        case .code:             return "Enter code"
        case .displayName:      return "Choose a name"
        case .groupOnboarding:  return "Groups"
        }
    }

    // MARK: - Email step

    private var emailStep: some View {
        VStack(spacing: 16) {
            Text("We'll send you a 6-digit code.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextField("you@example.com", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            errorTextView

            Button {
                Task { await submitEmail() }
            } label: {
                if isBusy { ProgressView() } else { Text("Send code").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(email.isEmpty || isBusy)

            Spacer()
        }
    }

    // MARK: - Code step

    private var codeStep: some View {
        VStack(spacing: 16) {
            Text("Code sent to \(email).")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextField("123456", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .padding()
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .font(.system(.title2, design: .monospaced))

            errorTextView

            Button {
                Task { await submitCode() }
            } label: {
                if isBusy { ProgressView() } else { Text("Verify").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(code.count != 6 || isBusy)

            Button("Use a different email") {
                code = ""
                errorText = nil
                step = .email
            }
            .font(.footnote)

            Spacer()
        }
    }

    // MARK: - Display name step

    private var displayNameStep: some View {
        VStack(spacing: 16) {
            Text("This is what shows up on the leaderboard.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextField("Display name", text: $displayName)
                .padding()
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .submitLabel(.done)

            errorTextView

            Button {
                Task { await submitDisplayName() }
            } label: {
                if isBusy { ProgressView() } else { Text("Continue").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(displayName.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)

            Spacer()
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

    private func submitEmail() async {
        errorText = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await auth.startSignIn(email: email)
            step = .code
        } catch AuthStore.SignInError.invalidEmail {
            errorText = "That doesn't look like a valid email."
        } catch AuthStore.SignInError.offline {
            errorText = "You're offline. Try again when you have a connection."
        } catch {
            errorText = "Something went wrong. Try again."
        }
    }

    private func submitCode() async {
        errorText = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let needsName = try await auth.verifySignIn(email: email, code: code)
            if needsName {
                step = .displayName
            } else {
                await advanceFromVerified()
            }
        } catch AuthStore.SignInError.wrongCode {
            errorText = "That code didn't match."
        } catch AuthStore.SignInError.codeExpired {
            errorText = "Code expired — request a new one."
        } catch AuthStore.SignInError.tooManyAttempts {
            errorText = "Too many tries. Request a new code."
        } catch AuthStore.SignInError.offline {
            errorText = "You're offline."
        } catch {
            errorText = "Couldn't verify the code. Try again."
        }
    }

    private func submitDisplayName() async {
        errorText = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await auth.setDisplayName(displayName)
            await advanceFromVerified()
        } catch AuthStore.SignInError.offline {
            errorText = "You're offline."
        } catch {
            errorText = "Couldn't save your name. Try again."
        }
    }

    /// After successful verify (and display-name set, if needed): refresh
    /// the user's groups; if they have none, push them into the group
    /// onboarding step. Otherwise the sign-in is done.
    private func advanceFromVerified() async {
        await groups.refresh()
        if groups.groups.isEmpty {
            step = .groupOnboarding
        } else {
            dismiss()
        }
    }
}
