import SwiftUI

@main
struct MushafApp: App {
    init() {
        #if DEBUG
        // Test builds only: `simctl launch … -seedLat 51.5074 -seedLng -0.1278 -seedLabel London` starts with a place,
        // so the simulator check can screenshot real times.
        let d = UserDefaults.standard
        if d.object(forKey: "seedLat") != nil {
            Places.save(Place(lat: d.double(forKey: "seedLat"), lng: d.double(forKey: "seedLng"), label: d.string(forKey: "seedLabel") ?? "My location"))
        }
        #endif
    }

    var body: some Scene {
        WindowGroup { PrayerView() }
    }
}
