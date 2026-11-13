// Runs the app as the Android and iOS apps see it, with a fake Capacitor bridge that records every call to the
// notifications plugin, and checks the prayer notifications it schedules against the published timetables.
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
  try {
    await Promise.race([fn(), new Promise((_, no) => setTimeout(() => no(new Error("timed out after 60 s")), 60000))]);
    passed++; console.log("ok -", name);
  }
  catch (e) { failed++; console.error("FAIL -", name, "\n   ", e.message.split("\n").slice(0, 6).join("\n    ")); }
}
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, what) => { if (!v) throw new Error(what); };

// The fake bridge: what Capacitor's Android/iOS native side would provide, with a LocalNotifications plugin in memory.
function bridge(platform, { permission = "prompt", grant = true, exact = "granted" } = {}) {
  return `(() => {
    ${platform === "android" ? "window.androidBridge = { postMessage() {} };" : "window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };"}
    const methods = ["schedule", "getPending", "cancel", "checkPermissions", "requestPermissions", "createChannel", "checkExactNotificationSetting", "changeExactNotificationSetting"];
    const ln = window.__ln = { pending: [], calls: [], channels: [], permission: ${JSON.stringify(permission)}, exact: ${JSON.stringify(exact)}, listeners: [] };
    const impl = {
      schedule: o => { for (const n of o.notifications) { ln.pending = ln.pending.filter(p => p.id !== n.id); ln.pending.push(n); } return { notifications: o.notifications.map(n => ({ id: n.id })) }; },
      getPending: () => ({ notifications: ln.pending.map(n => ({ id: n.id })) }),
      cancel: o => { const ids = new Set(o.notifications.map(n => n.id)); ln.pending = ln.pending.filter(p => !ids.has(p.id)); return {}; },
      checkPermissions: () => ({ display: ln.permission }),
      requestPermissions: () => { ln.permission = ${grant} ? "granted" : "denied"; return { display: ln.permission }; },
      createChannel: c => { ln.channels.push(c); return {}; },
      checkExactNotificationSetting: () => ({ exact_alarm: ln.exact }),
      changeExactNotificationSetting: () => ({ exact_alarm: ln.exact })
    };
    window.Capacitor = {
      PluginHeaders: [{ name: "LocalNotifications", methods: [...methods.map(name => ({ name, rtype: "promise" })), { name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }] }],
      // the real bridge sends options to native code as JSON, so dates arrive as ISO strings
      nativePromise: async (plugin, method, options) => { const o = JSON.parse(JSON.stringify(options || {})); ln.calls.push({ method, o }); return impl[method](o); },
      nativeCallback: (plugin, method, options, cb) => { ln.listeners.push(options.eventName); ln.fire = cb; return String(Math.random()); }
    };
  })();`;
}

async function open({ tz = "UTC", lat, lng, at, platform, ua, ...fake }) {
  const ctx = await browser.newContext({
    timezoneId: tz, locale: "en-US", viewport: { width: 390, height: 844 }, userAgent: ua,
    geolocation: lat != null ? { latitude: lat, longitude: lng } : undefined, permissions: lat != null ? ["geolocation"] : []
  });
  if (platform) await ctx.addInitScript(bridge(platform, fake));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (at) await page.clock.install({ time: new Date(at) });
  await page.goto(URL0);
  return { ctx, page, errors };
}
const ln = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__ln)));
const settle = page => page.clock.runFor(1000).catch(() => page.waitForTimeout(1000)); // scheduling is debounced by 400 ms
const hhmm = (iso, tz) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(iso)).replace(/ /g, " ");

const MAKKAH = fixture("Makkah-UmmAlQura.json");
const atMakkah = { tz: "Asia/Riyadh", lat: MAKKAH.params.latitude, lng: MAKKAH.params.longitude, at: "2016-03-05T10:00:00+03:00" };

