import Foundation
import Adhan

/// Prayer times, worked out on the phone with adhan-swift.
/// Method ids, names and the region suggestions match the web app (app.js) and the Android app
/// (PrayerEngine.kt), so all three give the same times.
enum Method: String, CaseIterable, Identifiable {
    case muslimWorldLeague = "MuslimWorldLeague", northAmerica = "NorthAmerica", moonsightingCommittee = "MoonsightingCommittee",
         egyptian = "Egyptian", karachi = "Karachi", ummAlQura = "UmmAlQura", dubai = "Dubai", qatar = "Qatar", kuwait = "Kuwait",
         singapore = "Singapore", turkey = "Turkey", tehran = "Tehran"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .muslimWorldLeague: "Muslim World League"
        case .northAmerica: "ISNA (North America)"
        case .moonsightingCommittee: "Moonsighting Committee"
        case .egyptian: "Egyptian General Authority"
        case .karachi: "Karachi (University of Islamic Sciences)"
        case .ummAlQura: "Umm al-Qura, Makkah"
        case .dubai: "Dubai"
        case .qatar: "Qatar"
        case .kuwait: "Kuwait"
        case .singapore: "Singapore, Malaysia, Indonesia"
        case .turkey: "Diyanet (Turkey)"
        case .tehran: "Tehran (Institute of Geophysics)"
        }
    }

    var parameters: CalculationParameters {
        switch self {
        case .muslimWorldLeague: CalculationMethod.muslimWorldLeague.params
        case .northAmerica: CalculationMethod.northAmerica.params
        case .moonsightingCommittee: CalculationMethod.moonsightingCommittee.params
        case .egyptian: CalculationMethod.egyptian.params
        case .karachi: CalculationMethod.karachi.params
        case .ummAlQura: CalculationMethod.ummAlQura.params
        case .dubai: CalculationMethod.dubai.params
        case .qatar: CalculationMethod.qatar.params
        case .kuwait: CalculationMethod.kuwait.params
        case .singapore: CalculationMethod.singapore.params
        case .turkey: CalculationMethod.turkey.params
        case .tehran: CalculationMethod.tehran.params
        }
    }

    // [south, north, west, east] — smaller areas first, as in the web app
    private static let regions: [([Double], Method)] = [
        ([24.4, 26.2, 50.7, 51.7], .qatar), ([28.5, 30.1, 46.5, 48.5], .kuwait),
        ([22.6, 26.1, 51.5, 56.4], .dubai), ([16.0, 32.2, 34.5, 55.7], .ummAlQura),
        ([22.0, 31.7, 25.0, 35.0], .egyptian), ([35.8, 42.2, 26.0, 44.8], .turkey),
        ([25.0, 39.8, 44.0, 63.3], .tehran), ([5.0, 37.1, 60.5, 92.7], .karachi),
        ([-11.0, 7.5, 95.0, 141.1], .singapore), ([49.8, 61.0, -11.0, 2.0], .moonsightingCommittee),
        ([14.5, 72.0, -170.0, -50.0], .northAmerica),
    ]

    /// A sensible default for where the user is; they can always choose another.
    static func suggested(lat: Double, lng: Double) -> Method {
        regions.first { b, _ in lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3] }?.1 ?? .muslimWorldLeague
    }
}

enum AsrSchool: String { case standard, hanafi }
enum HighLatitude: String { case auto, middleOfTheNight, seventhOfTheNight, twilightAngle }

struct PrayerSettings {
    var method: Method? = nil // nil: suggested for the location
    var asr: AsrSchool = .standard
    var highLatitude: HighLatitude = .auto
    var adjustments: [PrayerName: Int] = [:]
}

enum PrayerName: String, CaseIterable, Identifiable {
    case fajr = "Fajr", sunrise = "Sunrise", dhuhr = "Dhuhr", asr = "Asr", maghrib = "Maghrib", isha = "Isha"
    var id: String { rawValue }
    var en: String { rawValue }
    var ar: String {
        switch self { case .fajr: "الفجر"; case .sunrise: "الشروق"; case .dhuhr: "الظهر"; case .asr: "العصر"; case .maghrib: "المغرب"; case .isha: "العشاء" }
    }
    var minor: Bool { self == .sunrise }
}

