//
//  MultiplayerGameView.swift
//  Sudoku
//
//  Play view for a single multiplayer game. State is server-driven —
//  fetched on appear, on user action, and via short poll while the view is
//  open. Rendering reuses CellView; the layout is intentionally minimal
//  (no assists, no pencil mode — see SPEC §multiplayer).
//

import SwiftUI

struct MultiplayerGameView: View {
    let gameID: String

    @EnvironmentObject private var store: MultiplayerStore
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var detail: MultiplayerGameDetail?
    @State private var selected: (row: Int, col: Int)?
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var pendingMove = false
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        Group {
            if let detail {
                content(detail: detail)
            } else if let errorText {
                errorView(message: errorText)
            } else {
                ProgressView().task { await load() }
            }
        }
        .navigationTitle(detail.map(title) ?? "Game")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let detail, detail.game.status == .active || detail.game.status == .pending {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Refresh", systemImage: "arrow.clockwise") {
                            Task { await load() }
                        }
                        if detail.game.status == .active {
                            Button("Leave game", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                                Task { await leave() }
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .onAppear { startPolling() }
        .onDisappear { stopPolling() }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(detail: MultiplayerGameDetail) -> some View {
        VStack(spacing: 12) {
            statusBanner(detail: detail)
            board(detail: detail)
            if detail.game.status == .pending {
                pendingControls(detail: detail)
            } else if detail.game.status == .active {
                activeControls(detail: detail)
            } else {
                endStats(detail: detail)
            }
            Spacer()
        }
        .padding()
    }

    private func statusBanner(detail: MultiplayerGameDetail) -> some View {
        let game = detail.game
        let myID = auth.user?.id
        let activeName = detail.players.first { $0.user.id == game.activePlayerId }?.user.displayName ?? "—"
        let label: String
        let tint: Color

        switch game.status {
        case .pending:
            label = "Waiting to start"
            tint = .yellow
        case .active where game.activePlayerId == myID:
            if let secs = game.timeRemainingSeconds, secs > 0 {
                label = "Your turn · \(formatRemaining(secs)) left"
            } else {
                label = "Your turn"
            }
            tint = .accentColor
        case .active:
            label = "\(activeName)'s turn"
            tint = .secondary
        case .completed:
            let winner = detail.players.first { $0.user.id == game.winnerId }?.user.displayName ?? "—"
            label = "Solved by \(winner)"
            tint = .green
        case .abandoned:
            label = "Game abandoned"
            tint = .red
        }
        return Text(label)
            .font(.headline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(tint.opacity(0.15))
            )
    }

    private func board(detail: MultiplayerGameDetail) -> some View {
        let game = detail.game
        let isMyTurn = game.status == .active && game.activePlayerId == auth.user?.id
        return VStack(spacing: 0) {
            ForEach(0..<9, id: \.self) { r in
                HStack(spacing: 0) {
                    ForEach(0..<9, id: \.self) { c in
                        let value = detail.board[r][c]
                        let cell = Cell(
                            value: value == 0 ? nil : value,
                            isFixed: !wasPlacedInGame(row: r, col: c, moves: detail.moves),
                            notes: []
                        )
                        let isSel = selected.map { $0.row == r && $0.col == c } ?? false
                        CellView(
                            cell: cell,
                            isSelected: isSel,
                            isHighlighted: false,
                            isMatching: false,
                            isError: false,
                            isLocked: cell.value != nil
                        )
                        .border(Color.gray.opacity(0.3), width: 0.5)
                        .border(boxBorder(row: r, col: c), width: 1.5)
                        .onTapGesture {
                            guard isMyTurn, value == 0 else { return }
                            if selected.map({ $0.row == r && $0.col == c }) ?? false {
                                selected = nil
                            } else {
                                selected = (r, c)
                            }
                        }
                    }
                }
            }
        }
        .background(Color.gray.opacity(0.15))
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
    }

    private func boxBorder(row: Int, col: Int) -> Color {
        let onBoxRow = row % 3 == 0 || row == 8
        let onBoxCol = col % 3 == 0 || col == 8
        return (onBoxRow || onBoxCol) ? .primary.opacity(0.7) : .clear
    }

    /// True when (row, col) was filled by a player's correct move (not a given).
    private func wasPlacedInGame(row: Int, col: Int, moves: [MultiplayerMove]) -> Bool {
        moves.contains { $0.row == row && $0.col == col && $0.wasCorrect }
    }

    // MARK: - Pending controls

    @ViewBuilder
    private func pendingControls(detail: MultiplayerGameDetail) -> some View {
        let game = detail.game
        let isHost = game.createdBy == auth.user?.id
        let joinedCount = detail.players.filter { $0.status == .joined }.count

        VStack(spacing: 12) {
            playersStrip(detail: detail)
            if let inviteCode = inviteCode(detail: detail) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("Invite code")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(inviteCode)
                            .font(.system(.body, design: .monospaced).weight(.semibold))
                        Spacer()
                        ShareLink(item: "Join my sudoku game: https://sudoku.appfoundry.cc/m/\(inviteCode)") {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                    Text("Works on iPhone & Android — share the link with anyone.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            if isHost {
                Button {
                    Task { await start() }
                } label: {
                    if pendingMove {
                        ProgressView()
                    } else {
                        Text(joinedCount >= 2 ? "Start game" : "Need at least 2 players")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(joinedCount < 2 || pendingMove)
            } else {
                Text("Waiting for the host to start.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func inviteCode(detail: MultiplayerGameDetail) -> String? {
        // Backend includes invite_code on every game payload.
        detail.game.inviteCode
    }

    // MARK: - Active controls (your turn or theirs)

    @ViewBuilder
    private func activeControls(detail: MultiplayerGameDetail) -> some View {
        let game = detail.game
        let isMyTurn = game.activePlayerId == auth.user?.id

        VStack(spacing: 12) {
            playersStrip(detail: detail)
            moveHistoryStrip(detail: detail)
            if isMyTurn {
                pad(detail: detail)
            } else {
                Text("Tap to refresh while you wait. We'll push when it's your turn.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func pad(detail: MultiplayerGameDetail) -> some View {
        HStack(spacing: 6) {
            ForEach(1...9, id: \.self) { n in
                Button {
                    Task { await placeMove(value: n) }
                } label: {
                    Text("\(n)")
                        .font(.title2.monospacedDigit())
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(selected == nil || pendingMove)
            }
        }
    }

    // MARK: - Players strip

    @ViewBuilder
    private func playersStrip(detail: MultiplayerGameDetail) -> some View {
        let stats = perPlayerStats(detail: detail)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(detail.players, id: \.user.id) { player in
                    let s = stats[player.user.id] ?? PlayerStats()
                    let isActive = detail.game.activePlayerId == player.user.id
                    HStack(spacing: 6) {
                        Image(systemName: "person.crop.circle.fill")
                            .foregroundStyle(isActive ? Color.accentColor : Color.secondary)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(player.user.displayName ?? "—")
                                .font(.caption.weight(.semibold))
                            Text("\(s.correct)✓ \(s.wrong)✗")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if player.status == .left {
                            Text("(left)")
                                .font(.caption2)
                                .foregroundStyle(.red)
                        } else if player.status == .invited {
                            Text("(pending)")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(isActive ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.10))
                    )
                }
            }
        }
    }

    // MARK: - Move history

    @ViewBuilder
    private func moveHistoryStrip(detail: MultiplayerGameDetail) -> some View {
        if detail.moves.isEmpty {
            EmptyView()
        } else {
            let last = detail.moves.suffix(3)
            VStack(alignment: .leading, spacing: 4) {
                Text("Recent moves")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(last, id: \.moveIndex) { move in
                    let name = detail.players.first { $0.user.id == move.playerId }?.user.displayName ?? "—"
                    let coord = "\(["A","B","C","D","E","F","G","H","I"][move.row])\(move.col + 1)"
                    let symbol = move.wasCorrect ? "✓" : "✗"
                    Text("\(symbol) \(name) placed \(move.value) at \(coord)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(move.wasCorrect ? .primary : .secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.secondary.opacity(0.08))
            )
        }
    }

    // MARK: - End stats

    @ViewBuilder
    private func endStats(detail: MultiplayerGameDetail) -> some View {
        let stats = perPlayerStats(detail: detail)
        let scored = detail.players.map { p -> (player: MultiplayerPlayer, stats: PlayerStats) in
            (p, stats[p.user.id] ?? PlayerStats())
        }
        VStack(alignment: .leading, spacing: 8) {
            Text("Final stats")
                .font(.headline)
            ForEach(scored, id: \.player.user.id) { entry in
                HStack {
                    Text(entry.player.user.displayName ?? "—")
                        .fontWeight(entry.player.user.id == detail.game.winnerId ? .bold : .regular)
                    if entry.player.user.id == detail.game.winnerId {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                    }
                    Spacer()
                    Text("\(entry.stats.correct) correct · \(entry.stats.wrong) miss")
                        .foregroundStyle(.secondary)
                        .font(.caption.monospacedDigit())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.secondary.opacity(0.10))
        )
    }

    // MARK: - Error

    private func errorView(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text(message).foregroundStyle(.secondary)
            Button("Retry") { Task { await load() } }
                .buttonStyle(.bordered)
        }
        .padding()
    }

    // MARK: - Stats

    private struct PlayerStats {
        var correct: Int = 0
        var wrong: Int = 0
    }

    private func perPlayerStats(detail: MultiplayerGameDetail) -> [String: PlayerStats] {
        var stats: [String: PlayerStats] = [:]
        for m in detail.moves {
            var s = stats[m.playerId] ?? PlayerStats()
            if m.wasCorrect { s.correct += 1 } else { s.wrong += 1 }
            stats[m.playerId] = s
        }
        return stats
    }

    // MARK: - Network

    private func load() async {
        do {
            detail = try await store.detail(gameID: gameID)
            errorText = nil
        } catch {
            errorText = "Couldn't load this game. Pull to retry."
        }
        isLoading = false
    }

    private func placeMove(value: Int) async {
        guard let sel = selected else { return }
        pendingMove = true
        defer { pendingMove = false }
        do {
            _ = try await store.postMove(
                gameID: gameID, row: sel.row, col: sel.col, value: value
            )
            selected = nil
            await load()
        } catch APIError.http(let status, _) where status == 403 {
            errorText = "Not your turn anymore — refreshing."
            await load()
        } catch {
            errorText = "Couldn't place that move. Try again."
        }
    }

    private func start() async {
        pendingMove = true
        defer { pendingMove = false }
        do {
            _ = try await store.start(gameID: gameID)
            await load()
        } catch {
            errorText = "Couldn't start the game."
        }
    }

    private func leave() async {
        do {
            try await store.leave(gameID: gameID)
            dismiss()
        } catch {
            errorText = "Couldn't leave the game."
        }
    }

    // MARK: - Polling

    private func startPolling() {
        // Light poll while the view is open so the user sees turn changes
        // without push. Push will preempt this when wired.
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000) // 15s
                if Task.isCancelled { break }
                await load()
            }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Helpers

    private func title(_ detail: MultiplayerGameDetail) -> String {
        let names = detail.players
            .filter { $0.status == .joined }
            .compactMap { $0.user.displayName }
        if names.count <= 3 { return names.joined(separator: " · ") }
        return "\(names[0]) +\(names.count - 1)"
    }

    private func formatRemaining(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m)m"
    }
}
