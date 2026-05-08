//
//  CoachListView.swift
//  Sudoku
//
//  Coach Mode entry point: a grid of technique cards. Tapping a card opens
//  the scenario play view. Completed scenarios get a small trophy badge.
//

import SwiftUI

struct CoachListView: View {
    @EnvironmentObject private var store: CoachStore
    @Environment(\.dismiss) private var dismiss

    private let columns: [GridItem] = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Pick a technique to practise. Each scenario sets up a board where the named pattern is the next useful move — spot it and apply it.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(CoachScenario.validScenarios) { scenario in
                            NavigationLink {
                                CoachScenarioView(scenario: scenario)
                            } label: {
                                card(for: scenario)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("Coach")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func card(for scenario: CoachScenario) -> some View {
        let isDone = store.isComplete(scenario)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(scenario.title)
                    .font(.headline)
                Spacer()
                if isDone {
                    Image(systemName: "trophy.fill")
                        .foregroundStyle(.yellow)
                }
            }
            Text(tierLabel(scenario.technique.tier))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(tierColor(scenario.technique.tier).opacity(0.4), lineWidth: 1)
        )
    }

    private func tierLabel(_ tier: TutorTechnique.Tier) -> String {
        switch tier {
        case .simple: return "Simple"
        case .medium: return "Medium"
        case .hard: return "Hard"
        }
    }

    private func tierColor(_ tier: TutorTechnique.Tier) -> Color {
        switch tier {
        case .simple: return .green
        case .medium: return .orange
        case .hard: return .red
        }
    }
}
