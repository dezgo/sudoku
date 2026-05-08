//
//  SoundManager.swift
//  Sudoku
//

import Foundation
import AVFoundation

/// Plays short interface sounds. Single shared instance; respects the
/// "Sound effects" setting and the iOS silent switch (via the ambient
/// audio session category, which is silenced when the ringer is muted).
final class SoundManager {
    static let shared = SoundManager()

    enum Effect: String, CaseIterable {
        case place
        case erase
        case mistake
        case unitComplete = "unit_complete"
        case solved
    }

    private var players: [Effect: AVAudioPlayer] = [:]
    private var sessionConfigured = false

    private init() {}

    /// Reads the "Sound effects" toggle backing UserDefaults. Default true
    /// when the user hasn't set it yet (matches the SettingsView default).
    private var enabled: Bool {
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: "sudoku.sound_effects") != nil else { return true }
        return defaults.bool(forKey: "sudoku.sound_effects")
    }

    func play(_ effect: Effect) {
        guard enabled else { return }
        configureSessionIfNeeded()
        let player = players[effect] ?? makePlayer(for: effect)
        if players[effect] == nil { players[effect] = player }
        guard let player else { return }
        player.currentTime = 0
        player.play()
    }

    private func configureSessionIfNeeded() {
        guard !sessionConfigured else { return }
        sessionConfigured = true
        // .ambient = silenced by the ringer switch and mixes with other
        // audio (e.g., music, podcasts keep playing under our blips).
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }

    private func makePlayer(for effect: Effect) -> AVAudioPlayer? {
        guard let url = Bundle.main.url(forResource: effect.rawValue, withExtension: "m4a") else {
            return nil
        }
        let player = try? AVAudioPlayer(contentsOf: url)
        player?.prepareToPlay()
        return player
    }
}
