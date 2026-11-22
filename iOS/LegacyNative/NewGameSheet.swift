//
//  NewGameSheet.swift
//  Sudoku
//

import SwiftUI

/// Compact sheet shown when the user taps "New Game". Pre-selects the
/// last-played difficulty (via the bound `@AppStorage`) so a single tap on
/// Start uses the same tier as last time.
struct NewGameSheet: View {
    @Binding var difficulty: Difficulty
    let onStart: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Picker("Difficulty", selection: $difficulty) {
                    ForEach(Difficulty.allCases) { d in
                        Text(d.label).tag(d)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                Button {
                    onStart()
                    dismiss()
                } label: {
                    Text("Start")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal)
            }
            .padding(.top, 24)
            .navigationTitle("New Game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.height(220)])
    }
}
