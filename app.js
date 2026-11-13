// Muslim Companion: prayer times and qibla, calculated on the phone (works offline).
// Prayer times and qibla bearing come from adhan-js (vendor/, MIT), which tests/times.test.mjs
// checks against published timetables for eight cities and methods.
import { PrayerTimes, Coordinates, CalculationMethod, Madhab, HighLatitudeRule, Qibla } from "./vendor/adhan-4.4.6.min.js";

import { $, esc, store, openSheet, closeSheet } from "./util.js";
import { viewAthkar, viewDuas, viewHadith } from "./content.js";
import * as Native from "./native.js";

// ---------- settings ----------
const ADJ_KEYS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const S = {
  loc: store.get("loc", null),          // { lat, lng, label }
  method: store.get("method", ""),      // "" = suggested for the location
  madhab: store.get("madhab", "Shafi"),
  hlr: store.get("hlr", "auto"),
  fmt: store.get("fmt", defaultFormat()),
  theme: store.get("theme", "auto"),
  hijriAdj: store.get("hijriAdj", 0),
  adj: Object.assign(Object.fromEntries(ADJ_KEYS.map(k => [k, 0])), store.get("adj", {})),
  // phone apps only: a notification at each prayer time
  notify: store.get("notify", false),
  notifyFor: Object.assign({ fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true }, store.get("notifyFor", {})),
  sound: store.get("sound", "chime"),
  day: 0                                // days from today shown on the Prayer tab
};
function save(k) { store.set(k, S[k]); }
function defaultFormat() {
  try { return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === false ? "24" : "12"; } catch (e) { return "12"; }
}

const METHODS = [
  { id: "MuslimWorldLeague", name: "Muslim World League", note: "Fajr 18°, Isha 17°. Widely used in Europe, the Far East and parts of the Americas." },
  { id: "NorthAmerica", name: "ISNA (North America)", note: "Fajr 15°, Isha 15°. Used by many masjids in the US and Canada." },
  { id: "MoonsightingCommittee", name: "Moonsighting Committee", note: "18° with seasonal adjustments. Often recommended for North America and the UK." },
  { id: "Egyptian", name: "Egyptian General Authority", note: "Fajr 19.5°, Isha 17.5°. Egypt, Syria, Lebanon, parts of Africa." },
  { id: "Karachi", name: "Karachi (University of Islamic Sciences)", note: "Fajr 18°, Isha 18°. Pakistan, India, Bangladesh, Afghanistan." },
  { id: "UmmAlQura", name: "Umm al-Qura, Makkah", note: "Fajr 18.5°, Isha 90 minutes after Maghrib. Saudi Arabia. In Ramadan, add +30 to Isha." },
  { id: "Dubai", name: "Dubai", note: "18.2° with small offsets. United Arab Emirates." },
  { id: "Qatar", name: "Qatar", note: "Fajr 18°, Isha 90 minutes after Maghrib." },
  { id: "Kuwait", name: "Kuwait", note: "Fajr 18°, Isha 17.5°." },
  { id: "Singapore", name: "Singapore, Malaysia, Indonesia", note: "Fajr 20°, Isha 18°." },
  { id: "Turkey", name: "Diyanet (Turkey)", note: "An approximation of the Diyanet method, less accurate outside Turkey." },
  { id: "Tehran", name: "Tehran (Institute of Geophysics)", note: "Fajr 17.7°, Isha 14°, Maghrib 4.5°." }
];
const methodInfo = id => METHODS.find(m => m.id === id) || METHODS[0];

