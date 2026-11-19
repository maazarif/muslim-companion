#!/usr/bin/env bash
# Runs on an Android emulator in GitHub Actions (see .github/workflows/android-native.yml).
# Installs the native test build, opens it with London as the place, and checks the Prayer screen
# shows all six times; saves light and dark screenshots.
set -uo pipefail
PKG=io.github.maazarif.mushaf.preview
OUT=${1:-out}
fail=0
adb root >/dev/null 2>&1; adb wait-for-device
adb shell setprop persist.sys.timezone Europe/London
adb shell 'service call alarm 3 s16 Europe/London' >/dev/null || true
echo "Emulator time zone: $(adb shell getprop persist.sys.timezone) — $(adb shell date)"
adb install -r "$OUT/mushaf-preview-debug.apk" || fail=1
shot() { # name, dark yes/no
  adb shell cmd uimode night "$2" >/dev/null
  adb shell am force-stop $PKG
  adb shell am start -n $PKG/io.github.maazarif.mushaf.MainActivity --ed seed_lat 51.5074 --ed seed_lng -0.1278 --es seed_label London >/dev/null
  sleep 6
  adb exec-out screencap -p > "$OUT/$1.png"
}
shot android-native-prayer no
adb shell uiautomator dump /sdcard/ui.xml >/dev/null && adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null
for w in Fajr Sunrise Dhuhr Asr Maghrib Isha NEXT London AH; do
  grep -q "$w" "$OUT/ui.xml" || { echo "::error::'$w' is not on the Prayer screen"; fail=1; }
done
shot android-native-prayer-dark yes
adb shell cmd uimode night no >/dev/null
adb shell pidof $PKG >/dev/null || { echo "::error::The app is not running (crashed?)"; fail=1; }
adb logcat -d AndroidRuntime:E '*:S' > "$OUT/logcat.txt" || true
grep -q "FATAL EXCEPTION" "$OUT/logcat.txt" && { echo "::error::The app crashed"; cat "$OUT/logcat.txt"; fail=1; }
exit $fail