await test("Android: turning notifications on asks once, then schedules 60 at the published times", async () => {
  const { ctx, page, errors } = await open({ ...atMakkah, platform: "android" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  eq((await ln(page)).pending.length, 0, "nothing scheduled until turned on");
  ok(await page.isHidden("#installBtn"), "no web Install button inside the app");
  await page.click("#openSettings");
  ok(await page.isVisible("#setNotify"), "notifications section in settings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  const s = await ln(page);
  eq(s.calls.filter(c => c.method === "requestPermissions").length, 1, "asked for permission once");
  eq(s.pending.length, 60, "60 notifications (iOS allows 64)");
  const day = MAKKAH.times.find(t => t.date === "2016-03-05");
  const first = s.pending.slice(0, 4);
  eq(first.map(n => hhmm(n.schedule.at, "Asia/Riyadh")), [day.dhuhr, day.asr, day.maghrib, day.isha], "today's remaining prayers at the timetable's times");
  eq(first.map(n => n.title), ["Dhuhr · الظهر", "Asr · العصر", "Maghrib · المغرب", "Isha · العشاء"], "titles");
  ok(first[2].body.includes(day.maghrib) && first[2].body.includes("Maghrib"), "body names the prayer and its time");
  eq(first.map(n => n.id), [201603052, 201603053, 201603054, 201603055], "ids are the date and prayer");
  ok(s.pending.every(n => n.channelId === "athan-chime" && n.sound === "chime.wav" && n.schedule.allowWhileIdle && n.smallIcon === "ic_stat_prayer"), "chime channel, on time in battery saving");
  ok(!s.pending.some(n => n.extra.prayer === "sunrise"), "sunrise is off by default");
  eq(new Set(s.pending.map(n => n.id)).size, 60, "ids are unique");
  const fri = s.pending.find(n => n.id === 201603112);
  eq(fri && fri.title, "Jumu'ah · الجمعة", "Friday's Dhuhr is Jumu'ah");
  eq(s.channels.map(c => c.id).sort(), ["athan-chime", "athan-system"], "one Android channel per sound");
  ok((await page.textContent("#notifyStatus")).startsWith("Scheduled until"), "says how far ahead they're scheduled");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("changing prayers, sound, method and location reschedules", async () => {
  const { ctx, page } = await open({ ...atMakkah, platform: "android", permission: "granted" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  await page.click('#setNotifyFor [data-v="isha"]');
  await settle(page);
  let s = await ln(page);
  ok(!s.pending.some(n => n.extra.prayer === "isha"), "Isha removed");
  eq(s.pending.length, 59, "three left today, then four a day for 14 days");
  await page.click('#setNotifyFor [data-v="sunrise"]');
  await page.click('#setSound [data-v="system"]');
  await settle(page);
  s = await ln(page);
  ok(s.pending.some(n => n.extra.prayer === "sunrise"), "sunrise added");
  ok(s.pending.every(n => n.channelId === "athan-system" && n.sound === "default"), "phone's own sound");
  const before = s.pending[0].schedule.at;
  await page.click('#setMadhab [data-v="Hanafi"]');
  await settle(page);
  s = await ln(page);
  const asr = s.pending.find(n => n.extra.prayer === "asr");
  ok(asr && new Date(asr.schedule.at) > new Date(before), "Hanafi Asr moves later");
  await page.click("#closeSheet");
  await page.click("#locPill");
  await page.fill("#locLat", "21.5"); await page.fill("#locLng", "39.2"); await page.fill("#locLabel", "Jeddah");
  await page.click("#saveLoc");
  await settle(page);
  s = await ln(page);
  ok(s.pending.find(n => n.extra.prayer === "dhuhr").body.includes("Jeddah"), "new location");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="off"]');
  await settle(page);
  eq((await ln(page)).pending.length, 0, "turning off cancels them all");
  await ctx.close();
});

await test("permission refused: stays off and says where to turn it on", async () => {
  const { ctx, page } = await open({ ...atMakkah, platform: "android", grant: false });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  eq(await page.getAttribute('#setNotify [data-v="off"]', "aria-pressed"), "true", "switch goes back to off");
  ok((await page.textContent("#notifyStatus")).includes("phone's Settings"), "explains where to allow it");
  eq((await ln(page)).pending.length, 0, "nothing scheduled");
  await ctx.close();
});

await test("Android exact alarms off: warns and opens the setting", async () => {
  const { ctx, page } = await open({ ...atMakkah, platform: "android", permission: "granted", exact: "denied" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  await page.waitForSelector("#exactWarn:not([hidden])");
  await page.click("#allowExact");
  ok((await ln(page)).calls.some(c => c.method === "changeExactNotificationSetting"), "opens the alarm setting");
  await ctx.close();
});

await test("opening the app tops the notifications up, and a test can be sent", async () => {
  const { ctx, page } = await open({ ...atMakkah, platform: "android", permission: "granted" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  await page.click("#closeSheet");
  await page.clock.fastForward(3 * 24 * 3600 * 1000); // three days later
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await settle(page);
  const s = await ln(page);
  eq(s.pending.length, 60, "still 60 ahead");
  ok(s.pending.every(n => new Date(n.schedule.at) > new Date("2016-03-08T10:00:00+03:00")), "none in the past");
  await page.click("#openSettings");
  await page.click("#testNotify");
  ok((await ln(page)).pending.some(n => n.id === 1 && n.title.startsWith("Maghrib")), "test notification");
  await ctx.close();
});

await test("iOS: no Install button on an iPhone, notifications use a bundled sound", async () => {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  const { ctx, page, errors } = await open({ ...atMakkah, platform: "ios", ua, permission: "granted" });
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  ok(await page.isHidden("#installBtn"), "Install button hidden in the iPhone app");
  ok(await page.evaluate(() => document.documentElement.classList.contains("native-ios")), "marked as the iOS app");
  eq(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, "no service worker inside the app");
  await page.click("#openSettings");
  await page.click('#setNotify [data-v="on"]');
  await settle(page);
  const s = await ln(page);
  eq(s.channels.length, 0, "no Android channels on iOS");
  ok(s.pending.length === 60 && s.pending.every(n => n.sound === "chime.wav"), "60 with the chime");
  eq(errors, [], "page errors");
  await ctx.close();
});

await test("test builds: a seed file sets the location and turns notifications on", async () => {
  const ctx = await browser.newContext({ timezoneId: "America/Los_Angeles", locale: "en-US" });
  await ctx.addInitScript(bridge("android", { permission: "granted" }));
  await ctx.route("**/seed.json", r => r.fulfill({ path: path.join(root, "tests/fixtures/native-seed.json"), contentType: "application/json" }));
  const page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForSelector("#times li");
  eq(await page.textContent("#locPill"), "Seattle", "seeded location");
  await page.waitForTimeout(1000);
  const s = await ln(page);
  ok(s.pending.some(n => n.id === 1), "test notification from the seed");
  ok(s.pending.filter(n => n.id !== 1).length === 60, "prayer notifications scheduled");
  await ctx.close();
});

await test("browser: no notification settings and no seed request", async () => {
  const seen = [];
  const { ctx, page } = await open({ ...atMakkah });
  page.on("request", r => seen.push(r.url()));
  await page.click("#useGps");
  await page.waitForSelector("#times li");
  await page.click("#openSettings");
  ok(!(await page.$("#setNotify")), "no notifications section on the web");
  await page.reload(); await page.waitForSelector("#times li");
  ok(!seen.some(u => u.endsWith("seed.json")), "seed.json never requested on the web");
  await ctx.close();
});

await test("hadith chapters opened in the app stay readable offline", async () => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  await ctx.addInitScript(bridge("android", {}));
  let served = 0;
  await ctx.route(/fawazahmed0\/hadith-api.*\/editions\//, r => {
    const m = r.request().url().match(/editions\/(\w+-\w+)\/sections\/(\d+)\.min\.json$/);
    const f = m && path.join(root, "tests/fixtures/hadith", `${m[1]}-${m[2]}.min.json`);
    served++;
    return f && fs.existsSync(f) ? r.fulfill({ path: f, contentType: "application/json" }) : r.fulfill({ status: 404 });
  });
  const page = await ctx.newPage();
  await page.goto(URL0 + "#hadith/bukhari/1");
  await page.waitForSelector(".hadith");
  const n = await page.$$eval(".hadith", h => h.length);
  await ctx.unrouteAll();
  await ctx.route(/fawazahmed0\/hadith-api/, r => r.abort());
  await page.reload();
  await page.waitForSelector(".hadith", { timeout: 5000 });
  eq(await page.$$eval(".hadith", h => h.length), n, "same chapter without the network");
  ok(served === 2, "downloaded once (English and Arabic)");
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
