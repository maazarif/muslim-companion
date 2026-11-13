#!/usr/bin/env bash
# Runs on an Android emulator in GitHub Actions (see .github/workflows/android.yml).
# Installs the test build (it starts with Seattle as the location and prayer notifications on),
# then checks that Android scheduled the prayer alarms and showed the test notification.
set -uo pipefail
PKG=io.github.maazarif.companion
OUT=${1:-out}
fail=0
adb shell cmd alarm set-timezone America/Los_Angeles 2>/dev/null || adb shell service call alarm 3 s16 America/Los_Angeles >/dev/null || true
adb install -r "$OUT/companion-e2e.apk"
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow || true
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 25
adb exec-out screencap -p > "$OUT/android-prayer.png"
adb shell dumpsys alarm > "$OUT/alarms-full.txt"
grep -E "Alarm\{.*$PKG" "$OUT/alarms-full.txt" > "$OUT/alarms.txt" || true
n=$(wc -l < "$OUT/alarms.txt")
echo "Alarms scheduled by the app: $n"
if [ "$n" -lt 60 ]; then echo "::error::Expected at least 60 prayer alarms, found $n"; fail=1; fi
# the seed's test notification is due 40 s after the app first opened
sleep 25
adb shell dumpsys notification --noredact > "$OUT/notifications-full.txt"
grep -A40 "pkg=$PKG" "$OUT/notifications-full.txt" | grep -E "pkg=|channel=|android.title|android.text|mSound|sound=" > "$OUT/notifications.txt" || true
cat "$OUT/notifications.txt"
if ! grep -q "android.title=String (Test" "$OUT/notifications.txt"; then echo "::error::The test notification did not appear"; fail=1; fi
adb shell cmd statusbar expand-notifications; sleep 3
adb exec-out screencap -p > "$OUT/android-notification.png"
adb shell cmd statusbar collapse
adb logcat -d -s Capacitor:* Capacitor/Console:* LocalNotifications:* AndroidRuntime:E chromium:E > "$OUT/logcat.txt" || true
exit $fail
