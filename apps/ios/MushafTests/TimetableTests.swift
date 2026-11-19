import XCTest
import Adhan
@testable import Mushaf

/// The same published timetables the web and Android apps are tested against (tests/fixtures/adhan):
/// every prayer on every listed date must match to the minute, or within the file's stated variance.
final class TimetableTests: XCTestCase {
    private let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("../../../tests/fixtures/adhan").standardizedFileURL

    private func minutes(_ s: String) -> Int {
        let parts = s.split(whereSeparator: { $0 == ":" || $0 == " " }).map(String.init)
        return (Int(parts[0])! % 12 + (parts[2] == "PM" ? 12 : 0)) * 60 + Int(parts[1])!
    }

    func testEveryPublishedTimeMatches() throws {
        let files = try FileManager.default.contentsOfDirectory(at: fixtures, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertEqual(files.count, 8, "the eight reference timetables")
        var checked = 0
        var failures: [String] = []
        for f in files {
            let d = try JSONSerialization.jsonObject(with: Data(contentsOf: f)) as! [String: Any]
            let p = d["params"] as! [String: Any]
            guard let method = Method(rawValue: p["method"] as! String) else { XCTFail("unknown method \(p["method"]!)"); continue }
            var params = method.parameters
            params.madhab = (p["madhab"] as? String) == "Hanafi" ? .hanafi : .shafi
            // as in the web test: the file's rule, or middle of the night
            switch p["highLatitudeRule"] as? String {
            case "SeventhOfTheNight": params.highLatitudeRule = .seventhOfTheNight
            case "TwilightAngle": params.highLatitudeRule = .twilightAngle
            default: params.highLatitudeRule = .middleOfTheNight
            }
            let zone = TimeZone(identifier: p["timezone"] as! String)!
            let fmt = DateFormatter(); fmt.locale = Locale(identifier: "en_US_POSIX"); fmt.timeZone = zone; fmt.dateFormat = "h:mm a"
            let place = Place(lat: p["latitude"] as! Double, lng: p["longitude"] as! Double, label: f.lastPathComponent)
            let variance = d["variance"] as? Int ?? 0
            for t in d["times"] as! [[String: String]] {
                let ymd = t["date"]!.split(separator: "-").map { Int($0)! }
                guard let day = PrayerEngine.times(DateComponents(year: ymd[0], month: ymd[1], day: ymd[2]), place, params) else {
                    failures.append("\(f.lastPathComponent) \(t["date"]!): no times"); continue
                }
                for prayer in PrayerName.allCases {
                    checked += 1
                    let got = fmt.string(from: day[prayer]), want = t[prayer.rawValue.lowercased()]!
                    var diff = abs(minutes(got) - minutes(want)); diff = min(diff, 1440 - diff)
                    if diff > variance { failures.append("\(f.lastPathComponent) \(t["date"]!) \(prayer.rawValue): got \(got), expected \(want)") }
                }
            }
        }
        XCTAssertTrue(failures.isEmpty, "\(failures.count) of \(checked) times differ:\n" + failures.prefix(20).joined(separator: "\n"))
        XCTAssertEqual(checked, 2772, "all 2,772 times checked")
    }

    func testQiblaMatchesAdhanReferenceBearings() {
        let refs: [(Double, Double, Int)] = [(51.5074, -0.1278, 119), (40.7128, -74.0059, 58), (-33.8688, 151.2093, 277),
                                             (33.7294, 73.0931, 256), (61.2181, -149.9003, 351)]
        for (lat, lng, want) in refs {
            XCTAssertEqual(Int(PrayerEngine.qibla(Place(lat: lat, lng: lng, label: "")).rounded()), want, "qibla at \(lat),\(lng)")
        }
    }

    func testHighLatitudeRuleCoversBothHemispheres() {
        XCTAssertEqual(PrayerEngine.recommendedRule(lat: 51.5), .seventhOfTheNight)
        XCTAssertEqual(PrayerEngine.recommendedRule(lat: -51.7), .seventhOfTheNight) // Falklands
        XCTAssertEqual(PrayerEngine.recommendedRule(lat: 40.7), .middleOfTheNight)
    }

    func testMethodSuggestionMatchesTheWebApp() {
        XCTAssertEqual(Method.suggested(lat: 21.4225, lng: 39.8262), .ummAlQura)
        XCTAssertEqual(Method.suggested(lat: 51.5074, lng: -0.1278), .moonsightingCommittee)
        XCTAssertEqual(Method.suggested(lat: 47.6062, lng: -122.3321), .northAmerica)
        XCTAssertEqual(Method.suggested(lat: 24.8607, lng: 67.0011), .karachi)
        XCTAssertEqual(Method.suggested(lat: 25.2854, lng: 51.531), .qatar)
        XCTAssertEqual(Method.suggested(lat: 48.8566, lng: 2.3522), .muslimWorldLeague)
    }
}