struct Place: Equatable { var lat: Double; var lng: Double; var label: String }

/// The six times of one day.
struct DayTimes {
    let date: DateComponents
    let times: [PrayerName: Date]
    subscript(_ p: PrayerName) -> Date { times[p]! }
}

enum PrayerEngine {
    static func method(for place: Place, _ s: PrayerSettings) -> Method { s.method ?? Method.suggested(lat: place.lat, lng: place.lng) }

    /// As adhan-js (the web app): seventh of the night beyond 48° north or south. adhan-swift only checks the north.
    static func recommendedRule(lat: Double) -> HighLatitudeRule { abs(lat) > 48 ? .seventhOfTheNight : .middleOfTheNight }

    static func parameters(_ place: Place, _ s: PrayerSettings) -> CalculationParameters {
        var p = method(for: place, s).parameters
        p.madhab = s.asr == .hanafi ? .hanafi : .shafi
        switch s.highLatitude {
        case .auto: p.highLatitudeRule = recommendedRule(lat: place.lat)
        case .middleOfTheNight: p.highLatitudeRule = .middleOfTheNight
        case .seventhOfTheNight: p.highLatitudeRule = .seventhOfTheNight
        case .twilightAngle: p.highLatitudeRule = .twilightAngle
        }
        let a = s.adjustments
        p.adjustments = PrayerAdjustments(fajr: a[.fajr] ?? 0, sunrise: a[.sunrise] ?? 0, dhuhr: a[.dhuhr] ?? 0,
                                          asr: a[.asr] ?? 0, maghrib: a[.maghrib] ?? 0, isha: a[.isha] ?? 0)
        return p
    }

    static func times(_ date: DateComponents, _ place: Place, _ s: PrayerSettings) -> DayTimes? {
        times(date, place, parameters(place, s))
    }

    static func times(_ date: DateComponents, _ place: Place, _ params: CalculationParameters) -> DayTimes? {
        let day = DateComponents(year: date.year, month: date.month, day: date.day)
        guard let t = Adhan.PrayerTimes(coordinates: Coordinates(latitude: place.lat, longitude: place.lng), date: day, calculationParameters: params)
        else { return nil }
        return DayTimes(date: day, times: [.fajr: t.fajr, .sunrise: t.sunrise, .dhuhr: t.dhuhr, .asr: t.asr, .maghrib: t.maghrib, .isha: t.isha])
    }

    /// Degrees clockwise from true north.
    static func qibla(_ place: Place) -> Double { Qibla(coordinates: Coordinates(latitude: place.lat, longitude: place.lng)).direction }
}

/// The next prayer from `now`, and the prayer whose time we're in (nil between sunrise and Dhuhr). Same rules as the web app.
struct Upcoming { let next: PrayerName; let at: Date; let tomorrow: Bool; let current: PrayerName? }

func upcoming(now: Date, place: Place, settings s: PrayerSettings, calendar: Calendar) -> Upcoming? {
    let today = calendar.dateComponents([.year, .month, .day], from: now)
    guard let t = PrayerEngine.times(today, place, s) else { return nil }
    var current: PrayerName? = nil
    for p in PrayerName.allCases where t[p] <= now { current = p.minor ? nil : p }
    if now < t[.fajr] { current = .isha } // before Fajr it is still last night's Isha
    if let next = PrayerName.allCases.first(where: { t[$0] > now }) {
        return Upcoming(next: next, at: t[next], tomorrow: false, current: current)
    }
    let tomorrowDate = calendar.date(byAdding: .day, value: 1, to: now)!
    guard let t2 = PrayerEngine.times(calendar.dateComponents([.year, .month, .day], from: tomorrowDate), place, s) else { return nil }
    return Upcoming(next: .fajr, at: t2[.fajr], tomorrow: true, current: current)
}

func countdown(_ seconds: TimeInterval) -> String {
    let m = max(0, Int((seconds / 60).rounded(.up)))
    if m < 1 { return "in less than a minute" }
    let h = m / 60, r = m % 60
    return ("in " + (h > 0 ? "\(h) h " : "") + (r > 0 || h == 0 ? "\(r) min" : "")).trimmingCharacters(in: .whitespaces)
}
