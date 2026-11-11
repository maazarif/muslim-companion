# Muslim Companion

An installable web app for daily worship: prayer times, qibla, athkar, duas and hadith. It is the companion to the [Mushaf Reader](https://github.com/maazarif/quran-app) and shares its look, fonts and approach: a plain folder of files, no build step, works offline, checked by tests.

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

**Athkar**
- Morning and evening athkar with a tap counter for each (three times, seven, a hundred), progress for the day, and "start again". The app opens the morning set from Fajr until Asr and the evening set after Asr.
- Transliteration, virtue and source for each, one tap away.
- After-prayer, before-sleep and on-waking athkar to read.

**Duas**
- All 133 chapters of Hisn al-Muslim (287 duas) in 11 categories, each dua with its Arabic, English and source.
- Search by situation or words ("travel", "rain", "anxiety").
- The 99 Names of Allah with their meanings.

**Hadith**
- Hadith of the day.
- The Forty Hadith of an-Nawawi and Forty Hadith Qudsi, saved on the phone.
- Sahih al-Bukhari, Sahih Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah and the Muwatta, by chapter. A chapter downloads when you open it and then stays available offline.
- Every grading the source gives is shown with the scholar who gave it (for example "Hasan Sahih · Al-Albani"). Bukhari and Muslim are marked Sahih as part of their collection.

**Links to the Mushaf Reader** from the header.

## Known gaps

- **No athan alert while the app is closed.** Web apps can't schedule notifications on iPhone, and only unreliably elsewhere. The plan is a thin Capacitor wrapper later, which adds real scheduled athan notifications without rewriting the app.
- Times are shown in the phone's own time zone. If you type in a location in another time zone, the times will be shifted.
- There is no city search yet. Use GPS or enter coordinates (press and hold a place in your maps app to copy them).
- The six large hadith collections need a connection the first time each chapter is opened.
- The interface is in English only, though every dua and hadith has its Arabic.

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

- `tests/content.test.mjs` checks that every file in `data/` is exactly what the build made from the recorded sources (by checksum, so nothing can be edited by hand), and that nothing is missing: 287 duas with sources, 99 Names, every athkar with a count, the morning and evening wording in the right sets, 42 + 40 forty-hadith with Arabic and English.
- `tests/times.test.mjs` checks the bundled calculation library against the eight published timetables that adhan-js is itself tested against (Makkah, London, Dubai, Doha, Kuwait, Ankara, Tehran, Singapore): 2,772 prayer times, each to the minute.
- `tests/app.test.mjs` runs the real app in headless Chrome: times on screen against those timetables (including method suggestion, Hanafi Asr and high-latitude settings), next and current prayer, countdown, day and month views, 24-hour format, adjustments, settings surviving a reload, qibla bearings against adhan's reference values, compass guidance; athkar choosing morning or evening by the time, counting, progress kept for the day; duas search, chapters with sources, the 99 Names; hadith from the bundled books and a Bukhari chapter served from a local copy of the pinned source, gradings, and the error and retry when a chapter can't load; phone layout in light and dark on every screen; and reopening offline.

## Where things come from

| Content | Source | Version |
|---|---|---|
| Prayer time and qibla calculation | [adhan-js](https://github.com/batoulapps/adhan-js) by Batoul Apps, MIT licence. Bundled unmodified from source with esbuild into `vendor/adhan-4.4.6.min.js` (sha256 `eb75b2b2…a478cb`), licence in `vendor/adhan-LICENSE.txt` | 4.4.6, commit e779a32 |
| Reference timetables for tests | adhan-js `Shared/Times`, copied unchanged to `tests/fixtures/adhan` | same |
| Athkar, duas, 99 Names, hadith | Seen-Arabic adhkar DB (MIT), muslim-data (Apache 2.0) and fawazahmed0/hadith-api (public domain), built into `data/` by `tools/build-content.mjs`. Full details, commits and checksums in [`data/SOURCES.md`](data/SOURCES.md) | see there |
| Hijri date | The browser's built-in Umm al-Qura calendar (`Intl`) | — |
| Fonts | Figtree and Amiri (SIL Open Font Licence), the same files as the Mushaf Reader | — |

As with the Quran text in the Mushaf Reader, no religious text is typed by hand: it is bundled from a named source, recorded, and checked by the tests.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, header and tabs |
| `styles.css` | Design shared with the Mushaf Reader, light and dark |
| `app.js` | Prayer times, qibla compass, settings, location, navigation |
| `content.js` | Athkar, duas and hadith screens |
| `util.js` | Shared helpers |
| `data/` | Athkar, duas, names and hadith, with `SOURCES.md` |
| `tools/build-content.mjs` | Rebuilds `data/` from the original sources |
| `vendor/` | adhan-js, bundled |
| `sw.js` | Service worker: installs the whole app for offline use |
| `manifest.webmanifest`, `icons/` | Home-screen install |
| `tests/` | Calculation and browser tests |
