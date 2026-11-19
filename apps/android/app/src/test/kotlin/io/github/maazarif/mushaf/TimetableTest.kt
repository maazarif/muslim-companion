package io.github.maazarif.mushaf

import com.batoulapps.adhan2.CalculationParameters
import com.batoulapps.adhan2.HighLatitudeRule
import com.batoulapps.adhan2.Madhab
import io.github.maazarif.mushaf.prayer.Method
import io.github.maazarif.mushaf.prayer.Place
import io.github.maazarif.mushaf.prayer.Prayer
import io.github.maazarif.mushaf.prayer.PrayerEngine
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The same published timetables the web app is tested against (tests/fixtures/adhan, from adhan's Shared/Times):
 * every prayer on every listed date must match to the minute, or within the file's stated variance.
 */
class TimetableTest {
    private val fixtures = File("../../../tests/fixtures/adhan")
    private val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.US)

    private fun minutes(s: String): Int {
        val m = Regex("""(\d+):(\d+) (AM|PM)""").find(s)!!.groupValues
        return (m[1].toInt() % 12 + if (m[3] == "PM") 12 else 0) * 60 + m[2].toInt()
    }

    private fun paramsFor(p: JSONObject): CalculationParameters {
        val method = Method.byId(p.getString("method")) ?: error("unknown method ${p.getString("method")}")
        return method.parameters().copy(
            madhab = if (p.optString("madhab") == "Hanafi") Madhab.HANAFI else Madhab.SHAFI,
            // as in the web test: the file's rule, or middle of the night
            highLatitudeRule = when (p.optString("highLatitudeRule")) {
                "SeventhOfTheNight" -> HighLatitudeRule.SEVENTH_OF_THE_NIGHT
                "TwilightAngle" -> HighLatitudeRule.TWILIGHT_ANGLE
                else -> HighLatitudeRule.MIDDLE_OF_THE_NIGHT
            }
        )
    }

    @Test
    fun everyPublishedTimeMatches() {
        val files = fixtures.listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }
        assertEquals("the eight reference timetables", 8, files.size)
        var checked = 0
        val failures = mutableListOf<String>()
        for (f in files) {
            val d = JSONObject(f.readText())
            val p = d.getJSONObject("params")
            val params = paramsFor(p)
            val zone = ZoneId.of(p.getString("timezone"))
            val place = Place(p.getDouble("latitude"), p.getDouble("longitude"), f.name)
            val variance = d.optInt("variance", 0)
            val times = d.getJSONArray("times")
            for (i in 0 until times.length()) {
                val t = times.getJSONObject(i)
                val day = PrayerEngine.timesFor(LocalDate.parse(t.getString("date")), place, params)
                for (prayer in Prayer.entries) {
                    checked++
                    val got = clock.format(Instant.ofEpochMilli(day[prayer]).atZone(zone))
                    val want = t.getString(prayer.name.lowercase())
                    var diff = kotlin.math.abs(minutes(got) - minutes(want))
                    diff = minOf(diff, 1440 - diff)
                    if (diff > variance) failures += "${f.name} ${t.getString("date")} ${prayer.name}: got $got, expected $want"
                }
            }
        }
        assertTrue("${failures.size} of $checked times differ:\n" + failures.take(20).joinToString("\n"), failures.isEmpty())
        assertEquals("all 2,772 times checked", 2772, checked)
    }

    @Test
    fun qiblaMatchesAdhanReferenceBearings() {
        // the same reference values as the web app's qibla test (adhan's own tests)
        val refs = listOf(Triple(51.5074, -0.1278, 119), Triple(40.7128, -74.0059, 58), Triple(-33.8688, 151.2093, 277),
            Triple(33.7294, 73.0931, 256), Triple(61.2181, -149.9003, 351))
        for ((lat, lng, want) in refs) assertEquals("qibla at $lat,$lng", want, Math.round(PrayerEngine.qibla(Place(lat, lng, ""))).toInt())
    }

    @Test
    fun methodSuggestionMatchesTheWebApp() {
        assertEquals(Method.UmmAlQura, Method.suggestedFor(21.4225, 39.8262))
        assertEquals(Method.MoonsightingCommittee, Method.suggestedFor(51.5074, -0.1278))
        assertEquals(Method.NorthAmerica, Method.suggestedFor(47.6062, -122.3321))
        assertEquals(Method.Karachi, Method.suggestedFor(24.8607, 67.0011))
        assertEquals(Method.Qatar, Method.suggestedFor(25.2854, 51.531))
        assertEquals(Method.MuslimWorldLeague, Method.suggestedFor(48.8566, 2.3522))
    }
}