// A sensible default for where the user is; they can always choose another in settings.
const REGIONS = [ // [south, north, west, east, method]  — smaller areas first
  [24.4, 26.2, 50.7, 51.7, "Qatar"], [28.5, 30.1, 46.5, 48.5, "Kuwait"], [22.6, 26.1, 51.5, 56.4, "Dubai"],
  [16, 32.2, 34.5, 55.7, "UmmAlQura"], [22, 31.7, 25, 35, "Egyptian"], [35.8, 42.2, 26, 44.8, "Turkey"],
  [25, 39.8, 44, 63.3, "Tehran"], [5, 37.1, 60.5, 92.7, "Karachi"], [-11, 7.5, 95, 141.1, "Singapore"],
  [49.8, 61, -11, 2, "MoonsightingCommittee"], [14.5, 72, -170, -50, "NorthAmerica"]
];
function suggestMethod(lat, lng) {
  const r = REGIONS.find(([s, n, w, e]) => lat >= s && lat <= n && lng >= w && lng <= e);
  return r ? r[4] : "MuslimWorldLeague";
}
const activeMethod = () => S.method || (S.loc ? suggestMethod(S.loc.lat, S.loc.lng) : "MuslimWorldLeague");

function params() {
  const p = CalculationMethod[activeMethod()]();
  p.madhab = S.madhab === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  p.highLatitudeRule = S.hlr === "auto" ? HighLatitudeRule.recommended(coords()) : HighLatitudeRule[S.hlr];
  for (const k of ADJ_KEYS) p.adjustments[k] = Number(S.adj[k]) || 0;
  return p;
}
const coords = () => new Coordinates(S.loc.lat, S.loc.lng);
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const timesFor = day => new PrayerTimes(coords(), day, params());

// ---------- display helpers ----------
const PRAYERS = [
  { k: "fajr", en: "Fajr", ar: "الفجر" },
  { k: "sunrise", en: "Sunrise", ar: "الشروق", minor: true },
  { k: "dhuhr", en: "Dhuhr", ar: "الظهر" },
  { k: "asr", en: "Asr", ar: "العصر" },
  { k: "maghrib", en: "Maghrib", ar: "المغرب" },
  { k: "isha", en: "Isha", ar: "العشاء" }
];
const isFriday = d => d.getDay() === 5;
function label(p, day) { return p.k === "dhuhr" && isFriday(day) ? { en: "Jumu'ah", ar: "الجمعة", sub: "Dhuhr time" } : p; }
function fmtTime(d) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: S.fmt === "12" }).format(d).replace(/ /g, " ");
}
function fmtDay(d, opts) { return new Intl.DateTimeFormat(undefined, opts).format(d); }
function hijri(d, lang) {
  const shifted = addDays(d, Number(S.hijriAdj) || 0);
  try {
    const loc = lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-arab" : "en-u-ca-islamic-umalqura";
    return new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" }).format(shifted);
  } catch (e) { return ""; }
}
function until(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 1) return "in less than a minute";
  const h = Math.floor(m / 60), r = m % 60;
  return "in " + (h ? h + " h " : "") + (r || !h ? r + " min" : "");
}

// What comes next from this moment, and which prayer's time we're in.
function upcoming(now) {
  const today = startOfDay(now), t = timesFor(today);
  let cur = null, next = null;
  for (const p of PRAYERS) {
    if (t[p.k] <= now) cur = p.minor ? null : p.k;
    else if (!next) next = { p, at: t[p.k], day: today };
  }
  if (!next) next = { p: PRAYERS[0], at: timesFor(addDays(today, 1)).fajr, day: addDays(today, 1) };
  if (!t.fajr || now < t.fajr) cur = "isha"; // before Fajr it is still last night's Isha
  return { cur, next };
}

// ---------- views ----------
const VIEWS = {
  prayer: viewPrayer, qibla: viewQibla,
  athkar: args => { leaving = viewAthkar(args, athkarDefault()); },
  duas: args => { leaving = viewDuas(args); },
  hadith: args => { leaving = viewHadith(args); }
};
// Morning athkar from Fajr until Asr, evening from Asr until the next Fajr.
function athkarDefault() {
  const now = new Date();
  if (!S.loc) return now.getHours() >= 15 || now.getHours() < 4 ? "evening" : "morning";
  const t = timesFor(startOfDay(now));
  return now >= t.asr || now < t.fajr ? "evening" : "morning";
}
let leaving = null; // cleanup for the current view (timers, sensors)
function route() {
  const [name, ...args] = decodeURIComponent(location.hash.slice(1) || "prayer").split("/");
  const view = VIEWS[name] ? name : "prayer";
  document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.tab === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (leaving) { leaving(); leaving = null; }
  $("view").innerHTML = "";
  VIEWS[view](args);
  if (location.hash !== lastHash) { window.scrollTo(0, 0); lastHash = location.hash; }
}
let lastHash = null;

