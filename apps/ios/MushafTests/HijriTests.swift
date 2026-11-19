import XCTest
@testable import Mushaf

/// The same dates the web and Android apps check (Umm al-Qura).
final class HijriTests: XCTestCase {
    private func d(_ y: Int, _ m: Int, _ day: Int) -> DateComponents { DateComponents(year: y, month: m, day: day) }

    func testKnownDates() {
        XCTAssertEqual(Hijri.english(d(2016, 3, 5)), "25 Jumada al-Ula 1437 AH")
        XCTAssertEqual(Hijri.arabic(d(2016, 3, 5)), "٢٥ جمادى الأولى ١٤٣٧ هـ")
        XCTAssertEqual(Hijri.parts(d(2027, 2, 8)), Hijri.Parts(day: 1, month: 9, year: 1448))   // 1 Ramadan 1448
        XCTAssertEqual(Hijri.parts(d(2026, 2, 18)), Hijri.Parts(day: 1, month: 9, year: 1447))  // 1 Ramadan 1447
        XCTAssertEqual(Hijri.parts(d(2027, 3, 6)), Hijri.Parts(day: 27, month: 9, year: 1448))  // 27 Ramadan 1448
    }
    func testAdjustmentShiftsTheDay() {
        XCTAssertEqual(Hijri.parts(d(2027, 2, 8), adjust: 1), Hijri.Parts(day: 2, month: 9, year: 1448))
        XCTAssertEqual(Hijri.parts(d(2027, 2, 8), adjust: -1), Hijri.Parts(day: 30, month: 8, year: 1448)) // Sha'ban 1448 has 30 days
    }
}
