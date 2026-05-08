//
//  BadgeLegendView.swift
//  Sudoku
//

import SwiftUI

/// Small reference sheet explaining what each leaderboard badge means.
/// Reachable from the leaderboard's "ⓘ" toolbar button. Badges celebrate
/// the *absence* of an assist — solo solves earn the gold; assisted solves
/// just don't have the badge (no penalty markers).
struct BadgeLegendView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    legendRow(
                        icon: "lightbulb.slash",
                        color: .green,
                        title: "Solo",
                        description: "Solved without asking the tutor for hints."
                    )
                    legendRow(
                        icon: "wand.and.stars.inverse",
                        color: .purple,
                        title: "Manual",
                        description: "Solved without using the auto-pencil button. You did all your candidate-marking by hand."
                    )
                    legendRow(
                        icon: "checkmark.seal.fill",
                        color: .mint,
                        title: "Flawless",
                        description: "Zero incorrect placements during the solve."
                    )
                } header: {
                    Text("Badges")
                } footer: {
                    Text("Three badges, earned independently. Get all three on the same solve and that's a flex worth bragging about. Mistakes also add a small time penalty (about 10% per mistake, capped at five) when ranking the leaderboard — you'll never see the count, just the resulting position.")
                }
            }
            .navigationTitle("Leaderboard Badges")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func legendRow(icon: String, color: Color, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
