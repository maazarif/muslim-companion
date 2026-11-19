package io.github.maazarif.mushaf

import io.github.maazarif.mushaf.prayer.Hijri
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

/** The same dates the web app's tests check (Umm al-Qura). */
class HijriTest {
    @Test fun knownDates() {
        assertEquals("25 Jumada al-Ula 1437 AH", Hijri.english(LocalDate.of(2016, 3, 5)))
        assertEquals("٢٥ جمادى الأولى ١٤٣٧ هـ", Hijri.arabic(LocalDate.of(2016, 3, 5)))
        assertEquals(Hijri.Parts(1, 9, 1448), Hijri.parts(LocalDate.of(2027, 2, 8)))   // 1 Ramadan 1448
        assertEquals(Hijri.Parts(1, 9, 1447), Hijri.parts(LocalDate.of(2026, 2, 18)))  // 1 Ramadan 1447
        assertEquals(Hijri.Parts(27, 9, 1448), Hijri.parts(LocalDate.of(2027, 3, 6)))  // 27 Ramadan 1448
    }
    @Test fun adjustmentShiftsTheDay() {
        assertEquals(Hijri.Parts(2, 9, 1448), Hijri.parts(LocalDate.of(2027, 2, 8), adjust = 1))
        assertEquals(Hijri.Parts(30, 8, 1448), Hijri.parts(LocalDate.of(2027, 2, 8), adjust = -1)) // Sha'ban 1448 has 30 days
    }
}
