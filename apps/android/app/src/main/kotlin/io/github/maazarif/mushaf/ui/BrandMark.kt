package io.github.maazarif.mushaf.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.rotate

/** The eight-pointed star of the web app's header (index.html .mark), drawn on a 32-unit grid. */
@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    val c = LocalPalette.current
    Canvas(modifier) {
        val u = size.minDimension / 32f
        val tl = Offset(7f * u, 7f * u); val sz = Size(18f * u, 18f * u); val r = CornerRadius(1.5f * u)
        drawRoundRect(c.gilt, tl, sz, r)
        rotate(45f) { drawRoundRect(c.gilt, tl, sz, r) }
        drawCircle(c.paper, 5.2f * u, center)
        drawCircle(c.frame, 2.2f * u, center)
    }
}
