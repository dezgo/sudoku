package com.derekgillett.sudoku.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import com.derekgillett.sudoku.R

/**
 * Plays short interface sounds via SoundPool. Reads the "Sound effects"
 * preference each time so toggling it in Settings takes effect immediately.
 *
 * Uses USAGE_GAME / CONTENT_TYPE_SONIFICATION so cues ride the media volume
 * stream — users can quiet them via the volume rocker. Mirrors iOS, which
 * uses AVAudioSession's `.ambient` category for the same effect.
 */
class SoundManager(context: Context) {

    enum class Effect(val resId: Int) {
        PLACE(R.raw.sfx_place),
        ERASE(R.raw.sfx_erase),
        MISTAKE(R.raw.sfx_mistake),
        UNIT_COMPLETE(R.raw.sfx_unit_complete),
        SOLVED(R.raw.sfx_solved)
    }

    private val pool: SoundPool
    private val ids = HashMap<Effect, Int>()
    private var enabled: Boolean = true

    init {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        pool = SoundPool.Builder()
            .setMaxStreams(4)
            .setAudioAttributes(attrs)
            .build()
        // Preload all five effects up-front; they're tiny.
        val app = context.applicationContext
        for (effect in Effect.entries) {
            ids[effect] = pool.load(app, effect.resId, 1)
        }
    }

    fun setEnabled(value: Boolean) {
        enabled = value
    }

    fun play(effect: Effect) {
        if (!enabled) return
        val id = ids[effect] ?: return
        pool.play(id, 1f, 1f, 1, 0, 1f)
    }
}