const ICON = {
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  calc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  compass: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>'
};

function needLocation(why) {
  $("view").innerHTML = `<section class="card state" id="noLoc">
    <div class="ar">بِسْمِ اللَّهِ</div>
    <h2>Where are you?</h2>
    <p>${esc(why)} Your location stays on this phone.</p>
    <div class="row"><button class="btn primary" id="useGps">${ICON.locate}Use my location</button>
    <button class="btn" id="enterLoc">Enter it myself</button></div>
    <p class="err-text" id="gpsErr" hidden></p>
  </section>`;
  $("useGps").onclick = () => locate($("gpsErr"));
  $("enterLoc").onclick = locationSheet;
}

function locate(errEl) {
  const show = msg => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
  if (!navigator.geolocation) return show("This browser can't share your location. Enter it yourself instead.");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    setLocation({ lat: round(lat), lng: round(lng), label: S.loc?.label && S.loc.gps ? S.loc.label : "My location", gps: true });
  }, err => {
    show(err.code === 1
      ? "Location permission was turned off. Allow it in your browser's site settings, or enter your location yourself."
      : "Couldn't get your location just now. Try again, or enter it yourself.");
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}
const round = x => Math.round(x * 1e4) / 1e4;
function setLocation(loc) { S.loc = loc; save("loc"); closeSheet(); route(); syncAthan(); }

