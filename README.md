# Muslim Companion

An installable web app for daily worship: prayer times and qibla today, with athkar, duas and hadith coming next. It is the companion to the [Mushaf Reader](https://github.com/maazarif/quran-app) and shares its look, fonts and approach: a plain folder of files, no build step, works offline, checked by tests.

## What it does

**Prayer times**
- Calculated on the phone, so they appear instantly and work without internet.
- Next prayer with a live countdown, the current prayer marked, Friday shown as Jumu'ah.
- Today, any other day, or the whole month as a table.
- Hijri date (Umm al-Qura calendar) in Arabic and English, with a ±2 day adjustment for local moonsighting.
- Twelve calculation methods. The app suggests one for your area (for example ISNA in North America, Umm al-Qura in Saudi Arabia, Karachi in South Asia) and you can choose any other.
- Hanafi or standard Asr, high-latitude rules, and per-prayer minute adjustments to match your masjid.
- Location from the phone's GPS or typed in by hand. It never leaves the device.

**Qibla**
- Bearing from true north and the distance to the Kaaba.
- A live compass on phones: turn until the Kaaba marker lines up with the gold mark. It tells you which way to turn and confirms when you are facing the qibla. iPhones ask for compass permission once.

**Links to the Mushaf Reader** from the header.

## Known gaps

- **No athan alert while the app is closed.** Web apps can't schedule notifications on iPhone, and only unreliably elsewhere. The plan is a thin Capacitor wrapper later, which adds real scheduled athan notifications without rewriting the app.
- Times are shown in the phone's own time zone. If you type in a location in another time zone, the times will be shifted.
- There is no city search yet. Use GPS or enter coordinates (press and hold a place in your maps app to copy them).
- Athkar, duas and hadith are placeholders until their content is added from referenced sources (see below).

## Run it

```
python3 -m http.server 8080
```
Open http://localhost:8080. Every push to `main` runs the tests and publishes to GitHub Pages (Settings → Pages → branch `gh-pages`).

## Tests

```
npm install
npx playwright install chromium
npm test
```

- `tests/times.test.mjs` checks the bundled calculation library against the eight published timetables that adhan-js is itself tested against (Makkah, London, Dubai, Doha, Kuwait, Ankara, Tehran, Singapore): 2,772 prayer times, each to the minute.
- `tests/app.test.mjs` runs the real app in headless Chrome: times on screen against those timetables (including method suggestion, Hanafi Asr and high-latitude settings), next and current prayer, countdown, day and month views, 24-hour format, adjustments, settings surviving a reload, qibla bearings against adhan's reference values, compass guidance, phone layout in light and dark, and offline reopening.

## Where things come from

| Content | Source | Version |
|---|---|---|
| Prayer time and qibla calculation | [adhan-js](https://github.com/batoulapps/adhan-js) by Batoul Apps, MIT licence. Bundled unmodified from source with esbuild into `vendor/adhan-4.4.6.min.js` (sha256 `eb75b2b2…a478cb`), licence in `vendor/adhan-LICENSE.txt` | 4.4.6, commit e779a32 |
| Reference timetables for tests | adhan-js `Shared/Times`, copied unchanged to `tests/fixtures/adhan` | same |
| Hijri date | The browser's built-in Umm al-Qura calendar (`Intl`) | — |
| Fonts | Figtree and Amiri (SIL Open Font Licence), the same files as the Mushaf Reader | — |

Content still to add, and the standard it should meet: athkar from Hisn al-Muslim and duas from the Quran and Sunnah, each with its hadith reference; hadith collections with the grading shown for every hadith. As with the Quran text in the Mushaf Reader, nothing should be typed by hand: bundle from a named source, record it here, and check it in the tests.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, header and tabs |
| `styles.css` | Design shared with the Mushaf Reader, light and dark |
| `app.js` | Prayer times, qibla compass, settings, location |
| `vendor/` | adhan-js, bundled |
| `sw.js` | Service worker: installs the whole app for offline use |
| `manifest.webmanifest`, `icons/` | Home-screen install |
| `tests/` | Calculation and browser tests |
