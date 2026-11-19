# adhan2 (vendored)

Source of [batoulapps/adhan-kotlin](https://github.com/batoulapps/adhan-kotlin) `adhan/src/commonMain`, commit
a39517d0aafb95addef28956d96e5823b3aea1cc (29 Oct 2026, version 0.0.7), MIT licence (LICENSE.txt).

Bundled as source so the app doesn't depend on the Kotlin version the published library was built with.
Two changes, both marked "Muslim Companion patch":
- `CalculationParameters.maghribAngle` and its use in `PrayerTimes`, copied from adhan-js, for the Tehran method
  (Maghrib when the sun is 4.5° below the horizon). adhan2 has no Tehran method.

Checked by `app/src/test/.../TimetableTest.kt` against the same eight published timetables as the web app.
