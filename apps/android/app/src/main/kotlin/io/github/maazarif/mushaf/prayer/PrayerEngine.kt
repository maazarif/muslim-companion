package io.github.maazarif.mushaf.prayer

import com.batoulapps.adhan2.CalculationMethod
import com.batoulapps.adhan2.CalculationParameters
import com.batoulapps.adhan2.Coordinates
import com.batoulapps.adhan2.HighLatitudeRule
import com.batoulapps.adhan2.Madhab
import com.batoulapps.adhan2.PrayerAdjustments
import com.batoulapps.adhan2.PrayerTimes
import com.batoulapps.adhan2.Qibla
import com.batoulapps.adhan2.data.DateComponents
import java.time.LocalDate

/**
 * Prayer times, worked out on the phone with adhan2 (vendored, see com/batoulapps/adhan2/VENDORED.md).
 * Method ids, names and the region suggestions match the web app (app.js), so the two give the same times.
 */
enum class Method(val id: String, val title: String, val note: String) {
    MuslimWorldLeague("MuslimWorldLeague", "Muslim World League", "Fajr 18°, Isha 17°. Widely used in Europe, the Far East and parts of the Americas."),
    NorthAmerica("NorthAmerica", "ISNA (North America)", "Fajr 15°, Isha 15°. Used by many masjids in the US and Canada."),
    MoonsightingCommittee("MoonsightingCommittee", "Moonsighting Committee", "18° with seasonal adjustments. Often recommended for North America and the UK."),
    Egyptian("Egyptian", "Egyptian General Authority", "Fajr 19.5°, Isha 17.5°. Egypt, Syria, Lebanon, parts of Africa."),
    Karachi("Karachi", "Karachi (University of Islamic Sciences)", "Fajr 18°, Isha 18°. Pakistan, India, Bangladesh, Afghanistan."),
    UmmAlQura("UmmAlQura", "Umm al-Qura, Makkah", "Fajr 18.5°, Isha 90 minutes after Maghrib. Saudi Arabia. In Ramadan, add +30 to Isha."),
    Dubai("Dubai", "Dubai", "18.2° with small offsets. United Arab Emirates."),
    Qatar("Qatar", "Qatar", "Fajr 18°, Isha 90 minutes after Maghrib."),
    Kuwait("Kuwait", "Kuwait", "Fajr 18°, Isha 17.5°."),
    Singapore("Singapore", "Singapore, Malaysia, Indonesia", "Fajr 20°, Isha 18°."),
    Turkey("Turkey", "Diyanet (Turkey)", "An approximation of the Diyanet method, less accurate outside Turkey."),
    Tehran("Tehran", "Tehran (Institute of Geophysics)", "Fajr 17.7°, Isha 14°, Maghrib 4.5°.");

    fun parameters(): CalculationParameters = when (this) {
        MuslimWorldLeague -> CalculationMethod.MUSLIM_WORLD_LEAGUE.parameters
        NorthAmerica -> CalculationMethod.NORTH_AMERICA.parameters
        MoonsightingCommittee -> CalculationMethod.MOON_SIGHTING_COMMITTEE.parameters
        Egyptian -> CalculationMethod.EGYPTIAN.parameters
        Karachi -> CalculationMethod.KARACHI.parameters
        UmmAlQura -> CalculationMethod.UMM_AL_QURA.parameters
        Dubai -> CalculationMethod.DUBAI.parameters
        Qatar -> CalculationMethod.QATAR.parameters
        Kuwait -> CalculationMethod.KUWAIT.parameters
        Singapore -> CalculationMethod.SINGAPORE.parameters
        Turkey -> CalculationMethod.TURKEY.parameters
        // adhan2 has no Tehran method: the same values as adhan-js
        Tehran -> CalculationParameters(fajrAngle = 17.7, ishaAngle = 14.0, method = CalculationMethod.OTHER, maghribAngle = 4.5)
    }

