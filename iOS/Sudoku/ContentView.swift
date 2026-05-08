//
//  ContentView.swift
//  Sudoku
//

import SwiftUI
import UIKit
import UserNotifications

struct ContentView: View {
    enum Phase {
        case home
        case playing
    }

    @AppStorage("sudoku.difficulty") private var difficulty: Difficulty = .medium
    @AppStorage("sudoku.appearance") private var appearance: AppearancePreference = .system
    @Environment(\.scenePhase) private var scenePhase

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var groupsStore: GroupsStore
    @EnvironmentObject private var dailyStore: DailyPuzzleStore
    @EnvironmentObject private var scoresStore: ScoresStore
    @EnvironmentObject private var multiplayerStore: MultiplayerStore

    @StateObject private var history: PuzzleHistory
    @StateObject private var store: GameStore
    @StateObject private var game: SudokuGame
    @State private var phase: Phase = .home
    @State private var showingHistory = false
    @State private var showingSettings = false
    @State private var showingNewGame = false
    @State private var showingSolved = false
    @State private var showingSignIn = false
    @State private var confirmingReset = false
    @State private var replayingDaily: PuzzleResult?
    @State private var showingLeaderboard = false
    @State private var showingCoach = false
    @State private var showingMultiplayer = false
    @State private var showingPushPrompt = false
    @State private var initialLoadComplete = false
    /// 6-char invite code parsed from a universal link. While set, we'll
    /// either auto-join (if signed in) or stash for after sign-in.
    @State private var pendingInviteCode: String?
    @State private var openingGameAfterInvite: MultiplayerGame?
    @State private var inviteJoinError: String?
    @State private var versionStatus: VersionStatus = .upToDate
    @State private var versionStoreURL: URL?
    @State private var dailyIsOfflineFallback = false
    @StateObject private var coachStore = CoachStore()
    @AppStorage("sudoku.push.prepermission_dismissed") private var pushPrepermissionDismissed = false
    @State private var solvedRank: Int?
    @State private var solvedWasDaily = false
    @State private var tutorHint: TutorHint?
    @State private var tutorStepIndex: Int = 0
    @State private var showingTutor = false
    @State private var autoPencilPending: Bool = false
    @State private var autoPencilCountdownTask: Task<Void, Never>?

    init() {
        let h = PuzzleHistory()
        let s = GameStore()
        let initial = UserDefaults.standard.string(forKey: "sudoku.difficulty")
            .flatMap(Difficulty.init(rawValue:)) ?? .medium
        _history = StateObject(wrappedValue: h)
        _store = StateObject(wrappedValue: s)
        _game = StateObject(wrappedValue: SudokuGame(
            provider: GeneratedPuzzleProvider(),
            history: h,
            store: s,
            initialDifficulty: initial
        ))
    }