function viewPrayer() {
  if (!S.loc) return needLocation("Prayer times are worked out for your exact location.");
  const day = addDays(startOfDay(new Date()), S.day);
  const t = timesFor(day);
  const m = methodInfo(activeMethod());
  $("view").innerHTML = `
    <section class="page hero" id="hero"></section>
    <div class="turner">
      <button id="dayPrev" aria-label="Previous day">${ICON.prev}</button>
      <div class="mid"><b id="dayName"></b><span class="num" style="color:var(--muted);font-size:.8rem" id="dayHijri"></span>
        ${S.day ? '<br><button id="dayToday">Back to today</button>' : ""}</div>
      <button id="dayNext" aria-label="Next day">${ICON.next}</button>
    </div>
    <ul class="card times" id="times">${PRAYERS.map(p => { const l = label(p, day); return `
      <li data-k="${p.k}" class="${p.minor ? "minor" : ""}">
        <span class="n">${esc(l.en)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</span>
        <span class="ar">${l.ar}</span>
        <span class="t num">${t[p.k] ? fmtTime(t[p.k]) : "—"}</span>
      </li>`; }).join("")}</ul>
    <div class="meta">
      <button class="pill loc" id="locPill">${ICON.pin}<span>${esc(S.loc.label || "My location")}</span></button>
      <button class="pill" id="methodPill">${ICON.calc}<span>${esc(m.name)}${S.madhab === "Hanafi" ? " · Hanafi Asr" : ""}</span></button>
      <button class="pill" id="monthPill">${ICON.cal}<span>Month</span></button>
    </div>`;
  $("dayName").textContent = S.day === 0 ? "Today · " + fmtDay(day, { weekday: "long", day: "numeric", month: "short" })
    : S.day === 1 ? "Tomorrow · " + fmtDay(day, { weekday: "long", day: "numeric", month: "short" })
    : fmtDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("dayHijri").textContent = hijri(day, "en");
  $("dayPrev").onclick = () => { S.day--; route(); };
  $("dayNext").onclick = () => { S.day++; route(); };
  if ($("dayToday")) $("dayToday").onclick = () => { S.day = 0; route(); };
  $("locPill").onclick = locationSheet;
  $("methodPill").onclick = settingsSheet;
  $("monthPill").onclick = () => monthSheet(day);

  let shownNext = null, shownDay = startOfDay(new Date()).getTime();
  const tick = () => {
    const now = new Date();
    if (startOfDay(now).getTime() !== shownDay) return route(); // midnight passed
    const { cur, next } = upcoming(now);
    if (shownNext !== next.at.getTime()) {
      shownNext = next.at.getTime();
      const l = label(next.p, next.day);
      $("hero").innerHTML = `
        <span class="eyebrow">Next</span>
        <div class="name"><b>${esc(l.en)}</b><span class="ar">${l.ar}</span></div>
        <div class="at" id="nextAt">${fmtTime(next.at)}</div>
        <div class="left" id="left"></div>
        <div class="dates"><span class="ar">${hijri(now, "ar")}</span><i>·</i><span>${fmtDay(now, { weekday: "long", day: "numeric", month: "long" })}</span></div>`;
      document.querySelectorAll("#times li").forEach(li => {
        li.classList.toggle("now", S.day === 0 && li.dataset.k === cur);
        li.classList.toggle("next", S.day === 0 && li.dataset.k === next.p.k && next.day.getTime() === day.getTime());
      });
    }
    $("left").textContent = until(next.at - now);
  };
  tick();
  const timer = setInterval(tick, 1000);
  leaving = () => clearInterval(timer);
}

// ---------- qibla ----------
const KAABA = { lat: 21.4225241, lng: 39.8261818 };
function distanceKm(a, b) {
  const R = 6371.0088, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const point = deg => POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

function dialSvg(bearing) {
  let ticks = "";
  for (let a = 0; a < 360; a += 10) {
    const major = a % 90 === 0, r1 = major ? 112 : 117;
    const s = Math.sin(a * Math.PI / 180), c = -Math.cos(a * Math.PI / 180);
    ticks += `<line class="tick${major ? " major" : ""}" x1="${(s * r1).toFixed(1)}" y1="${(c * r1).toFixed(1)}" x2="${(s * 124).toFixed(1)}" y2="${(c * 124).toFixed(1)}"/>`;
  }
  const lbl = ["N", "E", "S", "W"].map((t, i) => {
    const a = i * 90 * Math.PI / 180;
    return `<text class="lbl${t === "N" ? " n" : ""}" x="${(Math.sin(a) * 98).toFixed(1)}" y="${(-Math.cos(a) * 98).toFixed(1)}">${t}</text>`;
  }).join("");
  return `<svg viewBox="-160 -160 320 320" role="img" aria-label="Qibla compass">
    <g class="rose" id="rose">
      <circle class="ring" r="130"/><circle class="inner" r="86"/>${ticks}${lbl}
      <g transform="rotate(${bearing.toFixed(2)})">
        <path class="needle" d="M0 -84 L9 -10 L0 -16 L-9 -10 Z"/>
        <g transform="translate(0 -146)"><rect class="kaaba" x="-10" y="-10" width="20" height="20" rx="2"/><rect class="kaaba-band" x="-10" y="-5" width="20" height="3"/></g>
      </g>
      <circle r="6" fill="var(--frame)"/>
    </g>
    <path class="heading" d="M0 -110 L0 -132"/>
  </svg>`;
}

function viewQibla() {
  if (!S.loc) return needLocation("The qibla direction depends on where you are.");
  const bearing = Qibla(coords());
  const km = distanceKm(S.loc, KAABA);
  $("view").innerHTML = `
    <section class="page qibla">
      <span class="eyebrow">Qibla · القبلة</span>
      <div class="dial" id="dial">${dialSvg(bearing)}</div>
      <div class="bearing num" id="bearing">${bearing.toFixed(0)}°<small>${point(bearing)} from north</small></div>
      <p class="hint" id="qHint">Tap the button and hold your phone flat. The Kaaba marker shows the way.</p>
      <div class="row"><button class="btn primary" id="startCompass">${ICON.compass}Start compass</button></div>
      <p class="note num">${Math.round(km).toLocaleString()} km to the Kaaba · ${esc(S.loc.label || "My location")}</p>
    </section>`;
  let heading = null, wasAligned = false, gotData = false, waiting = null;
  const rose = $("rose"), dial = $("dial"), hint = $("qHint");
  const screenAngle = () => (screen.orientation && screen.orientation.angle) || 0;
  function apply(h, accuracy) {
    gotData = true;
    heading = ((h + screenAngle()) % 360 + 360) % 360;
    rose.style.transform = `rotate(${-heading}deg)`;
    let diff = ((bearing - heading + 540) % 360) - 180; // -180..180, + means turn right
    const aligned = Math.abs(diff) <= 5;
    dial.classList.toggle("aligned", aligned);
    if (aligned && !wasAligned && navigator.vibrate) navigator.vibrate(40);
    wasAligned = aligned;
    if (accuracy != null && (accuracy < 0 || accuracy > 30)) { hint.className = "hint"; hint.textContent = "Move your phone in a figure-8 to calibrate the compass."; }
    else if (aligned) { hint.className = "hint ok"; hint.textContent = "You are facing the qibla."; }
    else { hint.className = "hint"; hint.textContent = `Turn ${diff > 0 ? "right" : "left"} ${Math.abs(Math.round(diff))}°`; }
  }
  const onIOS = e => { if (e.webkitCompassHeading != null) apply(e.webkitCompassHeading, e.webkitCompassAccuracy); };
  const onAbs = e => { if (e.alpha != null) apply(360 - e.alpha, null); };
  function stop() {
    window.removeEventListener("deviceorientation", onIOS);
    window.removeEventListener("deviceorientationabsolute", onAbs);
    clearTimeout(waiting);
  }
  async function start(auto) {
    const DOE = window.DeviceOrientationEvent;
    if (!auto && DOE && typeof DOE.requestPermission === "function") { // iPhone and iPad ask first
      try { if (await DOE.requestPermission() !== "granted") throw 0; }
      catch (e) { hint.textContent = "Compass access was not allowed. Face " + bearing.toFixed(0) + "° clockwise from north instead."; return; }
    }
    stop();
    window.addEventListener("deviceorientation", onIOS);
    window.addEventListener("deviceorientationabsolute", onAbs);
    $("startCompass").hidden = true;
    hint.textContent = "Hold your phone flat…";
    waiting = setTimeout(() => { if (!gotData) { hint.textContent = `No compass found on this device. Face ${bearing.toFixed(0)}° clockwise from north.`; $("startCompass").hidden = false; } }, 3000);
  }
  $("startCompass").onclick = () => start(false);
  if ("ondeviceorientationabsolute" in window) start(true); // Android: no permission prompt needed
  leaving = stop;
}

// ---------- sheets ----------
$("scrim").onclick = closeSheet;
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });

