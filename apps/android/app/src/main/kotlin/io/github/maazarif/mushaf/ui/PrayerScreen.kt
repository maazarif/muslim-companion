package io.github.maazarif.mushaf.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import io.github.maazarif.mushaf.prayer.Hijri
import io.github.maazarif.mushaf.prayer.Place
import io.github.maazarif.mushaf.prayer.Prayer
import io.github.maazarif.mushaf.prayer.PrayerEngine
import io.github.maazarif.mushaf.prayer.PrayerSettings
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.round

/** Where the user is, kept on the phone (SharedPreferences). */
object Places {
    private fun prefs(c: Context) = c.getSharedPreferences("prayer", Context.MODE_PRIVATE)
    fun load(c: Context): Place? = prefs(c).run {
        if (!contains("lat")) null else Place(getFloat("lat", 0f).toDouble(), getFloat("lng", 0f).toDouble(), getString("label", "My location")!!)
    }
    fun save(c: Context, p: Place) = prefs(c).edit().putFloat("lat", p.lat.toFloat()).putFloat("lng", p.lng.toFloat()).putString("label", p.label).apply()
}

private fun round4(x: Double) = round(x * 1e4) / 1e4

/** The next prayer from `now`, and the prayer whose time we're in (null between sunrise and Dhuhr). */
data class Upcoming(val next: Prayer, val at: Long, val tomorrow: Boolean, val current: Prayer?)

fun upcoming(now: Long, place: Place, s: PrayerSettings, zone: ZoneId): Upcoming {
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    val t = PrayerEngine.timesFor(today, place, s)
    var current: Prayer? = null
    for (p in Prayer.entries) if (t[p] <= now) current = if (p.minor) null else p
    if (now < t[Prayer.Fajr]) current = Prayer.Isha // before Fajr it is still last night's Isha
    val next = Prayer.entries.firstOrNull { t[it] > now }
    return if (next != null) Upcoming(next, t[next], false, current)
    else Upcoming(Prayer.Fajr, PrayerEngine.timesFor(today.plusDays(1), place, s)[Prayer.Fajr], true, current)
}

fun countdown(ms: Long): String {
    val m = Math.max(0, Math.ceil(ms / 60000.0).toLong())
    if (m < 1) return "in less than a minute"
    val h = m / 60; val r = m % 60
    return ("in " + (if (h > 0) "$h h " else "") + (if (r > 0 || h == 0L) "$r min" else "")).trim()
}

