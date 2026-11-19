import XCTest
@testable import Mushaf

/// "Next" and "Now" follow the web app's rules (app.js upcoming), as UpcomingTest.kt does on Android.
final class UpcomingTests: XCTestCase {
    private let london = Place(lat: 51.5074, lng: -0.1278, label: "London")
    private let s = PrayerSettings()
    private var cal: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Europe/London")!; return c }
    private var t: DayTimes { PrayerEngine.times(DateComponents(year: 2026, month: 11, day: 19), london, s)! }

    func testBeforeFajrIsStillIsha() {
        let u = upcoming(now: t[.fajr].addingTimeInterval(-60), place: london, settings: s, calendar: cal)!
        XCTAssertEqual(u.next, .fajr); XCTAssertEqual(u.current, .isha); XCTAssertFalse(u.tomorrow)
    }
    func testBetweenSunriseAndDhuhrNoPrayerIsCurrent() {
        let u = upcoming(now: t[.sunrise].addingTimeInterval(60), place: london, settings: s, calendar: cal)!
        XCTAssertEqual(u.next, .dhuhr); XCTAssertNil(u.current)
    }
    func testAfterIshaNextIsTomorrowsFajr() {
        let u = upcoming(now: t[.isha].addingTimeInterval(60), place: london, settings: s, calendar: cal)!
        XCTAssertEqual(u.next, .fajr); XCTAssertTrue(u.tomorrow); XCTAssertEqual(u.current, .isha)
        XCTAssertEqual(u.at, PrayerEngine.times(DateComponents(year: 2026, month: 11, day: 20), london, s)![.fajr])
    }
    /// Today's London times, the same as the web app's engine gives (checked against adhan-js 4.4.6).
    func testLondonTodayMatchesTheWebApp() {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = cal.timeZone; f.dateFormat = "h:mm a"
        XCTAssertEqual(PrayerName.allCases.map { f.string(from: t[$0]) }, ["5:46 AM", "7:25 AM", "11:51 AM", "1:44 PM", "4:09 PM", "5:37 PM"])
    }
    func testCountdownText() {
        XCTAssertEqual(countdown(0), "in less than a minute")
        XCTAssertEqual(countdown(4 * 60 + 0.06), "in 5 min")
        XCTAssertEqual(countdown(120 * 60), "in 2 h")
        XCTAssertEqual(countdown(63 * 60), "in 1 h 3 min")
    }
}
