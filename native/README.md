# Android and iPhone apps

The phone apps are the same web app, packaged with [Capacitor](https://capacitorjs.com) 8.5.3. Every file is inside the app, so it works offline from the first launch. What the phone apps add:

- **Prayer notifications**, even when the app is closed: one at the start of each prayer you choose (Sunrise is off by default), with a bundled chime or the phone's own sound, and a "Send a test" button. They're in **Settings → Prayer notifications**, which only appears in the phone apps.
  - Up to 60 are scheduled ahead, about 12 days for five prayers, because iOS allows 64 per app. Each time you open the app it tops them up, and it reschedules after any change to location, method, Asr time or adjustments.
  - On Android 12 and newer, the app asks for **on-time alerts** (exact alarms) if the phone has them off; otherwise a notification can be a few minutes late.
- Hadith chapters you open are kept on the phone for offline reading.

App ID `io.github.maazarif.companion` (the same naming as the Mushaf Reader's `io.github.maazarif.mushaf`). Name under the icon: **Companion**.

## How the apps are built

`android/` and `ios/` are not kept in git. `tools/native.mjs` creates them with Capacitor and applies our settings the same way every time:
- permissions: location, notifications, exact alarms, vibration;
- the chime (`native/sounds/chime.wav`, synthesised by `tools/make-chime.py`, original and free of any licence) and the notification icon;
- portrait orientation, the version number, the test signing key;
- icons and splash screens made from `assets/` by `@capacitor/assets`.

On every push, GitHub Actions builds both apps:

| Workflow | What it does |
|---|---|
| `.github/workflows/android.yml` | Builds `companion-test.apk` and puts it on the **android-latest** release. Then runs a test copy on an Android emulator and fails if Android didn't schedule at least 60 prayer alarms or the test notification didn't appear. Screenshots and logs go to the `native-builds-android` branch. |
| `.github/workflows/ios.yml` | Builds for real iPhones (unsigned, to prove it compiles) and for the Simulator. Runs a test copy on an iPhone simulator. Screenshots go to the `native-builds-ios` branch. |

The test copies start with Seattle as the location and notifications on, from `tests/fixtures/native-seed.json`. The app you install never includes that file.

## Install on Android (now, no account needed)

1. On your Android phone, open https://github.com/maazarif/muslim-companion/releases/tag/android-latest
2. Download **companion-test.apk** and open it. Allow installing from your browser when asked.
3. Open **Companion** → **Use my location** → **Settings** → **Prayer notifications: On**. Tap **Send a test in 3 seconds** to hear it.

New builds install over the old one and keep your settings, because they're all signed with the same test key (`native/android/test.keystore`, password `companion-test`, not secret).

## Install on iPhone

Apple only lets apps onto an iPhone through Xcode or TestFlight/App Store, so this needs a Mac:

```
git clone https://github.com/maazarif/muslim-companion && cd muslim-companion
npm install
npm run ios          # creates ios/ and copies the app in
npx cap open ios     # opens it in Xcode
```
In Xcode, choose **App → Signing & Capabilities → Team** (your Apple ID), plug in your iPhone and press **Run**. A free Apple ID works for your own phone, for 7 days at a time. With the Apple Developer Program ($99 a year) you can use TestFlight and the App Store, and the app stays installed.

## Publishing on the stores (later)

**Google Play** ($25 once):
- Make an upload key, and build with `./gradlew bundleRelease` signed with it. The release signing in `tools/native.mjs` would change from the test key to the upload key, read from GitHub secrets, as the Mushaf Reader does.
- Notification apps must declare why they use exact alarms. Prayer times at a fixed minute is the case Google allows for `SCHEDULE_EXACT_ALARM`, which the user can turn off.
- Privacy: location stays on the phone, nothing is collected.

**App Store** ($99 a year): archive in Xcode and upload, or add signing to `ios.yml`.

Before publishing either, check the terms of the English translations in the duas and hadith (see `data/SOURCES.md`).

## Working on it

- `npm test` also runs `tests/native.test.mjs`. It loads the app with a fake Capacitor bridge and checks the notifications it schedules: times against the published timetables, 60 at most, Jumu'ah on Fridays, rescheduling after each setting, permission refused, exact alarms off, topping up when reopened, and hadith kept offline.
- After changing the web app, `npm run android` or `npm run ios` copies it into the native project.
