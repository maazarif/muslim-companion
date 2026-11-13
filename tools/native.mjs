// Creates (if needed) and updates the Android or iOS app project with Capacitor, then applies our settings:
// permissions, notification sound and icon, portrait orientation, version, and the test signing key.
// The android/ and ios/ folders are generated, not kept in git: this script rebuilds them the same way every time.
//
//   node tools/native.mjs android            then: cd android && ./gradlew assembleRelease
//   node tools/native.mjs ios                then: npx cap open ios   (on a Mac with Xcode)
//   node tools/native.mjs android --seed tests/fixtures/native-seed.json   (automated test builds only)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const platform = process.argv[2];
if (!["android", "ios"].includes(platform)) { console.error("usage: node tools/native.mjs android|ios [--seed file]"); process.exit(2); }
const seedAt = process.argv.indexOf("--seed");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const VERSION = pkg.version;
const BUILD = String(process.env.VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 1);
const run = cmd => { console.log("$ " + cmd); execSync(cmd, { cwd: root, stdio: "inherit" }); };
const file = (...p) => path.join(root, ...p);
const edit = (f, fn) => { const before = fs.readFileSync(f, "utf8"), after = fn(before); if (after !== before) fs.writeFileSync(f, after); };
function insertOnce(text, marker, anchor, addition) {
  if (text.includes(marker)) return text;
  if (!text.includes(anchor)) throw new Error(`can't find ${JSON.stringify(anchor)} to patch`);
  return text.replace(anchor, addition + anchor);
}

run(`node tools/build-www.mjs${seedAt > 0 ? " --seed " + process.argv[seedAt + 1] : ""}`);
if (!fs.existsSync(file(platform))) run(`npx cap add ${platform}`);
run(`npx capacitor-assets generate --${platform}`);

if (platform === "android") {
  const main = file("android/app/src/main");
  fs.mkdirSync(path.join(main, "res/raw"), { recursive: true });
  fs.copyFileSync(file("native/sounds/chime.wav"), path.join(main, "res/raw/chime.wav"));
  fs.copyFileSync(file("native/android/res/drawable/ic_stat_prayer.xml"), path.join(main, "res/drawable/ic_stat_prayer.xml"));
  edit(path.join(main, "AndroidManifest.xml"), t => {
    t = insertOnce(t, "ACCESS_COARSE_LOCATION", "</manifest>", `    <!-- Added by tools/native.mjs -->
    <!-- Prayer times and qibla for where you are (asked for only when you tap "Use my location") -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
    <!-- Prayer notifications on time, even in battery saving -->
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <!-- A short buzz on each athkar count and when facing the qibla -->
    <uses-permission android:name="android.permission.VIBRATE" />
`);
    if (!t.includes('android:screenOrientation="portrait"')) t = t.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
    return t;
  });
  edit(file("android/app/build.gradle"), t => t.includes("// Added by tools/native.mjs") ? t : t + `
// Added by tools/native.mjs
android {
    defaultConfig {
        versionCode Integer.parseInt(System.getenv("VERSION_CODE") ?: "${BUILD}")
        versionName "${VERSION}"
    }
    signingConfigs {
        // A test key kept in the repository (not secret) so each new test APK installs over the last one.
        // Google Play builds are signed with the upload key instead (see native/README.md).
        test {
            storeFile file("../../native/android/test.keystore")
            storePassword "companion-test"
            keyAlias "companion-test"
            keyPassword "companion-test"
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.test }
    }
}
`);
}

if (platform === "ios") {
  const app = file("ios/App/App");
  fs.copyFileSync(file("native/sounds/chime.wav"), path.join(app, "chime.wav"));
  edit(path.join(app, "Info.plist"), t => {
    t = insertOnce(t, "NSLocationWhenInUseUsageDescription", "</dict>\n</plist>", `	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Your location is used on this phone to work out prayer times and the qibla direction. It is never sent anywhere.</string>
	<key>NSMotionUsageDescription</key>
	<string>The compass shows which way the qibla is.</string>
`);
    // iPhone: portrait only (iPad keeps every orientation)
    t = t.replace(/(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/, "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2");
    return t;
  });
  // add chime.wav to the app bundle (iOS looks there for notification sounds), and set the version
  const require = createRequire(import.meta.url);
  const xcode = require("xcode");
  const pbx = file("ios/App/App.xcodeproj/project.pbxproj");
  const proj = xcode.project(pbx); proj.parseSync();
  // (the library's addResourceFile() needs a "Resources" group, which Capacitor's project doesn't have)
  if (!proj.hasFile("chime.wav")) {
    const group = proj.findPBXGroupKey({ path: "App" }) || proj.findPBXGroupKey({ name: "App" });
    if (!group) throw new Error("App group not found in the Xcode project");
    const f = proj.addFile("chime.wav", group, { lastKnownFileType: "audio.wav" });
    const ref = proj.pbxFileReferenceSection()[f.fileRef];
    for (const k of Object.keys(ref)) if (ref[k] === undefined || ref[k] === "undefined") delete ref[k];
    f.uuid = proj.generateUuid();
    proj.addToPbxBuildFileSection(f);
    proj.addToPbxResourcesBuildPhase(f);
  }
  proj.updateBuildProperty("MARKETING_VERSION", VERSION);
  proj.updateBuildProperty("CURRENT_PROJECT_VERSION", BUILD);
  fs.writeFileSync(pbx, proj.writeSync());
}

run(`npx cap sync ${platform}`);
console.log(`\n${platform} project ready: version ${VERSION} (${BUILD})`);
