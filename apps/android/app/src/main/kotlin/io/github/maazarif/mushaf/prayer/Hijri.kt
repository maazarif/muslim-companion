package io.github.maazarif.mushaf.prayer

import java.time.LocalDate
import java.time.chrono.HijrahDate
import java.time.temporal.ChronoField

/** Hijri dates on the Umm al-Qura calendar (java.time's Hijrah chronology), as the web app uses. */
object Hijri {
    val MONTHS_EN = listOf("Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani", "Jumada al-Ula", "Jumada al-Akhirah",
        "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah")
    val MONTHS_AR = listOf("محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان",
        "شوال", "ذو القعدة", "ذو الحجة")

    data class Parts(val day: Int, val month: Int, val year: Int)

    /** adjust: the user's ±2 day shift for local moonsighting. */
    fun parts(date: LocalDate, adjust: Int = 0): Parts? = try {
        val h = HijrahDate.from(date.plusDays(adjust.toLong()))
        Parts(h.get(ChronoField.DAY_OF_MONTH), h.get(ChronoField.MONTH_OF_YEAR), h.get(ChronoField.YEAR))
    } catch (e: Exception) { null } // outside the calendar's range

    fun english(date: LocalDate, adjust: Int = 0): String =
        parts(date, adjust)?.let { "${it.day} ${MONTHS_EN[it.month - 1]} ${it.year} AH" } ?: ""

    fun arabic(date: LocalDate, adjust: Int = 0): String =
        parts(date, adjust)?.let { "${arabicDigits(it.day)} ${MONTHS_AR[it.month - 1]} ${arabicDigits(it.year)} هـ" } ?: ""

    fun arabicDigits(n: Int): String = n.toString().map { "٠١٢٣٤٥٦٧٨٩"[it - '0'] }.joinToString("")
}