function locationSheet() {
  const l = S.loc || { lat: "", lng: "", label: "" };
  openSheet("Location", `
    <button class="btn primary" id="sheetGps">${ICON.locate}Use my current location</button>
    <p class="err-text" id="sheetErr" hidden></p>
    <label class="field"><span>Name</span><input type="text" id="locLabel" maxlength="40" placeholder="Home, Work, a city…" value="${esc(l.label || "")}"></label>
    <div class="two">
      <label class="field"><span>Latitude</span><input type="number" id="locLat" step="any" inputmode="decimal" placeholder="34.0522" value="${l.lat}"></label>
      <label class="field"><span>Longitude</span><input type="number" id="locLng" step="any" inputmode="decimal" placeholder="-118.2437" value="${l.lng}"></label>
    </div>
    <p class="note">To find coordinates, press and hold a place in your maps app.</p>
    <button class="btn" id="saveLoc">Save location</button>`);
  $("sheetGps").onclick = () => locate($("sheetErr"));
  $("saveLoc").onclick = () => {
    const lat = parseFloat($("locLat").value), lng = parseFloat($("locLng").value);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
      $("sheetErr").textContent = "Latitude must be between -90 and 90, and longitude between -180 and 180."; $("sheetErr").hidden = false; return;
    }
    setLocation({ lat: round(lat), lng: round(lng), label: $("locLabel").value.trim() || "My location", gps: false });
  };
}

