//
//  TutorView.swift
//  Sudoku
//

import SwiftUI

/// Bottom sheet that walks the user through a single tutor hint. Highlights
/// for the current step are surfaced through `currentHighlights`, which the
/// host (ContentView) passes into BoardView so the tints render on the board
/// underneath.
struct TutorView: View {
    let hint: TutorHint?
    let hasAnyPencilMarks: Bool
    @Binding var stepIndex: Int
    let onApply: (TutorHint) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if let hint {
                    header(hint: hint)
                    Text(hint.steps[stepIndex].narration)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                    legend
                    controls(hint: hint)
                } else {
                    emptyState
                }
            }
            .padding(20)
            .navigationTitle("Tutor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { onDismiss() }
                }
            }
        }
        .presentationDetents([.fraction(0.4), .large])
        .presentationDragIndicator(.visible)
    }

    private func header(hint: TutorHint) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "lightbulb.fill")
                .foregroundStyle(.yellow)
            Text(hint.technique.label)
                .font(.headline)
            Spacer()
            Text("Step \(stepIndex + 1) of \(hint.steps.count)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendChip(color: .blue.opacity(0.18), label: "Looking here")
            legendChip(color: .orange.opacity(0.30), label: "Rules it out")
            legendChip(color: .green.opacity(0.45), label: "Goes here")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private func legendChip(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3)
                .fill(color)
                .frame(width: 12, height: 12)
            Text(label)
        }
    }

    private func controls(hint: TutorHint) -> some View {
        HStack(spacing: 10) {
            Button {
                if stepIndex > 0 { stepIndex -= 1 }
            } label: {
                Label("Back", systemImage: "chevron.left")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(stepIndex == 0)

            if stepIndex == hint.steps.count - 1 {
                let isPlacement = hint.placement != nil
                Button {
                    onApply(hint)
                } label: {
                    Label(isPlacement ? "Apply" : "Got it",
                          systemImage: isPlacement ? "checkmark" : "hand.thumbsup")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            } else {
                Button {
                    stepIndex += 1
                } label: {
                    Label("Next", systemImage: "chevron.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "questionmark.bubble")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(hasAnyPencilMarks ? "Stuck on this one" : "No simple move spotted")
                .font(.headline)
            Text(emptyStateMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var emptyStateMessage: String {
        if hasAnyPencilMarks {
            return "I checked everything I know — singles, pairs/triples/quads (naked + hidden), pointing pair, box-line, X-wing (incl. finned), XY-wing, XYZ-wing, W-wing, swordfish (incl. finned), jellyfish, skyscraper, 2-string kite, empty rectangle, unique rectangle. Nothing fits. This board likely needs chain reasoning (forcing chains, simple coloring) or some plain old guess-and-check."
        } else {
            return "Tap the wand to auto-fill pencil marks first — the pair and pointing techniques need them to work."
        }
    }
}