    companion object {
        fun byId(id: String?): Method? = entries.firstOrNull { it.id == id }

        // [south, north, west, east] — smaller areas first, as in the web app
        private val REGIONS = listOf(
            doubleArrayOf(24.4, 26.2, 50.7, 51.7) to Qatar, doubleArrayOf(28.5, 30.1, 46.5, 48.5) to Kuwait,
            doubleArrayOf(22.6, 26.1, 51.5, 56.4) to Dubai, doubleArrayOf(16.0, 32.2, 34.5, 55.7) to UmmAlQura,
            doubleArrayOf(22.0, 31.7, 25.0, 35.0) to Egyptian, doubleArrayOf(35.8, 42.2, 26.0, 44.8) to Turkey,
            doubleArrayOf(25.0, 39.8, 44.0, 63.3) to Tehran, doubleArrayOf(5.0, 37.1, 60.5, 92.7) to Karachi,
            doubleArrayOf(-11.0, 7.5, 95.0, 141.1) to Singapore, doubleArrayOf(49.8, 61.0, -11.0, 2.0) to MoonsightingCommittee,
            doubleArrayOf(14.5, 72.0, -170.0, -50.0) to NorthAmerica
        )
        /** A sensible default for where the user is; they can always choose another. */
        fun suggestedFor(lat: Double, lng: Double): Method =
            REGIONS.firstOrNull { (b, _) -> lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3] }?.second ?: MuslimWorldLeague
    }
}

enum class AsrSchool { Standard, Hanafi }
enum class HighLatitude { Auto, MiddleOfTheNight, SeventhOfTheNight, TwilightAngle }

data class PrayerSettings(
    val method: Method? = null, // null: suggested for the location
    val asr: AsrSchool = AsrSchool.Standard,
    val highLatitude: HighLatitude = HighLatitude.Auto,
    val adjustments: Map<Prayer, Int> = emptyMap()
)

enum class Prayer(val en: String, val ar: String, val minor: Boolean = false) {
    Fajr("Fajr", "الفجر"), Sunrise("Sunrise", "الشروق", minor = true), Dhuhr("Dhuhr", "الظهر"),
    Asr("Asr", "العصر"), Maghrib("Maghrib", "المغرب"), Isha("Isha", "العشاء")
}

data class Place(val lat: Double, val lng: Double, val label: String)

/** The six times of one day, as epoch milliseconds (UTC). */
data class DayTimes(val date: LocalDate, val times: Map<Prayer, Long>) {
    operator fun get(p: Prayer): Long = times.getValue(p)
}

object PrayerEngine {
    fun methodFor(place: Place, s: PrayerSettings): Method = s.method ?: Method.suggestedFor(place.lat, place.lng)

    fun parameters(place: Place, s: PrayerSettings): CalculationParameters {
        val coords = Coordinates(place.lat, place.lng)
        val adj = s.adjustments
        return methodFor(place, s).parameters().copy(
            madhab = if (s.asr == AsrSchool.Hanafi) Madhab.HANAFI else Madhab.SHAFI,
            highLatitudeRule = when (s.highLatitude) {
                HighLatitude.Auto -> HighLatitudeRule.recommendedFor(coords)
                HighLatitude.MiddleOfTheNight -> HighLatitudeRule.MIDDLE_OF_THE_NIGHT
                HighLatitude.SeventhOfTheNight -> HighLatitudeRule.SEVENTH_OF_THE_NIGHT
                HighLatitude.TwilightAngle -> HighLatitudeRule.TWILIGHT_ANGLE
            },
            prayerAdjustments = PrayerAdjustments(
                fajr = adj[Prayer.Fajr] ?: 0, sunrise = adj[Prayer.Sunrise] ?: 0, dhuhr = adj[Prayer.Dhuhr] ?: 0,
                asr = adj[Prayer.Asr] ?: 0, maghrib = adj[Prayer.Maghrib] ?: 0, isha = adj[Prayer.Isha] ?: 0
            )
        )
    }

    fun timesFor(date: LocalDate, place: Place, s: PrayerSettings): DayTimes = timesFor(date, place, parameters(place, s))

    fun timesFor(date: LocalDate, place: Place, params: CalculationParameters): DayTimes {
        val t = PrayerTimes(Coordinates(place.lat, place.lng), DateComponents(date.year, date.monthValue, date.dayOfMonth), params)
        return DayTimes(date, mapOf(
            Prayer.Fajr to t.fajr.toEpochMilliseconds(), Prayer.Sunrise to t.sunrise.toEpochMilliseconds(),
            Prayer.Dhuhr to t.dhuhr.toEpochMilliseconds(), Prayer.Asr to t.asr.toEpochMilliseconds(),
            Prayer.Maghrib to t.maghrib.toEpochMilliseconds(), Prayer.Isha to t.isha.toEpochMilliseconds()
        ))
    }

    /** Degrees clockwise from true north. */
    fun qibla(place: Place): Double = Qibla(Coordinates(place.lat, place.lng)).direction
}
