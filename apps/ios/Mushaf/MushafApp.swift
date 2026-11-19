import SwiftUI

@main
struct MushafApp: App {
    init() {
        #if DEBUG
        // Test builds only: `simctl launch … -seedPlace "51.5074,-0.1278,London"` starts with a place, so the simulator
        // check can screenshot real times. One value, because a separate "-0.1278" argument reads as an option, not a number.
        if let seed = UserDefaults.standard.string(forKey: "seedPlace") {
            let f = seed.split(separator: ",", maxSplits: 2).map(String.init)
            if f.count >= 2, let lat = Double(f[0]), let lng = Double(f[1]) {
                Places.save(Place(lat: lat, lng: lng, label: f.count > 2 ? f[2] : "My location"))
            }
        }
        #endif
    }

    var body: some Scene {
        WindowGroup { PrayerView() }
    }
}