    var body: some View {
        Group {
            switch phase {
            case .home:
                HomeView(
                    mostRecentSave: store.mostRecent,
                    dailyDate: Date(),
                    dailyPuzzleID: resolvedDailyID,
                    dailyStatus: dailyStatus(dailyID: resolvedDailyID),
                    dailyElapsed: store.saves[resolvedDailyID]?.elapsedSeconds,
                    signedInDisplayName: auth.displayName,
                    onDaily: startDaily,
                    onReplayDaily: { replayDaily(dailyID: resolvedDailyID) },
                    onContinue: continueMostRecent,
                    onNewGame: { showingNewGame = true },
                    onShowGames: { showingHistory = true },
                    onShowSettings: { showingSettings = true },
                    onSignIn: { showingSignIn = true },
                    onShowLeaderboard: { showingLeaderboard = true },
                    onShowCoach: { showingCoach = true },
                    onShowMultiplayer: { showingMultiplayer = true }
                )
            case .playing:
                gameView
            }
        }
        .task {
            // Run network refreshes concurrently rather than serially so a
            // slow daily endpoint doesn't gate groups/scores. .task fires
            // after first frame either way, but parallelising shaves some
            // wall-clock time on cold launch.
            async let dailyRefresh: Void = dailyStore.refresh()
            async let groupsRefresh: Void = (auth.isSignedIn ? groupsStore.refresh() : ())
            async let pendingFlush: Void = (auth.isSignedIn ? scoresStore.flushPending() : ())
            async let historySync: Void = (auth.isSignedIn ? syncRemoteHistory() : ())
            async let versionCheck: Void = checkVersion()
            _ = await (dailyRefresh, groupsRefresh, pendingFlush, historySync, versionCheck)
            withAnimation(.easeOut(duration: 0.3)) { initialLoadComplete = true }
            await maybeShowPushPrompt()
        }
        .overlay {
            // Loading veil — covers the home screen for the first second or
            // so while bg work primes the puzzle buffer + the .task fetches
            // run. Without this the user sees the home screen with stale or
            // empty content for a beat. Hide the moment .task completes OR
            // after a hard 1.5s timeout so we never trap the user behind it.
            if !initialLoadComplete && phase == .home {
                LoadingVeilView()
                    .task {
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        withAnimation(.easeOut(duration: 0.3)) { initialLoadComplete = true }
                    }
            }
        }
        .overlay {
            // Hard update blocker — when the bundle is older than the
            // backend's `min_required`, no other UI is reachable until the
            // user updates. Used for backend-breaking changes (e.g. wire
            // protocol bumps).
            if versionStatus == .blocked, let url = versionStoreURL {
                UpdateBlockerView(storeURL: url)
            }
        }
        .safeAreaInset(edge: .top) {
            // Soft update prompt — small banner at the top of every screen.
            // Tappable; opens the store listing. Dismissable so we don't nag.
            if versionStatus == .softPrompt, let url = versionStoreURL {
                UpdateBannerView(storeURL: url) {
                    versionStatus = .upToDate
                }
            }
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn {
                Task { await maybeShowPushPrompt() }
                Task { await syncRemoteHistory() }
                // If a deep-link invite was queued before sign-in, resolve it now.
                if pendingInviteCode != nil { Task { await resolvePendingInvite() } }
            }
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            guard let url = activity.webpageURL else { return }
            handleIncomingURL(url)
        }
        .onOpenURL { url in
            handleIncomingURL(url)
        }
        .alert("Couldn't join the game", isPresented: inviteErrorBinding, presenting: inviteJoinError) { _ in
            Button("OK", role: .cancel) { inviteJoinError = nil }
        } message: { msg in
            Text(msg)
        }
        .alert("Get notified about your turn?", isPresented: $showingPushPrompt) {
            Button("Not now", role: .cancel) {
                pushPrepermissionDismissed = true
            }
            Button("Sure") {
                Task { await requestPushAuthorization() }
            }
        } message: {
            Text("Sudoku Crew can ping you when it's your turn in a multiplayer game, or when a friend joins your group's leaderboard. We'll only send notifications about real activity in your games.")
        }
        .onChange(of: game.isSolved) { _, isSolved in
            guard isSolved else { return }
            history.record(PuzzleResult(
                puzzleID: game.puzzleID,
                completedAt: Date(),
                elapsedSeconds: game.elapsedSeconds,
                puzzle: game.currentPuzzle
            ))
            if phase == .playing {
                solvedWasDaily = game.currentPuzzle.isDaily
                solvedRank = nil
                showingSolved = true

                // Spec §17.4: post score for canonical daily solves only;
                // offline-fallback dailies are explicitly unranked.
                if solvedWasDaily && !dailyIsOfflineFallback {
                    let pid = game.puzzleID
                    let elapsed = game.elapsedSeconds
                    let mistakes = game.mistakeCount
                    let hints = game.hintsUsed
                    let pencilAssists = game.pencilAssistsUsed
                    let mistakesWasOn = game.highlightMistakesEverOn
                    let rulesWasOn = game.highlightConstraintsEverOn
                    Task {
                        let rank = await scoresStore.submit(
                            puzzleID: pid,
                            elapsedSeconds: elapsed,
                            mistakes: mistakes,
                            hintsUsed: hints,
                            pencilAssistsUsed: pencilAssists,
                            highlightMistakesWasOn: mistakesWasOn,
                            highlightRulesWasOn: rulesWasOn
                        )
                        solvedRank = rank
                    }
                }
            }
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn {
                Task {
                    await groupsStore.refresh()
                    await scoresStore.flushPending()
                }
            }
        }
        .sheet(isPresented: $showingHistory) {
            HistoryView(
                game: game,
                history: history,
                store: store,
                onResume: { phase = .playing }
            )
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(game: game)
        }
        .sheet(isPresented: $showingNewGame) {
            NewGameSheet(difficulty: $difficulty) {
                game.newGame(difficulty: difficulty)
                phase = .playing
            }
        }
        .sheet(isPresented: $showingSignIn) {
            SignInView()
        }
        .sheet(item: $replayingDaily) { result in
            CompletedBoardView(result: result)
        }
        .sheet(isPresented: $showingSolved) {
            SolvedView(
                puzzle: game.currentPuzzle,
                elapsedSeconds: game.elapsedSeconds,
                mistakeCount: game.mistakeCount,
                rank: solvedRank,
                showLeaderboardButton: solvedWasDaily && !dailyIsOfflineFallback && auth.isSignedIn && !groupsStore.groups.isEmpty,
                showSignInPrompt: solvedWasDaily && !dailyIsOfflineFallback && !auth.isSignedIn,
                onLeaderboard: {
                    showingSolved = false
                    showingLeaderboard = true
                },
                onSignIn: {
                    showingSolved = false
                    showingSignIn = true
                },
                onDone: {
                    phase = .home
                    showingSolved = false
                }
            )
        }
        .sheet(isPresented: $showingLeaderboard) {
            LeaderboardView(
                puzzleID: resolvedDailyID,
                puzzleLabel: dailyStore.today?.displayLabel ?? Puzzle(id: resolvedDailyID, difficulty: .medium, givens: [], solution: nil).displayLabel
            )
        }
        .sheet(isPresented: $showingCoach) {
            CoachListView()
                .environmentObject(coachStore)
        }
        .sheet(isPresented: $showingMultiplayer, onDismiss: {
            openingGameAfterInvite = nil
        }) {
            MultiplayerLobbyView(initialGame: openingGameAfterInvite)
        }
        .preferredColorScheme(appearance.colorScheme)
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                game.enterForeground()
                Task {
                    await dailyStore.refresh()
                    if auth.isSignedIn { await groupsStore.refresh() }
                }
            case .background, .inactive:
                game.enterBackground()
            @unknown default:
                break
            }
        }
    }

    private var gameView: some View {
        VStack(spacing: 16) {
            header
            BoardView(game: game, tutorHighlights: currentTutorHighlights)
                .padding(.horizontal, 8)
            NumberPadView(game: game)
                .padding(.horizontal, 8)
            controls
        }
        .padding(.vertical, 12)
        // Hardware-keyboard support — useful in the simulator, on iPad with
        // a Magic Keyboard, and for accessibility setups. Digits enter a
        // value, backspace clears, P/space toggles pencil mode, arrow keys
        // move the selected cell.
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(action: handleKeyPress)
        .overlay(alignment: .bottom) {
            if autoPencilPending {
                autoPencilBanner
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
            }
        }
        .onChange(of: game.cells) { _, _ in
            // Any other action (place, erase) cancels a pending auto-pencil
            // so we don't unexpectedly fill marks after the user moved on.
            if autoPencilPending {
                cancelAutoPencilPending()
            }
        }
        .sheet(isPresented: $showingTutor) {
            TutorView(
                hint: tutorHint,
                hasAnyPencilMarks: game.hasAnyPencilMarks,
                stepIndex: $tutorStepIndex,
                onApply: { hint in
                    game.applyTutorHint(hint)
                    showingTutor = false
                    tutorHint = nil
                    tutorStepIndex = 0
                },
                onDismiss: {
                    showingTutor = false
                    tutorHint = nil
                    tutorStepIndex = 0
                }
            )
        }
    }

    /// Highlights for the tutor's current step, or nil when no sheet is
    /// open / no hint resolved (in which case the board stays normal).
    private var currentTutorHighlights: [TutorHighlight]? {
        guard showingTutor, let hint = tutorHint else { return nil }
        return hint.steps[tutorStepIndex].highlights
    }

    private func openTutor() {
        tutorStepIndex = 0
        tutorHint = game.nextTutorHint()
        showingTutor = true
        // Charge the "hint used" badge as soon as a hint is shown — even
        // if the user dismisses without tapping Apply / Got it. The empty
        // state (no hint available) is free.
        if tutorHint != nil {
            game.noteHintViewed()
        }
    }

    /// Floating banner that appears for ~3s after the user taps the wand.
    /// Auto-pencil only commits when the timer expires; tapping Cancel — or
    /// making any board move — aborts before anything fills in, so the user
    /// never sees the marks they're about to undo.
    private var autoPencilBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "wand.and.stars")
                .foregroundStyle(.yellow)
            Text("Auto-pencilling…")
                .font(.subheadline)
            Spacer()
            Button("Cancel") {
                cancelAutoPencilPending()
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.15), radius: 3)
    }

    private func tappedAutoPencil() {
        cancelAutoPencilPending()
        withAnimation { autoPencilPending = true }
        autoPencilCountdownTask = Task { [weak game = self.game] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                // Clear pending *before* mutating so the .onChange handler
                // for cells skips the cancellation path.
                withAnimation { autoPencilPending = false }
                autoPencilCountdownTask = nil
                game?.autoPencil()
            }
        }
    }

    private func cancelAutoPencilPending() {
        autoPencilCountdownTask?.cancel()
        autoPencilCountdownTask = nil
        if autoPencilPending {
            withAnimation { autoPencilPending = false }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            // Title can shrink (truncate) on narrow devices so it never
            // pushes the timer / icons to wrap. Reported case: small-screen
            // iPhone where the last digit of the clock fell to a second line.
            Text(verbatim: game.currentPuzzle.displayLabel)
                .font(.title3.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .truncationMode(.tail)
            if game.isSolved {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title3)
                    .foregroundStyle(.green)
            }
            Spacer(minLength: 8)
            if game.highlightMistakes {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle")
                    Text("\(game.mistakeCount)")
                }
                .font(.headline)
                .foregroundStyle(game.mistakeCount > 0 ? .red : .primary)
                .fixedSize(horizontal: true, vertical: false)
            }
            HStack(spacing: 4) {
                Image(systemName: "clock")
                Text(game.formattedTime)
                    .monospacedDigit()
            }
            .font(.headline)
            .fixedSize(horizontal: true, vertical: false)
            Button {
                tappedAutoPencil()
            } label: {
                Image(systemName: "wand.and.stars")
                    .font(.headline)
            }
            .buttonStyle(.plain)
            .disabled(game.isPaused || game.isSolved || autoPencilPending)
            Button {
                openTutor()
            } label: {
                Image(systemName: "lightbulb.fill")
                    .font(.headline)
                    .foregroundStyle(.yellow)
            }
            .buttonStyle(.plain)
            .disabled(game.isPaused || game.isSolved)
            Button {
                game.togglePause()
            } label: {
                Image(systemName: game.isPaused ? "play.fill" : "pause.fill")
                    .font(.headline)
            }
            .buttonStyle(.plain)
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.headline)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                goHome()
            } label: {
                Label("Home", systemImage: "house.fill")
            }
            .buttonStyle(.borderedProminent)
            Button("Reset") { confirmingReset = true }
                .buttonStyle(.bordered)
        }
        .padding(.horizontal, 16)
        .confirmationDialog(
            "Reset puzzle?",
            isPresented: $confirmingReset,
            titleVisibility: .visible
        ) {
            Button("Reset", role: .destructive) { game.reset() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This will clear your progress on this puzzle.")
        }
    }

    // MARK: - Phase actions

    private func continueMostRecent() {
        if let save = store.mostRecent {
            game.resume(save)
        }
        phase = .playing
    }

    /// Resolves today's daily via the server-backed store, falls back to the
    /// local generator if nothing's reachable, then enters the playing phase.
    private func startDaily() {
        Task {
            let (puzzle, isOffline) = await dailyStore.ensureToday()
            dailyIsOfflineFallback = isOffline
            game.startDaily(puzzle: puzzle)
            phase = .playing
        }
    }

    private func replayDaily(dailyID: Int) {
        replayingDaily = history.results.first(where: { $0.puzzleID == dailyID })
    }

    private func dailyStatus(dailyID: Int) -> DailyStatus {
        if history.results.contains(where: { $0.puzzleID == dailyID }) {
            return .completed
        }
        if store.saves[dailyID] != nil {
            return .inProgress
        }
        return .notStarted
    }

    /// Server-known daily ID when we have a cache, else fall back to local
    /// date math. The two will agree for any device on Sydney time and may
    /// differ by ±1 day across timezones — a tradeoff we accept while the
    /// daily is anchored to one server timezone (SPEC §17.6).
    private var resolvedDailyID: Int {
        dailyStore.today?.id ?? DailyPuzzle.id(for: Date())
    }

    private func goHome() {
        if !game.isPaused {
            game.togglePause()
        }
        phase = .home
    }

    /// Hardware-keyboard handler for the playing screen. Maps:
    ///   - Digits 1–9 → place / pencil-toggle (depends on current mode)
    ///   - 0 / Backspace / Delete → clear selected cell
    ///   - P or Space → toggle pencil ↔ normal
    ///   - Arrow keys → move the selected cell, defaulting to (0,0) if none.
    /// Ignored when paused, solved, or while the tutor sheet is open
    /// (let the sheet's own controls handle keyboard).
    private func handleKeyPress(_ press: KeyPress) -> KeyPress.Result {
        guard !game.isPaused, !game.isSolved, !showingTutor else { return .ignored }

        if let ch = press.characters.first, let digit = ch.wholeNumberValue, (1...9).contains(digit) {
            game.enter(digit)
            return .handled
        }
        if press.characters == "0" || press.key == .delete {
            game.clearSelected()
            return .handled
        }
        if press.characters.lowercased() == "p" || press.characters == " " {
            game.toggleMode()
            return .handled
        }
        switch press.key {
        case .upArrow:
            moveSelection(dRow: -1, dCol: 0); return .handled
        case .downArrow:
            moveSelection(dRow: 1, dCol: 0); return .handled
        case .leftArrow:
            moveSelection(dRow: 0, dCol: -1); return .handled
        case .rightArrow:
            moveSelection(dRow: 0, dCol: 1); return .handled
        default:
            return .ignored
        }
    }

    private func moveSelection(dRow: Int, dCol: Int) {
        let current = game.selected ?? (row: 0, col: 0)
        let r = max(0, min(8, current.row + dRow))
        let c = max(0, min(8, current.col + dCol))
        game.select(row: r, col: c)
    }

    /// Universal-link entry point. Parses `/m/<code>` from incoming URLs and
    /// either auto-joins the multiplayer game (signed in) or stashes the
    /// code and prompts sign-in. App not handling the URL here would let
    /// iOS fall through to Safari, which is the wrong UX.
    private func handleIncomingURL(_ url: URL) {
        guard let host = url.host?.lowercased(),
              host == "sudoku.appfoundry.cc",
              url.path.lowercased().hasPrefix("/m/") else { return }
        let raw = String(url.path.dropFirst(3)) // strip "/m/"
        let code = raw.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).uppercased()
        guard !code.isEmpty else { return }
        pendingInviteCode = code
        if auth.isSignedIn {
            Task { await resolvePendingInvite() }
        } else {
            // Defer until they sign in. Pre-pop the sign-in sheet so the
            // friction is minimal.
            showingSignIn = true
        }
    }

    private func resolvePendingInvite() async {
        guard let code = pendingInviteCode else { return }
        pendingInviteCode = nil
        do {
            let game = try await multiplayerStore.joinByCode(code)
            await MainActor.run {
                openingGameAfterInvite = game
                showingMultiplayer = true
            }
        } catch let error as APIError {
            switch error {
            case .http(404, _):
                inviteJoinError = "We don't recognise that invite code. The game may have ended."
            case .http(409, "cannot_rejoin"):
                inviteJoinError = "You've already left this game and can't rejoin."
            case .http(409, _):
                inviteJoinError = "This game has already started or ended."
            case .offline:
                inviteJoinError = "You're offline. Try the link again when you're back online."
            default:
                inviteJoinError = "Couldn't join the game. Try again."
            }
        } catch {
            inviteJoinError = "Couldn't join the game. Try again."
        }
    }

    private var inviteErrorBinding: Binding<Bool> {
        Binding(
            get: { inviteJoinError != nil },
            set: { if !$0 { inviteJoinError = nil } }
        )
    }

    /// Compare our bundle version to the server's `current` and
    /// `min_required`. Sets `versionStatus` so the overlay / banner can
    /// surface the right UX. Best-effort — silent fail on offline.
    private func checkVersion() async {
        let client = APIClient()
        guard let response = try? await client.version() else { return }
        let info = response.ios
        let bundleVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0"
        let storeURL = URL(string: info.storeUrl)
        await MainActor.run {
            self.versionStoreURL = storeURL
            if Self.compareVersions(bundleVersion, info.minRequired) < 0 {
                self.versionStatus = .blocked
            } else if Self.compareVersions(bundleVersion, info.current) < 0 {
                self.versionStatus = .softPrompt
            } else {
                self.versionStatus = .upToDate
            }
        }
    }

    /// Compare semver-ish strings ("1.10.2" > "1.9.99"). Returns -1, 0, or
    /// 1. Tolerates missing trailing components (treats "1.0" == "1.0.0").
    private static func compareVersions(_ a: String, _ b: String) -> Int {
        let aParts = a.split(separator: ".").map { Int($0) ?? 0 }
        let bParts = b.split(separator: ".").map { Int($0) ?? 0 }
        let len = max(aParts.count, bParts.count)
        for i in 0..<len {
            let av = i < aParts.count ? aParts[i] : 0
            let bv = i < bParts.count ? bParts[i] : 0
            if av < bv { return -1 }
            if av > bv { return 1 }
        }
        return 0
    }

    /// Fetch this user's completed-daily history from the backend and merge
    /// into local history. Best-effort — silent fail on offline / errors.
    /// Local entries always win on conflict (they were probably the source
    /// of the remote score, and we don't want to clobber a freshly-recorded
    /// solve with the round-tripped server copy).
    private func syncRemoteHistory() async {
        guard let token = auth.token else { return }
        let client = APIClient()
        guard let remote = try? await client.meScores(token: token) else { return }
        let asResults: [PuzzleResult] = remote.map { r in
            let puzzle = Puzzle(
                id: r.puzzleId,
                difficulty: r.difficulty,
                givens: r.givens,
                solution: r.solution
            )
            return PuzzleResult(
                puzzleID: r.puzzleId,
                completedAt: Date(timeIntervalSince1970: TimeInterval(r.completedAt) / 1000),
                elapsedSeconds: r.elapsedSeconds,
                puzzle: puzzle
            )
        }
        history.mergeRemote(asResults)
    }

    /// Show our pre-permission alert before iOS's system prompt — gives the
    /// user context, lets them dismiss without burning the one-time system
    /// prompt. Only shows when:
    ///   - User is signed in (no point pinging if they can't receive game pushes).
    ///   - System auth status is still .notDetermined (we haven't asked iOS yet).
    ///   - User hasn't already dismissed our pre-prompt.
    private func maybeShowPushPrompt() async {
        guard auth.isSignedIn, !pushPrepermissionDismissed else { return }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else {
            // Already authorized → make sure APNs registration kicked off.
            // Already denied → don't nag; user can flip in Settings.
            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
            return
        }
        await MainActor.run { showingPushPrompt = true }
    }

    /// Called when the user taps "Sure" on the pre-prompt. Triggers iOS's
    /// system permission prompt and registers for APNs if granted.
    private func requestPushAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        if granted {
            await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        }
        // Whichever way they answer the system prompt, we don't ask again.
        pushPrepermissionDismissed = true
    }
}