function seg(id, options, value) {
  return `<div class="seg" id="${id}">${options.map(([v, t, sub]) =>
    `<button data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`).join("")}</div>`;
}
function onSeg(id, fn) {
  $(id).onclick = e => { const b = e.target.closest("button"); if (!b) return;
    $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); fn(b.dataset.v); };
}

function settingsSheet() {
  const suggested = S.loc ? methodInfo(suggestMethod(S.loc.lat, S.loc.lng)).name : null;
  openSheet("Settings", `${Native.isNative ? notifySection() : ""}
    <label class="field"><span>Calculation method</span>
      <select id="setMethod">
        ${suggested ? `<option value="">Suggested: ${esc(suggested)}</option>` : ""}
        ${METHODS.map(m => `<option value="${m.id}" ${S.method === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
      </select>
      <small id="methodNote">${esc(methodInfo(activeMethod()).note)}</small></label>
    <div class="field"><span>Asr time</span>${seg("setMadhab", [["Shafi", "Standard", "Shafi'i, Maliki, Hanbali"], ["Hanafi", "Hanafi", "Later Asr"]], S.madhab)}</div>
    <label class="field"><span>High latitudes</span>
      <select id="setHlr">
        ${[["auto", "Automatic (recommended)"], ["MiddleOfTheNight", "Middle of the night"], ["SeventhOfTheNight", "Seventh of the night"], ["TwilightAngle", "Twilight angle"]]
          .map(([v, t]) => `<option value="${v}" ${S.hlr === v ? "selected" : ""}>${t}</option>`).join("")}
      </select><small>Only matters far from the equator, where Fajr and Isha can be very early or late in summer.</small></label>
    <div class="field"><span>Adjust to your masjid (minutes)</span>
      <div class="adj">${ADJ_KEYS.map(k => `<label>${PRAYERS.find(p => p.k === k).en}<input type="number" data-adj="${k}" step="1" min="-60" max="60" inputmode="numeric" value="${S.adj[k] || 0}"></label>`).join("")}</div></div>
    <div class="field"><span>Hijri date</span>${seg("setHijri", [["-2", "−2"], ["-1", "−1"], ["0", "0"], ["1", "+1"], ["2", "+2"]], S.hijriAdj).replace('class="seg"', 'class="seg five"')}
      <small>Shift by a day if your local moonsighting differs.</small></div>
    <div class="field"><span>Time format</span>${seg("setFmt", [["12", "12-hour", "5:30 PM"], ["24", "24-hour", "17:30"]], S.fmt)}</div>
    <div class="field"><span>Appearance</span>${seg("setTheme", [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]], S.theme)}</div>
    <p class="note">Prayer times are calculated on your phone with the open-source adhan library and work without internet. Check them against your local masjid's timetable and adjust above if needed.</p>`);
  $("setMethod").onchange = e => { S.method = e.target.value; save("method"); $("methodNote").textContent = methodInfo(activeMethod()).note; refresh(); };
  onSeg("setMadhab", v => { S.madhab = v; save("madhab"); refresh(); });
  $("setHlr").onchange = e => { S.hlr = e.target.value; save("hlr"); refresh(); };
  $("sheet").querySelectorAll("[data-adj]").forEach(inp => inp.oninput = () => {
    const v = Math.max(-60, Math.min(60, parseInt(inp.value, 10) || 0)); S.adj[inp.dataset.adj] = v; save("adj"); refresh();
  });
  onSeg("setHijri", v => { S.hijriAdj = Number(v); save("hijriAdj"); refresh(); });
  onSeg("setFmt", v => { S.fmt = v; save("fmt"); refresh(); });
  onSeg("setTheme", v => { S.theme = v; save("theme"); applyTheme(); });
  if (Native.isNative) wireNotify();
}
// re-draw the page behind the open settings sheet (route() leaves the sheet alone), and move the notifications
function refresh() { route(); syncAthan(); }

// ---------- prayer notifications (phone apps) ----------
// Every notification for the coming days, in time order. Ids are the date and prayer: 2026111204 is Maghrib on 12 Nov 2026.
function athanEvents(from = new Date()) {
  if (!S.loc) return [];
  const on = PRAYERS.filter(p => S.notifyFor[p.k]);
  if (!on.length) return [];
  const days = Math.min(Native.MAX_DAYS, Math.floor(Native.LIMIT / on.length));
  const out = [], first = startOfDay(from);
  for (let i = 0; i < days + 1; i++) {
    const day = addDays(first, i), t = timesFor(day);
    for (const p of on) {
      const at = t[p.k];
      if (!at || at <= from) continue;
      const l = label(p, day), idx = PRAYERS.indexOf(p);
      const id = Number(`${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`) * 10 + idx;
      out.push({ id: id % 2147483647, at, prayer: p.k, title: `${l.en} · ${l.ar}`,
        body: p.k === "sunrise" ? `Sunrise at ${fmtTime(at)}. The time for Fajr has ended.`
          : `It's time for ${l.en}, ${fmtTime(at)} in ${S.loc.label || "your location"}.` });
    }
  }
  return out.slice(0, Native.LIMIT);
}

let syncTimer = null, lastSync = null;
// Re-schedules the notifications shortly after any change (debounced), and whenever the app is opened.
function syncAthan() {
  if (!Native.isNative) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      if (!S.notify || !S.loc) { await Native.cancelAll(); lastSync = { count: 0 }; }
      else if (await Native.permission() !== "granted") lastSync = { count: 0, blocked: true };
      else {
        const events = athanEvents();
        const count = await Native.schedule(events, S.sound);
        lastSync = { count, until: count ? events[count - 1].at : null };
      }
    } catch (e) { lastSync = { count: 0, error: String(e && e.message || e) }; }
    if ($("notifyStatus")) notifyStatus();
  }, 400);
}

