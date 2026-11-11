// Checks the bundled adhan library against the published timetables that adhan-js itself is
// tested against (tests/fixtures/adhan, copied unchanged from adhan-js/Shared/Times).
// Every prayer on every listed date must match to the minute (or within the file's stated variance).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrayerTimes, Coordinates, CalculationMethod, Madhab, HighLatitudeRule } from "../vendor/adhan-4.4.6.min.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/adhan");
const PRAYERS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

// "6:25 AM" in a time zone, as shown there
function shown(date, tz) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz })
    .format(date).replace(/ /g, " ");
}
function minutes(s) {
  const [, h, m, ap] = s.match(/(\d+):(\d+) (AM|PM)/);
  return (Number(h) % 12 + (ap === "PM" ? 12 : 0)) * 60 + Number(m);
}

let files = 0, checked = 0;
const failures = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const p = d.params;
  const params = CalculationMethod[p.method]();
  params.madhab = p.madhab === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule[p.highLatitudeRule] || HighLatitudeRule.MiddleOfTheNight;
  const variance = d.variance || 0;
  for (const t of d.times) {
    const [y, mo, da] = t.date.split("-").map(Number);
    const pt = new PrayerTimes(new Coordinates(p.latitude, p.longitude), new Date(y, mo - 1, da), params);
    for (const name of PRAYERS) {
      checked++;
      const got = shown(pt[name], p.timezone);
      let diff = Math.abs(minutes(got) - minutes(t[name]));
      diff = Math.min(diff, 1440 - diff);
      if (diff > variance) failures.push(`${f} ${t.date} ${name}: got ${got}, expected ${t[name]}`);
    }
  }
  files++;
}

if (failures.length) {
  console.error(failures.slice(0, 20).join("\n"));
  console.error(`FAIL: ${failures.length} of ${checked} prayer times differ`);
  process.exit(1);
}
console.log(`ok - ${checked} prayer times across ${files} reference timetables match`);