/// Tri-state for the in-app version check.
/// - `.upToDate` — bundle matches or beats the backend's `current`. No UX.
/// - `.softPrompt` — bundle < `current`. Banner at top of home; dismissable.
/// - `.blocked` — bundle < `min_required`. Full-screen blocker; can't dismiss.
enum VersionStatus {
    case upToDate
    case softPrompt
    case blocked
}

/// Top banner shown when a newer build is available but the current bundle
/// still works. Tappable → opens the store listing. Dismissable.
private struct UpdateBannerView: View {
    let storeURL: URL
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 1) {
                Text("Update available")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                Text("Tap to get the latest version")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.85))
            }
            Spacer()
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.accentColor)
        .contentShape(Rectangle())
        .onTapGesture {
            UIApplication.shared.open(storeURL)
        }
    }
}

/// Full-screen blocker shown when the bundle is too old for the backend.
/// Used for wire-protocol breaks where running anyway would cause errors.
private struct UpdateBlockerView: View {
    let storeURL: URL

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(Color.accentColor)
                Text("Update required")
                    .font(.title2.weight(.bold))
                Text("This version of Sudoku Crew can't talk to the server anymore. Grab the latest from the App Store to keep playing.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
                Button {
                    UIApplication.shared.open(storeURL)
                } label: {
                    Text("Open App Store")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal, 32)
                .padding(.top, 8)
            }
        }
    }
}

/// Full-screen loading indicator shown briefly on cold start while the
/// puzzle buffer warms up + initial network refreshes run. Branded so the
/// transient state feels intentional rather than blank.
private struct LoadingVeilView: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Text("Sudoku Crew")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.2)
            }
        }
        .transition(.opacity)
    }
}

#Preview {
    let client = APIClient()
    let auth = AuthStore(client: client)
    return ContentView()
        .environmentObject(auth)
        .environmentObject(GroupsStore(client: client, auth: auth))
        .environmentObject(DailyPuzzleStore(client: client, fallbackProvider: GeneratedPuzzleProvider()))
        .environmentObject(ScoresStore(client: client, auth: auth))
}
