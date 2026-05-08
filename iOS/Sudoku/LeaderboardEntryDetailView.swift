//
//  LeaderboardEntryDetailView.swift
//  Sudoku
//
//  Sheet presented when a leaderboard row is tapped. Shows the player's
//  rank + display name + badges spelled out (so users don't have to
//  flip back to the legend to remember what each icon means) plus the
//  raw vs effective time breakdown. For your OWN row we also show the
//  exact mistake count and penalty applied — full self-transparency.
//  For other players, we keep mistake count opaque (only "raw" + "effective"
//  are shown), matching the leaderboard's privacy default.
//

import SwiftUI

struct LeaderboardEntryDetailView: View {
    let entry: LeaderboardEntry
    let isMe: Bool
    /// Raw mistake count for the viewer's own row, sourced locally (the
    /// just-finished SudokuGame). For other players this stays nil and we
    /// don't display the field.
    let myMistakeCount: Int?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text("#\(entry.rank)")
                            .font(.title2.weight(.bold).monospacedDigit())
                            .frame(minWidth: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.displayName ?? "—")
                                .font(.title3.weight(.semibold))
                            if isMe {
                                Text("You")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                }

                Section("Time") {
                    HStack {
                        Text("Raw time")
                        Spacer()
                        Text(formatTime(entry.elapsedSeconds))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    if entry.effectiveSeconds > entry.elapsedSeconds {
                        if isMe, let mistakes = myMistakeCount, mistakes > 0 {
                            HStack {
                                Text("Mistakes")
                                Spacer()
                                Text("\(mistakes)")
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                Text("Penalty")
                                Spacer()
                                Text("+\(percentLabel(mistakes: mistakes))")
                                    .foregroundStyle(.orange)
                            }
                        }
                        HStack {
                            Text("Effective time")
                                .fontWeight(.semibold)
                            Spacer()
                            Text(formatTime(entry.effectiveSeconds))
                                .monospacedDigit()
                                .fontWeight(.semibold)
                        }
                        if !isMe {
                            Text("Effective time includes a small penalty for any mistakes during the solve. Used for ranking; raw count of mistakes isn't shown here.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        HStack {
                            Text("No mistake penalty")
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                }

                Section("Badges earned") {
                    if entry.hintsUsed == 0 {
                        badgeRow(
                            icon: "lightbulb.slash",
                            color: .green,
                            title: "Solo",
                            subtitle: "Solved without using the tutor."
                        )
                    }
                    if entry.pencilAssistsUsed == 0 {
                        badgeRow(
                            icon: "wand.and.stars.inverse",
                            color: .purple,
                            title: "Manual",
                            subtitle: "Solved without auto-pencil."
                        )
                    }
                    if entry.flawless {
                        badgeRow(
                            icon: "checkmark.seal.fill",
                            color: .mint,
                            title: "Flawless",
                            subtitle: "Zero incorrect placements."
                        )
                    }
                    if entry.hintsUsed > 0 && entry.pencilAssistsUsed > 0 && !entry.flawless {
                        Text("No badges earned on this solve.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Solved at") {
                    Text(Date(timeIntervalSince1970: TimeInterval(entry.completedAt) / 1000),
                         format: .dateTime.day().month().year().hour().minute())
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(entry.displayName ?? "Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func badgeRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).fontWeight(.semibold)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func formatTime(_ s: Int) -> String {
        String(format: "%02d:%02d", s / 60, s % 60)
    }

    private func percentLabel(mistakes: Int) -> String {
        let capped = min(mistakes, 5)
        return "\(capped * 10)%"
    }
}
