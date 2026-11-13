// Runs the real app in headless Chrome and checks what a user sees.
// Prayer times on screen are compared with the published timetables in tests/fixtures/adhan.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = name => JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/adhan", name), "utf8"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".json": "application/json" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("ok -", name); }
  catch (e) { failed++; console.error("FAIL -", name, "\n   ", e.message.split("\n").slice(0, 6).join("\n    ")); }
}
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

async function open({ tz, lat, lng, at, viewport = { width: 390, height: 844 } }) {
  const ctx = await browser.newContext({
    timezoneId: tz, locale: "en-US", viewport, serviceWorkers: "block",
    geolocation: lat != null ? { latitude: lat, longitude: lng } : undefined,
    permissions: lat != null ? ["geolocation"] : []
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (at) await page.clock.install({ time: new Date(at) });
  await page.goto(URL0);
  return { ctx, page, errors };
}
const rows = page => page.$$eval("#times li", ls => ls.map(l => ({ k: l.dataset.k, t: l.querySelector(".t").textContent, now: l.classList.contains("now"), next: l.classList.contains("next") })));
const PRAYERS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

await test("Makkah: suggests Umm al-Qura and shows the published times", async () => {
  const f = fixture("Makkah-UmmAlQura.json"), day = f.times.find(t => t.date === "2016-03-05");
  const { ctx, page, errors } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, at: "2016-03-05T10:00:00+03:00" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  eq(await rows(page).then(r => r.map(x => x.t)), PRAYERS.map(k => day[k]), "times");
  ok((await page.textContent("#methodPill")).includes("Umm al-Qura"), "method pill should name Umm al-Qura");
  eq(await page.textContent("#hero .name b"), "Dhuhr", "next prayer");
  eq(await page.textContent("#nextAt"), day.dhuhr, "next prayer time");
  eq(await page.textContent("#left"), "in 2 h 32 min", "countdown");
  const r = await rows(page);
  ok(!r.some(x => x.now), "no prayer is current between sunrise and Dhuhr");
  ok(r.find(x => x.k === "dhuhr").next, "Dhuhr row marked next");
  eq(await page.textContent("#dayHijri"), "25 Jumada al-Ula 1437 AH", "Hijri date, with our own month names");
  ok((await page.textContent("#hero .dates .ar")).startsWith("٢٥ جمادى الأولى ١٤٣٧"), "Arabic Hijri date");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("after Isha: Isha is current and the next prayer is tomorrow's Fajr", async () => {
  const f = fixture("Makkah-UmmAlQura.json");
  const { ctx, page } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, at: "2016-03-05T23:00:00+03:00" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  eq(await page.textContent("#hero .name b"), "Fajr", "next prayer");
  ok((await rows(page)).find(x => x.k === "isha").now, "Isha row marked now");
  ok(/^in [56] h/.test(await page.textContent("#left")), "countdown runs to tomorrow's Fajr");
  // the countdown moves with the clock
  await page.clock.runFor(60 * 60 * 1000);
  ok(/^in [45] h/.test(await page.textContent("#left")), "countdown updates");
  await ctx.close();
});

await test("London: entered by hand, Hanafi Asr and high-latitude setting match the timetable", async () => {
  const f = fixture("London-MoonsightingCommittee.json"), day = f.times.find(t => t.date === "2016-06-01");
  const { ctx, page } = await open({ tz: "Europe/London", at: "2016-06-01T09:00:00+01:00" });
  await page.click("#enterLoc");
  await page.fill("#locLabel", "London");
  await page.fill("#locLat", "999");
  await page.fill("#locLng", String(f.params.longitude));
  await page.click("#saveLoc");
  ok(await page.isVisible("#sheetErr"), "rejects an impossible latitude");
  await page.fill("#locLat", String(f.params.latitude));
  await page.click("#saveLoc");
  await page.waitForSelector("#times li");
  ok((await page.textContent("#methodPill")).includes("Moonsighting"), "UK gets the Moonsighting Committee method");
  await page.click("#methodPill");
  await page.click('#setMadhab [data-v="Hanafi"]');
  await page.selectOption("#setHlr", "MiddleOfTheNight");
  await page.click("#closeSheet");
  eq(await rows(page).then(r => r.map(x => x.t)), PRAYERS.map(k => day[k]), "times");
  eq(await page.textContent("#locPill"), "London", "location name");
  // settings survive a reload
  await page.reload();
  await page.waitForSelector("#times li");
  eq(await rows(page).then(r => r.map(x => x.t)), PRAYERS.map(k => day[k]), "times after reload");
  await ctx.close();
});

await test("day navigation, month table, 24-hour format and per-prayer adjustment", async () => {
  const f = fixture("Makkah-UmmAlQura.json"), day = f.times.find(t => t.date === "2016-04-03");
  const { ctx, page } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, at: "2016-04-02T08:00:00+03:00" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#dayNext");
  ok((await page.textContent("#dayName")).startsWith("Tomorrow"), "shows tomorrow");
  eq(await rows(page).then(r => r.map(x => x.t)), PRAYERS.map(k => day[k]), "tomorrow's times");
  await page.click("#dayToday");
  ok((await page.textContent("#dayName")).startsWith("Today"), "back to today");
  await page.click("#monthPill");
  eq(await page.$$eval(".month tbody tr", t => t.length), 30, "April has 30 rows");
  ok(await page.$eval(".month tr.today td", td => /(^|\D)2(\D|$)/.test(td.textContent)), "today (the 2nd) highlighted");
  await page.click("#closeSheet");
  await page.click("#openSettings");
  await page.click('#setFmt [data-v="24"]');
  await page.fill('[data-adj="isha"]', "30");
  await page.click("#closeSheet");
  await page.click("#dayNext");
  const t = await rows(page);
  eq(t.find(x => x.k === "maghrib").t, "18:36", "24-hour Maghrib (6:36 PM)");
  eq(t.find(x => x.k === "isha").t, "20:36", "Isha moved by +30 (8:06 PM + 30)");
  await ctx.close();
});

await test("qibla: bearing for London and the compass guides you to it", async () => {
  const { ctx, page, errors } = await open({ tz: "Europe/London", lat: 51.5074, lng: -0.1278 });
  await ctx.grantPermissions(["geolocation", "accelerometer", "gyroscope", "magnetometer"]);
  await page.goto(URL0 + "#qibla");
  await page.click("#useGps");
  await page.waitForSelector("#bearing");
  eq(await page.textContent("#bearing"), "119°SE from north", "bearing (adhan reference 118.987°)");
  const turn = alpha => page.evaluate(a => window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", { alpha: a, absolute: true })), alpha);
  await turn(360 - 100); // facing 100°
  eq(await page.textContent("#qHint"), "Turn right 19°", "guidance");
  await turn(360 - 119); // facing the qibla
  eq(await page.textContent("#qHint"), "You are facing the qibla.", "aligned message");
  ok(await page.$eval("#dial", d => d.classList.contains("aligned")), "dial highlights");
  ok((await page.textContent(".qibla .note")).includes("4,79"), "distance about 4,790 km");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("qibla bearings match adhan's reference values", async () => {
  const refs = [[40.7128, -74.0059, 58], [-33.8688, 151.2093, 277], [33.7294, 73.0931, 256], [61.2181, -149.9003, 351]];
  for (const [lat, lng, want] of refs) {
    const { ctx, page } = await open({ tz: "UTC", lat, lng });
    await page.goto(URL0 + "#qibla");
    await page.click("#useGps");
    await page.waitForSelector("#bearing");
    ok((await page.textContent("#bearing")).startsWith(want + "°"), `bearing at ${lat},${lng} should be ${want}°`);
    await ctx.close();
  }
});

// the hadith CDN, served from tests/fixtures/hadith (Bukhari chapter 1) instead of the internet
const CDN = /^https:\/\/(cdn\.jsdelivr\.net\/gh\/fawazahmed0\/hadith-api@[0-9a-f]{40}|raw\.githubusercontent\.com\/fawazahmed0\/hadith-api\/[0-9a-f]{40})\/editions\//;
async function serveHadith(ctx, seen = []) {
  await ctx.route(url => CDN.test(url.href), route => {
    const u = route.request().url(); seen.push(u);
    const m = u.match(/editions\/(\w+-\w+)\/sections\/(\d+)\.min\.json$/);
    const file = m && path.join(root, "tests/fixtures/hadith", `${m[1]}-${m[2]}.min.json`);
    return file && fs.existsSync(file) ? route.fulfill({ path: file, contentType: "application/json" }) : route.fulfill({ status: 404 });
  });
  return seen;
}

await test("athkar: evening after Asr, counting, progress kept for the day, start again", async () => {
  const f = fixture("Makkah-UmmAlQura.json");
  const { ctx, page, errors } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, at: "2016-03-05T16:30:00+03:00" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click('.tabs a[data-tab="athkar"]');
  await page.waitForSelector(".dhikr");
  eq(await page.textContent(".chips [aria-current]"), "Evening", "after Asr (3:55 PM) the evening athkar open");
  eq(await page.$$eval(".dhikr", c => c.length), 24, "24 evening athkar");
  eq(await page.textContent("#progressText"), "0 of 24 done", "progress starts at zero");
  const card = page.locator(".dhikr").nth(3); // Al-Ikhlas, three times
  eq(await card.locator(".times").textContent(), "3 times", "repetitions shown");
  for (const left of ["2", "1"]) { await card.locator(".counter").click(); eq(await card.locator(".counter").textContent(), left, "counter counts down"); }
  await card.locator(".counter").click();
  ok(await card.evaluate(c => c.classList.contains("done")), "card marked done after the third tap");
  eq(await page.textContent("#progressText"), "1 of 24 done", "progress updates");
  await page.reload();
  await page.waitForSelector(".dhikr");
  eq(await page.textContent("#progressText"), "1 of 24 done", "progress survives a reload the same day");
  await page.click("#resetAthkar");
  eq(await page.textContent("#progressText"), "0 of 24 done", "start again resets");
  await page.click('.chips a[href="#athkar/morning"]');
  await page.waitForFunction(() => document.querySelector(".chips [aria-current]")?.textContent === "Morning" && document.querySelectorAll(".dhikr").length === 26);
  ok((await page.textContent(".dhikr")).length > 10, "morning athkar shown");
  await page.click('.chips a[href="#athkar/sleep"]');
  await page.waitForFunction(() => document.querySelector(".chips [aria-current]")?.textContent === "Before sleep" && document.querySelector(".dhikr .ref"));
  eq(await page.$$eval(".dhikr .counter", c => c.length), 0, "before-sleep athkar are for reading, without counters");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("athkar: morning before Asr", async () => {
  const f = fixture("Makkah-UmmAlQura.json");
  const { ctx, page } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, at: "2016-03-05T07:00:00+03:00" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.goto(URL0 + "#athkar");
  await page.waitForSelector(".dhikr");
  eq(await page.textContent(".chips [aria-current]"), "Morning", "morning athkar open after Fajr");
  await ctx.close();
});

await test("duas: categories, search, a chapter with sources, and the 99 Names", async () => {
  const { ctx, page, errors } = await open({ tz: "UTC" });
  await page.click('.tabs a[data-tab="duas"]');
  await page.waitForSelector(".tile");
  eq(await page.$$eval(".tile", t => t.length), 11, "11 categories");
  await page.fill("#duaSearch", "travel");
  await page.waitForSelector("#duaResults .list-row");
  ok(await page.isHidden("#duaHome"), "categories hide while searching");
  const first = page.locator("#duaResults .list-row").first();
  ok(/travel/i.test(await first.textContent()), "a travel chapter comes first");
  await first.click();
  await page.waitForSelector(".dhikr .ref");
  ok(await page.$$eval(".dhikr", cs => cs.length > 0 && cs.every(c => c.querySelector(".ar").textContent.trim() && c.querySelector(".en").textContent.trim() && c.querySelector(".ref").textContent.trim())), "each dua has Arabic, English and its source");
  await page.click(".back");
  await page.waitForSelector(".list-row");
  ok((await page.textContent(".sec-head h1")).length > 2, "back goes to the category");
  await page.goto(URL0 + "#duas");
  await page.waitForSelector("#duaSearch");
  await page.fill("#duaSearch", "zzqx");
  await page.waitForSelector("#duaResults .state");
  await page.goto(URL0 + "#duas/names");
  await page.waitForSelector(".name");
  eq(await page.$$eval(".name", n => n.length), 99, "99 Names");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("hadith: forty hadith offline, a Bukhari chapter from the pinned source, gradings", async () => {
  const { ctx, page, errors } = await open({ tz: "UTC" });
  const seen = await serveHadith(ctx);
  await page.click('.tabs a[data-tab="hadith"]');
  await page.waitForSelector(".daily");
  ok((await page.textContent(".daily .eyebrow")).startsWith("Hadith of the day"), "hadith of the day");
  eq(await page.$$eval("#view .list-row", r => r.length), 9, "two forty-hadith books and seven collections");
  eq(await page.getAttribute("#quranLink", "href"), "https://maazarif.github.io/quran-app/", "header links to the Mushaf");
  await page.goto(URL0 + "#hadith/nawawi");
  await page.waitForSelector(".hadith");
  eq(await page.$$eval(".hadith", h => h.length), 42, "42 Nawawi hadith");
  await page.click(".hadith details summary");
  ok(await page.isVisible(".hadith details .ar"), "Arabic opens");
  await page.goto(URL0 + "#hadith/bukhari");
  await page.waitForSelector("#secList");
  eq(await page.$$eval("#secList .list-row", r => r.length), 97, "97 chapters of Bukhari");
  await page.fill("#secSearch", "revelation");
  eq(await page.$$eval("#secList .list-row:not([hidden])", r => r.length), 1, "chapter search");
  await page.click("#secList .list-row:not([hidden])");
  await page.waitForSelector(".hadith");
  const want = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/hadith/eng-bukhari-1.min.json"))).hadiths.filter(h => h.text.trim()).length;
  eq(await page.$$eval(".hadith", h => h.length), want, "every hadith of the chapter");
  eq(await page.textContent(".hadith .grade"), "Sahih · in Sahih al-Bukhari", "Bukhari's grading");
  ok(seen.every(u => u.includes("df57907be35291c91ad6a6691180e22ca9920784")) && seen.some(u => u.includes("eng-bukhari/sections/1")) && seen.some(u => u.includes("ara-bukhari/sections/1")), "English and Arabic from the pinned commit");
  ok(await page.isVisible('.pager a[href="#hadith/bukhari/2"]'), "link to the next chapter");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("hadith: a chapter that can't load says so and can be retried", async () => {
  const { ctx, page } = await open({ tz: "UTC" });
  await ctx.route(url => CDN.test(url.href), route => route.abort());
  await page.goto(URL0 + "#hadith/bukhari/1");
  await page.waitForSelector("#loadErr");
  ok((await page.textContent("#loadErr")).includes("Couldn't load"), "error message");
  await ctx.unrouteAll();
  await serveHadith(ctx);
  await page.click("#retry");
  await page.waitForSelector(".hadith");
  await ctx.close();
});

await test("phone layout: nothing wider than the screen, in light and dark", async () => {
  const f = fixture("Makkah-UmmAlQura.json");
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open({ tz: "Asia/Riyadh", lat: f.params.latitude, lng: f.params.longitude, viewport: { width: 320, height: 640 } });
    await page.emulateMedia({ colorScheme: scheme });
    await page.click("#useGps");
    await page.waitForSelector("#times li");
    for (const h of ["#prayer", "#qibla", "#athkar/morning", "#duas", "#duas/ch/27", "#duas/names", "#hadith", "#hadith/nawawi", "#hadith/bukhari"]) {
      await page.goto(URL0 + h);
      await page.waitForTimeout(250);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll on ${h} (${scheme})`);
    }
    await ctx.close();
  }
});

await test("works offline after the first visit", async () => {
  const f = fixture("Makkah-UmmAlQura.json");
  const ctx = await browser.newContext({ timezoneId: "Asia/Riyadh", geolocation: { latitude: f.params.latitude, longitude: f.params.longitude }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  await page.goto(URL0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.reload(); // let the service worker control the page
  await page.waitForSelector("#times li");
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("#times li", { timeout: 5000 });
  ok((await page.textContent("#hero")).length > 10, "next prayer shown offline");
  await page.goto(URL0 + "#qibla");
  await page.waitForSelector("#bearing", { timeout: 5000 });
  for (const [h, sel] of [["#athkar/morning", ".dhikr .counter"], ["#duas/ch/27", ".dhikr .ref"], ["#duas/names", ".name"], ["#hadith/qudsi", ".hadith"]]) {
    await page.goto(URL0 + h);
    await page.waitForSelector(sel, { timeout: 5000 });
  }
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