@Composable
fun PrayerScreen() {
    val ctx = LocalContext.current
    val c = LocalPalette.current
    var place by remember { mutableStateOf(Places.load(ctx)) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1000) } }

    fun locate() {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { lm.isProviderEnabled(it) }
        if (provider == null) { error = "Location is turned off. Turn it on in your phone's settings."; return }
        try {
            LocationManagerCompat.getCurrentLocation(lm, provider, null as androidx.core.os.CancellationSignal?, ContextCompat.getMainExecutor(ctx)) { loc: android.location.Location? ->
                if (loc == null) error = "Couldn't get your location just now. Try again."
                else { val p = Place(round4(loc.latitude), round4(loc.longitude), "My location"); Places.save(ctx, p); place = p; error = null }
            }
        } catch (e: SecurityException) { error = "Location permission was turned off." }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) locate() else error = "Location permission was turned off. Allow it in Settings, or try again."
    }

    Column(
        Modifier.fillMaxSize().background(c.ground).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Header()
        val p = place
        if (p == null) {
            Card {
                Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("بِسْمِ اللَّهِ", style = TextStyle(fontFamily = Amiri, fontSize = 28.sp, color = c.frame))
                    Text("Where are you?", style = ui(20, FontWeight.Bold, c.ink))
                    Text("Prayer times are worked out for your exact location. Your location stays on this phone.", style = ui(15, color = c.muted), textAlign = TextAlign.Center)
                    Button(onClick = {
                        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) locate()
                        else ask.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                    }, colors = ButtonDefaults.buttonColors(containerColor = c.frame, contentColor = c.paper), modifier = Modifier.testTag("useLocation")) {
                        Text("Use my location", style = ui(15, FontWeight.SemiBold, c.paper))
                    }
                    error?.let { Text(it, style = ui(14, color = c.danger), textAlign = TextAlign.Center) }
                }
            }
        } else {
            val zone = ZoneId.systemDefault()
            val s = PrayerSettings()
            val today = LocalDate.now(zone)
            val times = PrayerEngine.timesFor(today, p, s)
            val u = upcoming(now, p, s, zone)
            val fmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
            fun clock(ms: Long) = fmt.format(Instant.ofEpochMilli(ms).atZone(zone)).replace(' ', ' ')

            Framed {
                Column(Modifier.fillMaxWidth().padding(vertical = 22.dp, horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("NEXT", style = ui(11, FontWeight.Bold, c.muted).copy(letterSpacing = 1.8.sp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(u.next.en, style = ui(24, FontWeight.Bold, c.ink), modifier = Modifier.testTag("nextName"))
                        Text(u.next.ar, style = TextStyle(fontFamily = Amiri, fontSize = 26.sp, color = c.frame))
                    }
                    Text(clock(u.at), style = ui(42, FontWeight.Bold, c.ink), modifier = Modifier.testTag("nextAt"))
                    Text(countdown(u.at - now), style = ui(15, FontWeight.SemiBold, c.frame), modifier = Modifier.testTag("countdown"))
                    Spacer(Modifier.height(12.dp)); Box(Modifier.fillMaxWidth().height(1.dp).background(c.line)); Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(Hijri.arabic(today), style = TextStyle(fontFamily = Amiri, fontSize = 17.sp, color = c.ink))
                        Text("·", style = ui(14, color = c.muted))
                        Text(DateTimeFormatter.ofPattern("EEEE d MMMM").format(today), style = ui(14, color = c.muted))
                    }
                    Text(Hijri.english(today), style = ui(13, color = c.muted), modifier = Modifier.testTag("hijri"))
                }
            }
            Card {
                Column(Modifier.padding(6.dp)) {
                    for (pr in Prayer.entries) {
                        val isNow = u.current == pr
                        val isNext = !u.tomorrow && u.next == pr
                        Row(
                            Modifier.fillMaxWidth().background(if (isNow) c.cur else c.paper, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 12.dp).testTag("row_${pr.name}"),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Text(pr.en, style = ui(16, if (pr.minor) FontWeight.Normal else FontWeight.SemiBold, if (pr.minor) c.muted else c.ink))
                                if (isNow) Badge("NOW", filled = true)
                                if (isNext) Badge("NEXT", filled = false)
                            }
                            Text(pr.ar, style = TextStyle(fontFamily = Amiri, fontSize = 18.sp, color = c.muted))
                            Spacer(Modifier.width(12.dp))
                            Text(clock(times[pr]), style = ui(17, if (pr.minor) FontWeight.Normal else FontWeight.Bold, if (isNext) c.frame else if (pr.minor) c.muted else c.ink),
                                textAlign = TextAlign.End, modifier = Modifier.width(88.dp).testTag("time_${pr.name}"))
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(p.label)
                Pill(PrayerEngine.methodFor(p, s).title)
            }
            Text("Preview of the native app. Settings, notifications, the qibla and the Quran come next.", style = ui(13, color = c.muted))
        }
    }
}

@Composable private fun Header() {
    val c = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        BrandMark(Modifier.width(30.dp).height(30.dp))
        Text("PREVIEW", style = ui(12, FontWeight.Bold, c.muted).copy(letterSpacing = 2.sp))
    }
}

@Composable fun Card(content: @Composable () -> Unit) {
    val c = LocalPalette.current
    Box(Modifier.fillMaxWidth().background(c.paper, RoundedCornerShape(18.dp)).border(1.dp, c.line, RoundedCornerShape(18.dp))) { content() }
}

/** The paper card with the Mushaf's green and gilt rules. */
@Composable fun Framed(content: @Composable () -> Unit) {
    val c = LocalPalette.current
    Box(Modifier.fillMaxWidth().background(c.paper, RoundedCornerShape(6.dp))) {
        Box(Modifier.matchParentSize().padding(7.dp).border(BorderStroke(2.dp, c.frame), RoundedCornerShape(3.dp)))
        Box(Modifier.matchParentSize().padding(11.dp).border(BorderStroke(1.dp, c.gilt), RoundedCornerShape(2.dp)))
        content()
    }
}

@Composable private fun Badge(text: String, filled: Boolean) {
    val c = LocalPalette.current
    Spacer(Modifier.width(8.dp))
    Text(text, style = ui(10, FontWeight.Bold, if (filled) c.paper else c.frame).copy(letterSpacing = 1.2.sp),
        modifier = (if (filled) Modifier.background(c.frame, RoundedCornerShape(50)) else Modifier.border(1.dp, c.frame, RoundedCornerShape(50)))
            .padding(horizontal = 7.dp, vertical = 2.dp))
}

@Composable private fun Pill(text: String) {
    val c = LocalPalette.current
    Text(text, style = ui(13, FontWeight.SemiBold, c.ink), maxLines = 1,
        modifier = Modifier.background(c.paper, RoundedCornerShape(50)).border(1.dp, c.line, RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 8.dp))
}

fun ui(size: Int, weight: FontWeight = FontWeight.Normal, color: androidx.compose.ui.graphics.Color) =
    TextStyle(fontFamily = Figtree, fontSize = size.sp, fontWeight = weight, color = color)