function notifySection() {
  return `<div class="field"><span>Prayer notifications</span>
      ${seg("setNotify", [["on", "On"], ["off", "Off"]], S.notify ? "on" : "off")}
      <div class="seg six" id="setNotifyFor" ${S.notify ? "" : "hidden"}>${PRAYERS.map(p =>
        `<button data-v="${p.k}" aria-pressed="${!!S.notifyFor[p.k]}">${esc(p.en)}</button>`).join("")}</div>
      <div id="notifyMore" ${S.notify ? "" : "hidden"}>
        <div class="field"><span>Sound</span>${seg("setSound", Object.entries(Native.SOUNDS).map(([k, v]) => [k, v.name]), S.sound)}</div>
        <div class="row" style="justify-content:flex-start;margin-top:8px"><button class="btn" id="testNotify">Send a test in 3 seconds</button></div>
      </div>
      <small id="notifyStatus"></small>
      <div id="exactWarn" hidden><p class="note">Your phone may deliver these a few minutes late.</p>
        <button class="btn" id="allowExact">Allow on-time alerts</button></div>
    </div>`;
}

async function notifyStatus() {
  const el = $("notifyStatus"); if (!el) return;
  const perm = await Native.permission();
  let msg = "";
  if (perm === "denied") msg = "Notifications are turned off for this app. Turn them on in your phone's Settings, under Notifications.";
  else if (!S.notify) msg = "A notification at the start of each prayer time, even when the app is closed.";
  else if (!S.loc) msg = "Set your location first.";
  else if (lastSync && lastSync.error) msg = "Couldn't schedule notifications: " + lastSync.error;
  else if (lastSync && lastSync.count) msg = `Scheduled until ${fmtDay(lastSync.until, { weekday: "short", day: "numeric", month: "short" })}. Opening the app tops them up.`;
  else if (lastSync && !lastSync.count && !lastSync.blocked) msg = "No prayers selected.";
  el.textContent = msg;
  const warn = $("exactWarn");
  if (warn) warn.hidden = !(S.notify && perm === "granted" && await Native.exactAlarms() !== "granted");
}

