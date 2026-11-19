package io.github.maazarif.mushaf

import android.content.pm.ApplicationInfo
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import io.github.maazarif.mushaf.prayer.Place
import io.github.maazarif.mushaf.ui.CompanionTheme
import io.github.maazarif.mushaf.ui.PrayerScreen
import io.github.maazarif.mushaf.ui.Places

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Test builds only: start with a place, so the emulator check can screenshot real times.
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (debuggable && intent.hasExtra("seed_lat")) {
            Places.save(this, Place(intent.getDoubleExtra("seed_lat", 0.0), intent.getDoubleExtra("seed_lng", 0.0),
                intent.getStringExtra("seed_label") ?: "My location"))
        }
        enableEdgeToEdge()
        setContent { CompanionTheme { PrayerScreen() } }
    }
}
