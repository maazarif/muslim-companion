package io.github.maazarif.mushaf

import io.github.maazarif.mushaf.prayer.Place
import io.github.maazarif.mushaf.prayer.Prayer
import io.github.maazarif.mushaf.prayer.PrayerEngine
import io.github.maazarif.mushaf.prayer.PrayerSettings
import io.github.maazarif.mushaf.ui.countdown
import io.github.maazarif.mushaf.ui.upcoming
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/** "Next" and "Now" follow the web app's rules (app.js upcoming). */
class UpcomingTest {
    private val london = Place(51.5074, -0.1278, "London")
    private val zone = ZoneId.of("Europe/London")
    private val s = PrayerSettings()
    private val day = LocalDate.of(2026, 11, 19)
    private val t = PrayerEngine.timesFor(day, london, s)

    @Test fun beforeFajrIsStillIsha() {
        val u = upcoming(t[Prayer.Fajr] - 60_000, london, s, zone)
        assertEquals(Prayer.Fajr, u.next); assertEquals(Prayer.Isha, u.current); assertFalse(u.tomorrow)
    }
    @Test fun betweenSunriseAndDhuhrNoPrayerIsCurrent() {
        val u = upcoming(t[Prayer.Sunrise] + 60_000, london, s, zone)
        assertEquals(Prayer.Dhuhr, u.next); assertNull(u.current)
    }
    @Test fun afterIshaNextIsTomorrowsFajr() {
        val u = upcoming(t[Prayer.Isha] + 60_000, london, s, zone)
        assertEquals(Prayer.Fajr, u.next); assertTrue(u.tomorrow); assertEquals(Prayer.Isha, u.current)
        assertEquals(PrayerEngine.timesFor(day.plusDays(1), london, s)[Prayer.Fajr], u.at)
    }
    @Test fun countdownText() {
        assertEquals("in less than a minute", countdown(0))
        assertEquals("in 5 min", countdown(4 * 60_000 + 1))
        assertEquals("in 2 h", countdown(120 * 60_000L))
        assertEquals("in 1 h 3 min", countdown(63 * 60_000L))
    }
}