function wireNotify() {
  onSeg("setNotify", async v => {
    if (v === "on" && await Native.permission() !== "granted" && await Native.requestPermission() !== "granted") {
      S.notify = false; save("notify");
      $("setNotify").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === "off")));
      notifyStatus(); return;
    }
    S.notify = v === "on"; save("notify");
    $("setNotifyFor").hidden = $("notifyMore").hidden = !S.notify;
    syncAthan(); notifyStatus();
  });
  $("setNotifyFor").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    S.notifyFor[b.dataset.v] = !S.notifyFor[b.dataset.v]; save("notifyFor");
    b.setAttribute("aria-pressed", String(S.notifyFor[b.dataset.v])); syncAthan();
  };
  onSeg("setSound", v => { S.sound = v; save("sound"); syncAthan(); });
  $("testNotify").onclick = async () => {
    await Native.test(S.sound, "Maghrib · المغرب", "This is how prayer notifications will look and sound.");
    $("notifyStatus").textContent = "A test notification will arrive in 3 seconds. You can lock your phone to see it.";
  };
  $("allowExact").onclick = () => Native.openExactAlarmSetting();
  notifyStatus();
}

function monthSheet(anyDay) {
  const first = new Date(anyDay.getFullYear(), anyDay.getMonth(), 1);
  const today = startOfDay(new Date()).getTime();
  let rows = "";
  for (let d = first; d.getMonth() === first.getMonth(); d = addDays(d, 1)) {
    const t = timesFor(d);
    rows += `<tr class="${d.getTime() === today ? "today" : ""}"><td>${fmtDay(d, { weekday: "short", day: "numeric" })}</td>${PRAYERS.map(p => `<td>${t[p.k] ? fmtTime(t[p.k]).replace(/ ?[AP]M$/i, "") : "—"}</td>`).join("")}</tr>`;
  }
  openSheet(fmtDay(first, { month: "long", year: "numeric" }), `
    <table class="month"><thead><tr><th>Day</th>${PRAYERS.map(p => `<th>${p.en}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <p class="note">${esc(methodInfo(activeMethod()).name)}${S.madhab === "Hanafi" ? ", Hanafi Asr" : ""} · ${esc(S.loc.label || "My location")}</p>`);
}

// ---------- install ----------
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; });
if (IOS && !STANDALONE && !Native.isNative) $("installBtn").hidden = false;
$("installBtn").onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installBtn").hidden = true; return; }
  openSheet("Install on your iPhone", `<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px">
    <li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li></ol>
    <p class="note">It then opens like an app and works without internet.</p>`);
};

// ---------- start ----------
function applyTheme() { if (S.theme === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = S.theme; }
$("openSettings").onclick = settingsSheet;
window.addEventListener("hashchange", () => { closeSheet(); route(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if ((location.hash || "#prayer").startsWith("#prayer")) route();
  syncAthan();
});
applyTheme();
if (Native.isNative) {
  document.documentElement.classList.add("native", "native-" + Native.platform);
  Native.onOpened(() => { if (!location.hash.startsWith("#prayer")) location.hash = "#prayer"; });
}
// Automated test builds of the phone apps include a seed.json with a location and settings (see tools/native.mjs).
async function applySeed() {
  if (!Native.isNative || store.get("seeded", false)) return;
  try {
    const r = await fetch("seed.json"); if (!r.ok) return;
    const d = await r.json();
    for (const k of ["loc", "method", "notify", "notifyFor", "sound"]) if (k in d) { S[k] = d[k]; save(k); }
    store.set("seeded", true);
    if (d.testIn) await Native.test(S.sound, "Test · اختبار", "A test notification from the automated build.", d.testIn);
  } catch (e) {}
}
applySeed().finally(() => { route(); syncAthan(); });
// The phone apps carry every file inside them, so they don't need the service worker.
if (!Native.isNative && "serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
