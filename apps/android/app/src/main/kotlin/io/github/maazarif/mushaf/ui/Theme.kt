package io.github.maazarif.mushaf.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import io.github.maazarif.mushaf.R

/** The colour tokens of the web app (styles.css :root), light and dark. */
@Immutable
data class Palette(
    val ground: Color, val paper: Color, val ink: Color, val muted: Color, val frame: Color,
    val gilt: Color, val line: Color, val chip: Color, val cur: Color, val danger: Color
)

val Light = Palette(
    ground = Color(0xFFE3E8E2), paper = Color(0xFFFBF8EE), ink = Color(0xFF1D2421), muted = Color(0xFF5F6D66),
    frame = Color(0xFF1F5A4B), gilt = Color(0xFFA8833A), line = Color(0xFFCFD8D0), chip = Color(0xFFEEF2EC),
    cur = Color(0x1F1F5A4B), danger = Color(0xFF9B2C2C)
)
val Dark = Palette(
    ground = Color(0xFF0C1311), paper = Color(0xFF161F1C), ink = Color(0xFFEBE4CF), muted = Color(0xFF9AA89F),
    frame = Color(0xFF4F9A83), gilt = Color(0xFFCFAE62), line = Color(0xFF2A3632), chip = Color(0xFF1E2A26),
    cur = Color(0x2978C8AA), danger = Color(0xFFE08A8A)
)

val LocalPalette = staticCompositionLocalOf { Light }

val Figtree = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold)
)
val Amiri = FontFamily(Font(R.font.amiri_regular, FontWeight.Normal), Font(R.font.amiri_bold, FontWeight.Bold))

@Composable
fun CompanionTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val p = if (dark) Dark else Light
    val scheme = if (dark) darkColorScheme(primary = p.frame, background = p.ground, surface = p.paper, onSurface = p.ink, onBackground = p.ink)
                 else lightColorScheme(primary = p.frame, background = p.ground, surface = p.paper, onSurface = p.ink, onBackground = p.ink)
    androidx.compose.runtime.CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
