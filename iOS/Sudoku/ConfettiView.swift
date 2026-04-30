//
//  ConfettiView.swift
//  Sudoku
//

import SwiftUI

/// Falling confetti shower. Particles are randomized at init, animated
/// via a TimelineView over a fixed duration, drawn through a Canvas.
/// Stops emitting once `duration` has passed.
struct ConfettiView: View {
    var count: Int = 90
    var duration: Double = 3.0

    @State private var startTime: Date = .now

    private struct Particle {
        let color: Color
        let size: CGFloat
        let startX: CGFloat       // 0…1, fraction of width
        let driftX: CGFloat       // -0.3…0.3, horizontal drift over fall
        let startDelay: Double
        let rotation: Double      // total degrees rotated over fall
        let aspect: CGFloat       // height/width, for rectangular confetti
    }

    private let particles: [Particle]

    init(count: Int = 90, duration: Double = 3.0) {
        self.count = count
        self.duration = duration
        let palette: [Color] = [.red, .blue, .green, .yellow, .orange, .pink, .purple, .cyan]
        var generated: [Particle] = []
        for _ in 0..<count {
            generated.append(
                Particle(
                    color: palette.randomElement()!,
                    size: CGFloat.random(in: 7...13),
                    startX: CGFloat.random(in: 0...1),
                    driftX: CGFloat.random(in: -0.25...0.25),
                    startDelay: Double.random(in: 0...0.6),
                    rotation: Double.random(in: -540...540),
                    aspect: CGFloat.random(in: 0.4...0.9)
                )
            )
        }
        self.particles = generated
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            let elapsed = timeline.date.timeIntervalSince(startTime)
            Canvas { context, size in
                for p in particles {
                    let local = elapsed - p.startDelay
                    guard local > 0 else { continue }
                    let progress = min(local / duration, 1.0)
                    let xFraction = p.startX + p.driftX * progress
                    let x = xFraction * size.width
                    let y = -20 + (size.height + 40) * progress
                    let opacity = max(0, 1 - progress * 0.9)

                    let rect = CGRect(
                        x: -p.size / 2,
                        y: -p.size * p.aspect / 2,
                        width: p.size,
                        height: p.size * p.aspect
                    )

                    var ctx = context
                    ctx.opacity = opacity
                    ctx.translateBy(x: x, y: y)
                    ctx.rotate(by: .degrees(p.rotation * progress))
                    ctx.fill(Path(rect), with: .color(p.color))
                }
            }
        }
    }
}
