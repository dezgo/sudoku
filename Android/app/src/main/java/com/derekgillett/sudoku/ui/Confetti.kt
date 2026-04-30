package com.derekgillett.sudoku.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Falling confetti shower. Particles randomized at first composition;
 * a per-frame loop drives time forward and a Canvas redraws each particle's
 * position, rotation, and opacity. Stops emitting once `durationMs` passes.
 */
@Composable
fun Confetti(
    modifier: Modifier = Modifier,
    count: Int = 90,
    durationMs: Int = 3000
) {
    val particles = remember {
        val palette = listOf(
            Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFF43A047),
            Color(0xFFFDD835), Color(0xFFFB8C00), Color(0xFFE91E63),
            Color(0xFF8E24AA), Color(0xFF00ACC1)
        )
        List(count) {
            ConfettiParticle(
                color = palette.random(),
                size = Random.nextFloat() * 6f + 7f,
                startX = Random.nextFloat(),
                driftX = Random.nextFloat() * 0.5f - 0.25f,
                startDelayMs = (Random.nextFloat() * 600).toInt(),
                rotation = Random.nextFloat() * 1080f - 540f,
                aspect = Random.nextFloat() * 0.5f + 0.4f
            )
        }
    }

    var elapsed by remember { mutableStateOf(0L) }
    LaunchedEffect(Unit) {
        val start = withFrameMillis { it }
        while (elapsed < durationMs) {
            val now = withFrameMillis { it }
            elapsed = now - start
        }
    }

    Canvas(modifier = modifier) {
        for (p in particles) {
            val local = elapsed - p.startDelayMs
            if (local <= 0) continue
            val progress = (local.toFloat() / durationMs).coerceIn(0f, 1f)
            val xFraction = p.startX + p.driftX * progress
            val x = xFraction * size.width
            val y = -20f + (size.height + 40f) * progress
            val opacity = (1f - progress * 0.9f).coerceAtLeast(0f)

            val rot = Math.toRadians(p.rotation.toDouble() * progress)
            val cosR = cos(rot).toFloat()
            val sinR = sin(rot).toFloat()
            val w = p.size
            val h = p.size * p.aspect

            // Compute the four rotated rectangle corners and draw via a path.
            val cx = x; val cy = y
            val hx = w / 2f; val hy = h / 2f
            val corners = listOf(
                Offset(cx + (-hx * cosR - -hy * sinR), cy + (-hx * sinR + -hy * cosR)),
                Offset(cx + (hx * cosR - -hy * sinR), cy + (hx * sinR + -hy * cosR)),
                Offset(cx + (hx * cosR - hy * sinR), cy + (hx * sinR + hy * cosR)),
                Offset(cx + (-hx * cosR - hy * sinR), cy + (-hx * sinR + hy * cosR))
            )

            // Draw as a quadrilateral using two triangles via drawPath.
            val path = androidx.compose.ui.graphics.Path().apply {
                moveTo(corners[0].x, corners[0].y)
                lineTo(corners[1].x, corners[1].y)
                lineTo(corners[2].x, corners[2].y)
                lineTo(corners[3].x, corners[3].y)
                close()
            }
            drawPath(path = path, color = p.color.copy(alpha = opacity))
        }
    }
}

private data class ConfettiParticle(
    val color: Color,
    val size: Float,
    val startX: Float,
    val driftX: Float,
    val startDelayMs: Int,
    val rotation: Float,
    val aspect: Float
)

