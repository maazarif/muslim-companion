import SwiftUI
import CoreLocation

/// Where the user is, kept on the phone (UserDefaults).
enum Places {
    static func load() -> Place? {
        let d = UserDefaults.standard
        guard d.object(forKey: "place.lat") != nil else { return nil }
        return Place(lat: d.double(forKey: "place.lat"), lng: d.double(forKey: "place.lng"), label: d.string(forKey: "place.label") ?? "My location")
    }
    static func save(_ p: Place) {
        let d = UserDefaults.standard
        d.set(p.lat, forKey: "place.lat"); d.set(p.lng, forKey: "place.lng"); d.set(p.label, forKey: "place.label")
    }
}

/// One-shot location for prayer times.
final class Locator: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var place: Place? = Places.load()
    @Published var error: String?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func locate() {
        error = nil
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: error = "Location permission is off. Allow it in Settings › Privacy › Location Services."
        default: manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        if m.authorizationStatus == .authorizedWhenInUse || m.authorizationStatus == .authorizedAlways { m.requestLocation() }
    }
    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        let p = Place(lat: (l.coordinate.latitude * 1e4).rounded() / 1e4, lng: (l.coordinate.longitude * 1e4).rounded() / 1e4, label: "My location")
        Places.save(p); place = p
    }
    func locationManager(_ m: CLLocationManager, didFailWithError e: Error) {
        error = "Couldn't get your location just now. Try again."
    }
}

struct PrayerView: View {
    @StateObject private var locator = Locator()
    @State private var now = Date()
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 9) {
                    BrandMark().frame(width: 30, height: 30)
                    Text("PREVIEW").font(.ui(12, .bold)).tracking(2).foregroundStyle(Palette.muted)
                }
                if let place = locator.place { times(place) } else { ask }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(Palette.ground.ignoresSafeArea())
        .onReceive(tick) { now = $0 }
    }

    private var ask: some View {
        CardBox {
            VStack(spacing: 12) {
                Text("بِسْمِ اللَّهِ").font(.amiri(28)).foregroundStyle(Palette.frame)
                Text("Where are you?").font(.ui(20, .bold)).foregroundStyle(Palette.ink)
                Text("Prayer times are worked out for your exact location. Your location stays on this phone.")
                    .font(.ui(15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                Button { locator.locate() } label: {
                    Text("Use my location").font(.ui(15, .semibold)).foregroundStyle(Palette.paper)
                        .padding(.horizontal, 20).padding(.vertical, 11).background(Palette.frame, in: Capsule())
                }.accessibilityIdentifier("useLocation")
                if let e = locator.error { Text(e).font(.ui(14)).foregroundStyle(Palette.danger).multilineTextAlignment(.center) }
            }.padding(28)
        }
    }

    @ViewBuilder private func times(_ place: Place) -> some View {
        let s = PrayerSettings()
        let cal = Calendar.current
        let today = cal.dateComponents([.year, .month, .day], from: now)
        if let t = PrayerEngine.times(today, place, s), let u = upcoming(now: now, place: place, settings: s, calendar: cal) {
            Framed {
                VStack(spacing: 2) {
                    Text("NEXT").font(.ui(11, .bold)).tracking(1.8).foregroundStyle(Palette.muted)
                    HStack(spacing: 10) {
                        Text(u.next.en).font(.ui(24, .bold)).foregroundStyle(Palette.ink).accessibilityIdentifier("nextName")
                        Text(u.next.ar).font(.amiri(26)).foregroundStyle(Palette.frame)
                    }
                    Text(clock(u.at)).font(.ui(42, .bold)).foregroundStyle(Palette.ink).accessibilityIdentifier("nextAt")
                    Text(countdown(u.at.timeIntervalSince(now))).font(.ui(15, .semibold)).foregroundStyle(Palette.frame)
                    Rectangle().fill(Palette.line).frame(height: 1).padding(.top, 12).padding(.bottom, 10)
                    HStack(spacing: 8) {
                        Text(Hijri.arabic(today)).font(.amiri(17)).foregroundStyle(Palette.ink)
                        Text("·").font(.ui(14)).foregroundStyle(Palette.muted)
                        Text(now.formatted(.dateTime.weekday(.wide).day().month(.wide))).font(.ui(14)).foregroundStyle(Palette.muted)
                    }
                    Text(Hijri.english(today)).font(.ui(13)).foregroundStyle(Palette.muted).accessibilityIdentifier("hijri")
                }
                .padding(.vertical, 22).padding(.horizontal, 20)
            }
            CardBox {
                VStack(spacing: 0) {
                    ForEach(PrayerName.allCases) { p in
                        let isNow = u.current == p, isNext = !u.tomorrow && u.next == p
                        HStack {
                            Text(p.en).font(.ui(16, p.minor ? .regular : .semibold)).foregroundStyle(p.minor ? Palette.muted : Palette.ink)
                            if isNow { badge("NOW", filled: true) }
                            if isNext { badge("NEXT", filled: false) }
                            Spacer()
                            Text(p.ar).font(.amiri(18)).foregroundStyle(Palette.muted)
                            Text(clock(t[p])).font(.ui(17, p.minor ? .regular : .bold))
                                .foregroundStyle(isNext ? Palette.frame : p.minor ? Palette.muted : Palette.ink)
                                .frame(width: 92, alignment: .trailing).accessibilityIdentifier("time_\(p.rawValue)")
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .background(isNow ? Palette.cur : Color.clear, in: RoundedRectangle(cornerRadius: 12))
                    }
                }.padding(6)
            }
            HStack(spacing: 8) { pill(place.label); pill(PrayerEngine.method(for: place, s).title) }
            Text("Preview of the native app. Settings, notifications, the qibla and the Quran come next.")
                .font(.ui(13)).foregroundStyle(Palette.muted)
        } else {
            CardBox { Text("Prayer times can't be worked out for this place today.").font(.ui(15)).foregroundStyle(Palette.muted).padding(20) }
        }
    }

    private func clock(_ d: Date) -> String { d.formatted(date: .omitted, time: .shortened).replacingOccurrences(of: "\u{202F}", with: " ") }

    private func badge(_ text: String, filled: Bool) -> some View {
        Text(text).font(.ui(10, .bold)).tracking(1.2).foregroundStyle(filled ? Palette.paper : Palette.frame)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(filled ? Palette.frame : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(Palette.frame, lineWidth: filled ? 0 : 1))
            .padding(.leading, 6)
    }

    private func pill(_ text: String) -> some View {
        Text(text).font(.ui(13, .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(Palette.paper, in: Capsule()).overlay(Capsule().stroke(Palette.line, lineWidth: 1))
    }
}
