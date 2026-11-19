import Foundation

/// Hijri dates on the Umm al-Qura calendar, as the web app (Intl islamic-umalqura) and the Android app use.
enum Hijri {
    static let monthsEn = ["Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani", "Jumada al-Ula", "Jumada al-Akhirah",
                           "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah"]
    static let monthsAr = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان",
                           "شوال", "ذو القعدة", "ذو الحجة"]

    struct Parts: Equatable { let day: Int; let month: Int; let year: Int }

    private static let ummAlQura: Calendar = {
        var c = Calendar(identifier: .islamicUmmAlQura); c.timeZone = TimeZone(identifier: "UTC")!; return c
    }()
    private static let gregorian: Calendar = {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c
    }()

    /// A civil date (year, month, day). adjust: the user's ±2 day shift for local moonsighting.
    static func parts(year: Int, month: Int, day: Int, adjust: Int = 0) -> Parts? {
        guard let d = gregorian.date(from: DateComponents(year: year, month: month, day: day + adjust, hour: 12)) else { return nil }
        let c = ummAlQura.dateComponents([.year, .month, .day], from: d)
        guard let y = c.year, let m = c.month, let dd = c.day else { return nil }
        return Parts(day: dd, month: m, year: y)
    }

    static func parts(_ c: DateComponents, adjust: Int = 0) -> Parts? { parts(year: c.year!, month: c.month!, day: c.day!, adjust: adjust) }

    static func english(_ c: DateComponents, adjust: Int = 0) -> String {
        guard let p = parts(c, adjust: adjust) else { return "" }
        return "\(p.day) \(monthsEn[p.month - 1]) \(p.year) AH"
    }

    static func arabic(_ c: DateComponents, adjust: Int = 0) -> String {
        guard let p = parts(c, adjust: adjust) else { return "" }
        return "\(arabicDigits(p.day)) \(monthsAr[p.month - 1]) \(arabicDigits(p.year)) هـ"
    }

    static func arabicDigits(_ n: Int) -> String {
        let digits = Array("٠١٢٣٤٥٦٧٨٩")
        return String(String(n).map { digits[Int(String($0))!] })
    }
}
