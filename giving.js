// Giving: zakat calculator, zakat al-fitr and fidyah, a giving log, your charities, and reminders.
// Everything the user enters stays on the phone (localStorage). No money passes through the app: "Give" opens
// the charity's own website. The only download is the daily gold and silver price.
import { $, esc, store, openSheet, closeSheet, loadJSON } from "./util.js";
import { computeZakat, pricesFromFeed, RULES, FITR_DEFAULTS, NISAB_GRAMS, sum } from "./giving-calc.js";

// Daily prices from fawazahmed0/exchange-api (free, no key): 1 troy ounce of gold in 300+ currencies, and xag,
// the ounces of silver one ounce of gold buys. The second address is the project's own mirror.
export const PRICE_FEEDS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/xau.min.json"
];
const CURRENCIES = ["usd", "cad", "gbp", "eur", "aud", "nzd", "pkr", "inr", "bdt", "lkr", "sar", "aed", "qar", "kwd", "bhd", "omr", "jod", "egp", "mad", "try", "myr", "idr", "sgd", "zar", "ngn", "kes", "chf", "sek", "nok"];
const TYPES = { zakat: "Zakat", sadaqah: "Sadaqah", fitr: "Zakat al-fitr", fidyah: "Fidyah", other: "Other" };
const HADITH = [["nawawi", 3], ["nawawi", 23], ["nawawi", 25], ["nawawi", 26], ["qudsi", 11], ["qudsi", 18]];

// ---------- stored state ----------
const G = {
  get opts() { return { nisab: "silver", jewellery: "exclude", debts: "deduct", longTerm: "full", retirement: "accessible", year: "lunar", ...store.get("giving:opts", {}) }; },
  set opts(v) { store.set("giving:opts", v); },
  get values() { return store.get("giving:values", {}); },
  set values(v) { store.set("giving:values", v); },
  get currency() { return store.get("giving:currency", guessCurrency()); },
  set currency(v) { store.set("giving:currency", v); },
  get log() { return store.get("giving:log", []); },
  set log(v) { store.set("giving:log", v); },
  get charities() { return store.get("giving:charities", []); },
  set charities(v) { store.set("giving:charities", v); },
  get fitr() { return store.get("giving:fitr", { people: 1, days: 0 }); },
  set fitr(v) { store.set("giving:fitr", v); },
  get last() { return store.get("giving:last", null); },       // last zakat worked out: { at, zakat, currency }
  set last(v) { store.set("giving:last", v); },
  get zakatDate() { return store.get("giving:zakatDate", null); }, // Hijri { month, day }
  set zakatDate(v) { store.set("giving:zakatDate", v); },
  get remind() { return { zakat: false, fitr: false, friday: false, lastTen: false, ...store.get("giving:remind", {}) }; },
  set remind(v) { store.set("giving:remind", v); },
  get ownPrices() { return store.get("giving:ownPrices", null); }, // { goldGram, silverGram } typed by the user
  set ownPrices(v) { store.set("giving:ownPrices", v); }
};
function guessCurrency() {
  try { const r = new Intl.Locale(navigator.language).maximize().region;
    const by = { US: "usd", CA: "cad", GB: "gbp", AU: "aud", NZ: "nzd", PK: "pkr", IN: "inr", BD: "bdt", SA: "sar", AE: "aed", QA: "qar", KW: "kwd", EG: "egp", TR: "try", MY: "myr", ID: "idr", SG: "sgd", ZA: "zar", NG: "ngn", MA: "mad", JO: "jod", BH: "bhd", OM: "omr", KE: "kes", LK: "lkr", CH: "chf", SE: "sek", NO: "nok" };
    if (by[r]) return by[r];
    if (["DE", "FR", "NL", "BE", "AT", "IE", "IT", "ES", "PT", "FI", "GR"].includes(r)) return "eur";
  } catch (e) {}
  return "usd";
}
// Exact amounts (zakat due, gifts) always show cents; the working rounds big amounts to whole units.
const short = (x, cur) => money(x, cur, true);
const money = (x, cur = G.currency, round = false) => {
  const d = round && Math.abs(x) >= 1000 ? 0 : 2;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase(), minimumFractionDigits: d, maximumFractionDigits: d }).format(x); }
  catch (e) { return `${(Math.round(x * 100) / 100).toLocaleString()} ${cur.toUpperCase()}`; }
};
const curName = c => { try { return new Intl.DisplayNames(undefined, { type: "currency" }).of(c.toUpperCase()); } catch (e) { return c.toUpperCase(); } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };

// ---------- prices ----------
let feedLoad = null;
export async function loadPrices(force) {
  const cached = store.get("giving:feed", null);
  const fresh = cached && Date.now() - cached.fetched < 12 * 3600e3;
  if (fresh && !force) return cached;
  if (!feedLoad) feedLoad = (async () => {
    for (const url of PRICE_FEEDS) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const d = await r.json();
        if (d && d.xau && d.xau.xag > 0 && d.date) { const v = { date: d.date, fetched: Date.now(), xau: d.xau }; store.set("giving:feed", v); return v; }
      } catch (e) {}
    }
    return cached; // offline: keep the last prices we had
  })().finally(() => { feedLoad = null; });
  return feedLoad;
}
function currentPrices(feed) {
  const own = G.ownPrices;
  if (own && own.goldGram > 0 && own.silverGram > 0) return { ...own, own: true };
  const p = feed && pricesFromFeed(feed.xau, G.currency);
  return p ? { ...p, date: feed.date } : null;
}
const daysOld = iso => Math.floor((Date.now() - parseISO(iso).getTime()) / 864e5);

// ---------- dates (Hijri, from app.js) ----------
// The next day on or after `from` whose Hijri date is month/day. A 30th in a 29-day month falls on the 29th.
export function nextHijri(ctx, month, day, from = new Date()) {
  let prev = null;
  for (let i = 0; i < 400; i++) {
    const d = ctx.addDays(ctx.startOfDay(from), i), h = ctx.hijriParts(d);
    if (!h) return null;
    if (h.month === month && h.day === day) return d;
    if (prev && prev.h.month === month && h.month !== month && prev.h.day < day && i > 0) return prev.d;
    prev = { d, h };
  }
  return null;
}
const inDays = (d, ctx) => Math.round((ctx.startOfDay(d) - ctx.startOfDay(new Date())) / 864e5);
const whenText = (d, ctx) => { const n = inDays(d, ctx); return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`; };

// ---------- reminders (phone apps) ----------
// Notifications for the coming weeks, at most 12. app.js adds them to the prayer notifications.
export function givingEvents(ctx, from = new Date()) {
  const R = G.remind, out = [], end = ctx.addDays(from, 40);
  const at = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  const id = (d, kind) => 1e9 + ((d.getFullYear() % 100) * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 10 + kind;
  const push = (d, kind, title, body) => { if (d > from && d < end) out.push({ id: id(d, kind), at: d, prayer: "giving", title, body }); };
  const zd = G.zakatDate;
  if (R.zakat && zd) {
    const next = nextHijri(ctx, zd.month, zd.day, from);
    if (next) {
      const name = `${zd.day} ${ctx.HIJRI_EN[zd.month - 1]}`;
      push(at(ctx.addDays(next, -7), 10), 1, "Zakat · الزكاة", `Your zakat date, ${name}, is in a week. Open the calculator to work it out.`);
      push(at(next, 10), 2, "Zakat · الزكاة", `Today, ${name}, is your zakat date.`);
    }
  }
  if (R.fitr) {
    const d = nextHijri(ctx, 9, 27, from);
    if (d) push(at(d, 12), 3, "Zakat al-fitr · زكاة الفطر", "Ramadan is ending: give zakat al-fitr for everyone in your household before the Eid prayer.");
  }
  if (R.friday) {
    for (let i = 0; i < 14; i++) { const d = ctx.addDays(ctx.startOfDay(from), i); if (d.getDay() === 5) push(at(d, 10), 4, "Friday sadaqah · صدقة الجمعة", "A reminder to give something in charity today, however small."); }
  }
  if (R.lastTen) {
    for (let i = 0; i < 40; i++) {
      const d = ctx.addDays(ctx.startOfDay(from), i), h = ctx.hijriParts(d);
      if (h && h.month === 9 && h.day >= 20 && h.day <= 29) {
        const t = ctx.maghrib(d) || at(d, 18);
        push(new Date(t.getTime() + 15 * 60e3), 5, "The last ten nights · العشر الأواخر", `Tonight is night ${h.day + 1} of Ramadan. Give something, even a little, to catch Laylat al-Qadr.`);
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 12);
}
export const anyReminders = () => Object.values(G.remind).some(Boolean);

// ---------- views ----------
// Each screen draws into its own wrapper, so its listeners go away with it.
const render = html => { $("view").innerHTML = `<div class="gv">${html}</div>`; return $("view").firstElementChild; };
const BACK = '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>';
const head = (href, label, title, sub) => `<header class="sec-head">${href ? `<a class="back" href="${href}">${BACK}<span>${esc(label)}</span></a>` : ""}<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</header>`;
const seg = (id, options, value) => `<div class="seg" id="${id}">${options.map(([v, t, sub]) =>
  `<button data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`).join("")}</div>`;
function onSeg(id, fn) {
  $(id).onclick = e => { const b = e.target.closest("button"); if (!b) return;
    $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); fn(b.dataset.v); };
}
const why = key => `<button class="why" data-why="${key}" aria-label="Why: ${esc(RULES[key].title)}">Why?</button>`;
function whySheet(key) {
  const r = RULES[key];
  openSheet(r.title, `<p class="body-text">${esc(r.text)}</p><div class="sources"><span class="eyebrow">Sources</span>${r.sources.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</div>`);
}
function wireWhy(root) { root.addEventListener("click", e => { const b = e.target.closest("[data-why]"); if (b) whySheet(b.dataset.why); }); }

export function viewGiving([page], ctx) {
  const views = { zakat: viewZakat, fitr: viewFitr, log: viewLog, charities: viewCharities, reminders: viewReminders, learn: viewLearn };
  return (views[page] || viewHome)(ctx);
}

function viewHome(ctx) {
  const last = G.last, zd = G.zakatDate, year = new Date().getFullYear();
  const given = G.log.filter(e => e.date.startsWith(String(year)));
  const paidZakat = last ? sum(G.log.filter(e => e.type === "zakat" && e.currency === last.currency && e.date >= (last.date || todayISO())).map(e => e.amount)) : 0;
  const next = zd && nextHijri(ctx, zd.month, zd.day);
  const tile = (href, title, sub) => `<a class="card tile" href="${href}"><b>${esc(title)}</b><small>${esc(sub)}</small></a>`;
  const root = render(`${head(null, "", "Giving", "Zakat, sadaqah and charity. What you enter stays on this phone.")}
    <section class="page giving-sum">
      <div class="sum-row"><span class="eyebrow">Zakat date</span>
        ${zd ? `<b>${zd.day} ${esc(ctx.HIJRI_EN[zd.month - 1])}</b><small>${next ? `${esc(ctx.fmtDay(next, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))} · ${whenText(next, ctx)}` : ""}</small>`
             : `<small>Not set yet</small>`}
        <button class="pill" id="setZakatDate">${zd ? "Change" : "Set your zakat date"}</button></div>
      ${last ? `<div class="sum-row"><span class="eyebrow">Zakat worked out ${esc(ctx.fmtDay(new Date(last.at), { day: "numeric", month: "short" }))}</span>
        <b class="num">${money(last.zakat, last.currency)}</b>
        <small class="num">${paidZakat ? `${money(paidZakat, last.currency)} paid · ${money(Math.max(0, last.zakat - paidZakat), last.currency)} left` : "Nothing recorded as paid yet"}</small></div>` : ""}
      <div class="sum-row"><span class="eyebrow">Given in ${year}</span>
        <b class="num">${given.length ? totalsText(given) : "—"}</b><small>${given.length} ${given.length === 1 ? "gift" : "gifts"} recorded</small></div>
    </section>
    <div class="tiles">
      ${tile("#giving/zakat", "Zakat calculator", "Gold, savings, shares, 401(k)…")}
      ${tile("#giving/fitr", "Zakat al-fitr and fidyah", "Before Eid · missed fasts")}
      ${tile("#giving/log", "Giving log", "What you've given")}
      ${tile("#giving/charities", "My charities", "Give on their websites")}
      ${tile("#giving/reminders", "Reminders", ctx.isNative ? "Zakat date, Friday, Ramadan" : "In the phone apps")}
      ${tile("#giving/learn", "About zakat", "Rules, sources and hadith")}
    </div>
    <p class="note">A guide, not a fatwa. For a business, inheritance, trusts or anything unusual, ask a scholar you trust.</p>`);
  $("setZakatDate").onclick = () => zakatDateSheet(ctx, () => viewHome(ctx));
}
function totalsText(entries) {
  const by = {};
  for (const e of entries) by[e.currency] = (by[e.currency] || 0) + e.amount;
  return Object.entries(by).map(([c, v]) => money(v, c)).join(" + ");
}

function zakatDateSheet(ctx, done) {
  const zd = G.zakatDate || ctx.hijriParts(new Date());
  openSheet("Your zakat date", `
    <p class="note">The Hijri date each year when you work out and pay zakat, usually the day your wealth first reached the nisab.</p>
    <div class="two">
      <label class="field"><span>Day</span><select id="zdDay">${Array.from({ length: 30 }, (_, i) => `<option ${zd.day === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      <label class="field"><span>Month</span><select id="zdMonth">${ctx.HIJRI_EN.map((m, i) => `<option value="${i + 1}" ${zd.month === i + 1 ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
    </div>
    <p class="note" id="zdNext"></p>
    <div class="row" style="justify-content:flex-start"><button class="btn" id="zdToday">Use today's date</button><button class="btn primary" id="zdSave">Save</button></div>`);
  const show = () => { const d = nextHijri(ctx, +$("zdMonth").value, +$("zdDay").value); $("zdNext").textContent = d ? `Next: ${ctx.fmtDay(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (${whenText(d, ctx)}).` : ""; };
  $("zdDay").onchange = $("zdMonth").onchange = show; show();
  $("zdToday").onclick = () => { const h = ctx.hijriParts(new Date()); $("zdDay").value = String(h.day); $("zdMonth").value = String(h.month); show(); };
  $("zdSave").onclick = () => { G.zakatDate = { month: +$("zdMonth").value, day: +$("zdDay").value }; closeSheet(); ctx.resync(); done(); };
}

// ---------- zakat calculator ----------
const FIELDS = [
  ["Money", [["cash", "Cash and bank accounts", "At home, current and savings accounts"], ["owed", "Money owed to you", "That you expect to get back"]]],
  ["Gold and silver", [["goldGrams", "Gold (grams)", "Coins, bars, and jewellery you don't wear", "karat:goldKarat"], ["silverGrams", "Silver (grams)"],
    ["goldJewelGrams", "Gold jewellery you wear (grams)", "", "karat:goldJewelKarat", "jewel"], ["silverJewelGrams", "Silver jewellery you wear (grams)", "", null, "jewel"]]],
  ["Investments", [["trading", "Shares you hold to sell", "Market value today"], ["longTerm", "Long-term shares and funds", "Market value today"],
    ["longTermZakatable", "Their zakatable part", "Your share of the companies' zakatable assets", null, "portion"],
    ["retirement", "401(k), IRA, pension", "Balance today", null, "retire"], ["retirementCut", "Early-withdrawal penalty and tax (%)", "e.g. 10% penalty + your tax rate", null, "retire"],
    ["crypto", "Crypto", "Market value today"]]],
  ["Business and other", [["business", "Business stock and cash", "Goods for sale at their sale value"], ["other", "Other zakatable wealth"]]],
  ["Deduct", [["debts", "Debts and bills due now", "", null, "debts"]]]
];

function viewZakat(ctx) {
  const o = G.opts, v = G.values, cur = G.currency;
  const root = render(`${head("#giving", "Giving", "Zakat calculator", "2.5% of what you own above the nisab, once a lunar year.")}
    <details class="card choices" ${store.get("giving:choicesOpen", true) ? "open" : ""}><summary>Your choices</summary>
      <label class="field"><span>Currency</span><select id="zCur">${CURRENCIES.map(c => `<option value="${c}" ${c === cur ? "selected" : ""}>${c.toUpperCase()} · ${esc(curName(c))}</option>`).join("")}</select></label>
      <div class="field"><span>Nisab ${why("nisab")}</span>${seg("zNisab", [["silver", "Silver", "595 g · Hanafi"], ["gold", "Gold", "85 g · other schools"]], o.nisab)}</div>
      <div class="field"><span>Jewellery you wear ${why("jewellery")}</span>${seg("zJewel", [["exclude", "Not counted", "Maliki, Shafi'i, Hanbali"], ["include", "Counted", "Hanafi"]], o.jewellery)}</div>
      <div class="field"><span>Debts ${why("debts")}</span>${seg("zDebts", [["deduct", "Deduct", "Hanafi"], ["keep", "Don't deduct", "Shafi'i"]], o.debts)}</div>
      <div class="field"><span>Long-term shares ${why("shares")}</span>${seg("zLong", [["full", "Full value", "as a precaution"], ["portion", "Zakatable part", "FCNA method"]], o.longTerm)}</div>
      <div class="field"><span>Retirement accounts ${why("retirement")}</span>${seg("zRetire", [["accessible", "Each year", "AMJA, FCNA"], ["withdrawn", "When withdrawn"]], o.retirement)}</div>
      <div class="field"><span>Year ${why("year")}</span>${seg("zYear", [["lunar", "Lunar", "2.5%"], ["solar", "Solar", "2.577%"]], o.year)}</div>
    </details>
    <section class="card prices" id="zPrices"><p class="note">Loading today's gold and silver prices…</p></section>
    ${FIELDS.map(([group, fields]) => `<section class="card zgroup" data-group="${esc(group)}"><h2 class="sub">${esc(group)}</h2>${fields.map(([k, label, hint, extra, show]) => `
      <label class="zfield" data-show="${show || ""}"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
        <span class="zin">${extra && extra.startsWith("karat:") ? `<select data-k="${extra.slice(6)}" aria-label="Karat">${[24, 22, 21, 18, 14].map(n => `<option value="${n}" ${String(v[extra.slice(6)] || 24) === String(n) ? "selected" : ""}>${n}k</option>`).join("")}</select>` : ""}
        <input type="text" inputmode="decimal" data-k="${k}" value="${esc(v[k] ?? "")}" placeholder="0" autocomplete="off"></span></label>`).join("")}</section>`).join("")}
    <section class="page result" id="zResult" aria-live="polite"></section>
    <button class="zbar" id="zBar" aria-label="Show the working"><span id="zBarLabel"></span><b class="num" id="zBarAmount"></b></button>
    <div class="row"><button class="btn primary" id="zSave">Save as my zakat for this year</button><button class="btn" id="zPay">Record a payment</button></div>
    <p class="note">A guide, not a fatwa. If your situation is unusual, ask a scholar.</p>`);
  wireWhy(root);
  root.querySelector(".choices").ontoggle = e => store.set("giving:choicesOpen", e.target.open);
  const setOpt = (k, val) => { const x = G.opts; x[k] = val; G.opts = x; update(); };
  onSeg("zNisab", v => setOpt("nisab", v)); onSeg("zJewel", v => setOpt("jewellery", v)); onSeg("zDebts", v => setOpt("debts", v));
  onSeg("zLong", v => setOpt("longTerm", v)); onSeg("zRetire", v => setOpt("retirement", v)); onSeg("zYear", v => setOpt("year", v));
  $("zCur").onchange = e => { G.currency = e.target.value; G.ownPrices = null; renderPrices(); update(); };
  root.addEventListener("input", e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; const x = G.values; x[k] = e.target.value; G.values = x; update(); });
  root.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.k; if (!k || e.target.tagName !== "SELECT") return; const x = G.values; x[k] = e.target.value; G.values = x; update(); });

  let feed = store.get("giving:feed", null), result = null;
  function renderPrices() {
    const p = currentPrices(feed), own = G.ownPrices;
    const stale = p && !p.own && p.date && daysOld(p.date) > 7;
    $("zPrices").innerHTML = p ? `
      <div class="price-row"><span>Gold <b class="num">${money(p.goldGram)}/g</b></span><span>Silver <b class="num">${money(p.silverGram)}/g</b></span></div>
      <p class="note ${stale ? "warn" : ""}">${p.own ? "Your own prices." : `Prices from ${esc(p.date)}${stale ? `, ${daysOld(p.date)} days ago. Check them, or enter today's prices.` : ", updated daily."}`}
        <button class="why" id="ownToggle">${p.own ? "Use daily prices" : "Enter my own"}</button></p>
      <div class="two" id="ownBox" hidden>
        <label class="field"><span>Gold per gram</span><input id="ownGold" type="text" inputmode="decimal" value="${own ? own.goldGram : ""}"></label>
        <label class="field"><span>Silver per gram</span><input id="ownSilver" type="text" inputmode="decimal" value="${own ? own.silverGram : ""}"></label></div>`
      : `<p class="note warn">Couldn't load today's gold and silver prices. Enter them to work out the nisab (a jeweller or bullion site will have them):</p>
      <div class="two" id="ownBox">
        <label class="field"><span>Gold per gram (${G.currency.toUpperCase()})</span><input id="ownGold" type="text" inputmode="decimal" value="${own ? own.goldGram : ""}"></label>
        <label class="field"><span>Silver per gram (${G.currency.toUpperCase()})</span><input id="ownSilver" type="text" inputmode="decimal" value="${own ? own.silverGram : ""}"></label></div>`;
    if ($("ownToggle")) $("ownToggle").onclick = () => { if (p.own) { G.ownPrices = null; renderPrices(); update(); } else $("ownBox").hidden = false; };
    // saved, and the page redrawn, only once both prices are filled in
    $("ownGold").onchange = $("ownSilver").onchange = () => {
      const g = parseFloat($("ownGold").value), s = parseFloat($("ownSilver").value);
      if (g > 0 && s > 0) { G.ownPrices = { goldGram: g, silverGram: s }; renderPrices(); update(); }
    };
  }
  function update() {
    const o = G.opts;
    root.querySelectorAll(".zfield").forEach(f => {
      const s = f.dataset.show;
      const cut = !!f.querySelector('[data-k="retirementCut"]');
      f.hidden = (s === "portion" && o.longTerm !== "portion") || (cut && o.retirement !== "accessible");
      // shown but not counted under the user's choice
      f.classList.toggle("muted", (s === "jewel" && o.jewellery !== "include") || (s === "retire" && o.retirement !== "accessible") || (s === "debts" && o.debts !== "deduct"));
    });
    result = computeZakat(G.values, currentPrices(feed) || {}, o);
    const r = result;
    $("zResult").innerHTML = `
      ${r.lines.length ? `<table class="working">${r.lines.map(l => `<tr><td>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ""}</td><td class="num">${short(l.amount)}</td></tr>`).join("")}
        ${r.debts ? `<tr><td>Debts due now</td><td class="num">− ${short(r.debts)}</td></tr>` : ""}
        <tr class="total"><td>Zakatable wealth</td><td class="num">${short(r.net)}</td></tr></table>` : `<p class="note">Enter what you own above.</p>`}
      <p class="nisab-line">${r.missingPrice ? "Nisab: needs today's price." : `Nisab (${r.nisabGrams} g of ${r.metal}): <b class="num">${short(r.nisab)}</b>`}</p>
      <div class="verdict ${r.due ? "due" : ""}">
        <span class="eyebrow">${r.due ? "Zakat due" : "No zakat due"}</span>
        <b class="num" id="zakatDue">${money(r.zakat)}</b>
        <small>${r.due ? `${(r.rate * 100).toFixed(r.rate === 0.025 ? 1 : 3)}% of ${short(r.net)}` : r.missingPrice ? "" : r.net ? "Your zakatable wealth is below the nisab." : ""}</small>
      </div>`;
    $("zSave").disabled = !r.due;
    $("zBarLabel").textContent = r.missingPrice ? "Needs today's price" : r.due ? "Zakat due" : r.net ? "Below the nisab" : "Zakat";
    $("zBarAmount").textContent = money(r.zakat);
  }
  $("zBar").onclick = () => $("zResult").scrollIntoView({ behavior: "smooth", block: "center" });
  // the bar hides once the full working is on screen
  const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { if ($("zBar")) $("zBar").classList.toggle("away", e.isIntersecting); }) : null;
  if (io) io.observe($("zResult"));
  $("zSave").onclick = () => {
    if (!result || !result.due) return;
    // date: the local day, which is what gifts are recorded under (not the UTC day of the timestamp)
    G.last = { at: new Date().toISOString(), date: todayISO(), zakat: Math.round(result.zakat * 100) / 100, currency: G.currency };
    $("zSave").textContent = "Saved";
    setTimeout(() => { if ($("zSave")) $("zSave").textContent = "Save as my zakat for this year"; }, 1800);
  };
  $("zPay").onclick = () => addSheet(ctx, { type: "zakat", amount: result && result.due ? Math.round(result.zakat * 100) / 100 : "" });
  renderPrices(); update();
  let alive = true;
  loadPrices().then(f => { if (!alive || !f) { if (alive) renderPrices(); return; } feed = f; renderPrices(); update(); });
  return () => { alive = false; if (io) io.disconnect(); };
}

// ---------- zakat al-fitr and fidyah ----------
function viewFitr(ctx) {
  const f = G.fitr, cur = G.currency, def = FITR_DEFAULTS[cur];
  const mine = (f.amounts || {})[cur] || {}; // amounts are kept per currency
  const per = mine.perPerson ?? (def ? def.fitr : ""), perDay = mine.perDay ?? (def ? def.fidyah : "");
  const ram = nextHijri(ctx, 9, 1), eid = nextHijri(ctx, 10, 1);
  const inRamadan = ctx.hijriParts(new Date()).month === 9;
  const root = render(`${head("#giving", "Giving", "Zakat al-fitr and fidyah")}
    <p class="note">${inRamadan ? `Eid al-Fitr is expected ${eid ? esc(ctx.fmtDay(eid, { weekday: "long", day: "numeric", month: "long" })) : "soon"}.` : ram ? `Ramadan is expected to begin ${esc(ctx.fmtDay(ram, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} (${whenText(ram, ctx)}).` : ""} Dates depend on the moon sighting where you live. ${why("fitr")}</p>
    <section class="card zgroup"><h2 class="sub">Zakat al-fitr</h2>
      <label class="zfield"><span>People in your household<small>Including children</small></span><span class="zin"><input id="fPeople" type="number" min="0" step="1" inputmode="numeric" value="${esc(f.people ?? 1)}"></span></label>
      <label class="zfield"><span>Amount per person (${cur.toUpperCase()})<small>${def ? `${esc(def.by)}, ${def.year}` : "Ask your local masjid"}</small></span><span class="zin"><input id="fPer" type="text" inputmode="decimal" value="${esc(per)}"></span></label>
      <div class="verdict due"><span class="eyebrow">Zakat al-fitr</span><b class="num" id="fitrTotal"></b></div>
      <button class="btn" id="fitrPay">Record as given</button></section>
    <section class="card zgroup"><h2 class="sub">Fidyah</h2>
      <label class="zfield"><span>Days of Ramadan you can't fast or make up</span><span class="zin"><input id="fDays" type="number" min="0" step="1" inputmode="numeric" value="${esc(f.days ?? 0)}"></span></label>
      <label class="zfield"><span>Amount per day (${cur.toUpperCase()})<small>${def ? `${esc(def.by)}, ${def.year}` : "Ask your local masjid"}</small></span><span class="zin"><input id="fPerDay" type="text" inputmode="decimal" value="${esc(perDay)}"></span></label>
      <div class="verdict"><span class="eyebrow">Fidyah</span><b class="num" id="fidyahTotal"></b></div>
      <button class="btn" id="fidyahPay">Record as given</button></section>
    <p class="note">Currency: ${esc(curName(cur))}. Change it in the zakat calculator.</p>`);
  wireWhy(root);
  const n = id => Math.max(0, parseFloat($(id).value) || 0);
  const upd = () => {
    G.fitr = { ...G.fitr, people: n("fPeople"), days: n("fDays"), amounts: { ...(G.fitr.amounts || {}), [cur]: { perPerson: $("fPer").value, perDay: $("fPerDay").value } } };
    $("fitrTotal").textContent = money(n("fPeople") * n("fPer")); $("fidyahTotal").textContent = money(n("fDays") * n("fPerDay"));
  };
  root.addEventListener("input", upd); upd();
  $("fitrPay").onclick = () => addSheet(ctx, { type: "fitr", amount: n("fPeople") * n("fPer") || "", note: `${n("fPeople")} ${n("fPeople") === 1 ? "person" : "people"}` });
  $("fidyahPay").onclick = () => addSheet(ctx, { type: "fidyah", amount: n("fDays") * n("fPerDay") || "", note: `${n("fDays")} days` });
}

// ---------- log ----------
function viewLog(ctx) {
  const log = [...G.log].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const year = String(new Date().getFullYear()), thisYear = log.filter(e => e.date.startsWith(year));
  const byType = Object.keys(TYPES).map(t => [t, thisYear.filter(e => e.type === t)]).filter(([, l]) => l.length);
  const root = render(`${head("#giving", "Giving", "Giving log")}
    <div class="row" style="justify-content:flex-start"><button class="btn primary" id="logAdd">Add a gift</button></div>
    ${byType.length ? `<section class="card totals"><h2 class="sub">${year}</h2>${byType.map(([t, l]) => `<div class="tot"><span>${TYPES[t]}</span><b class="num">${totalsText(l)}</b></div>`).join("")}</section>` : ""}
    ${log.length ? `<div class="card list" id="logList">${log.map(e => `<div class="list-row log-row" data-id="${esc(e.id)}">
        <span><b class="num">${money(e.amount, e.currency)}</b><small>${esc(TYPES[e.type] || e.type)}${e.to ? ` · ${esc(e.to)}` : ""} · ${esc(ctx.fmtDay(parseISO(e.date), { day: "numeric", month: "short", year: "numeric" }))}${e.note ? ` · ${esc(e.note)}` : ""}</small></span>
        <button class="why" data-del="${esc(e.id)}" aria-label="Delete">Delete</button></div>`).join("")}</div>`
      : `<div class="card state"><p>Nothing recorded yet. Add what you give to keep track of your zakat and sadaqah.</p></div>`}
    <section class="card zgroup"><h2 class="sub">Back up</h2>
      <p class="note">Your log, charities and settings live only on this phone. Keep a copy somewhere safe.</p>
      <div class="row" style="justify-content:flex-start"><button class="btn" id="exportBtn">Export</button><button class="btn" id="importBtn">Import</button></div></section>`);
  $("logAdd").onclick = () => addSheet(ctx, {});
  if ($("logList")) $("logList").onclick = e => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    if (b.dataset.armed) { G.log = G.log.filter(x => x.id !== b.dataset.del); viewLog(ctx); }
    else { b.dataset.armed = "1"; b.textContent = "Tap to delete"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete"; } }, 3000); }
  };
  $("exportBtn").onclick = () => exportSheet();
  $("importBtn").onclick = () => importSheet(ctx);
}

function addSheet(ctx, pre) {
  const names = G.charities.map(c => c.name);
  openSheet("Add a gift", `
    <div class="field"><span>Type</span>${seg("gType", Object.entries(TYPES).map(([k, t]) => [k, t]), pre.type || "sadaqah")}</div>
    <div class="two"><label class="field"><span>Amount (${G.currency.toUpperCase()})</span><input id="gAmount" type="text" inputmode="decimal" value="${esc(pre.amount ?? "")}"></label>
      <label class="field"><span>Date</span><input id="gDate" type="date" value="${todayISO()}" max="${todayISO()}"></label></div>
    <label class="field"><span>To</span><input id="gTo" type="text" list="gToList" maxlength="80" placeholder="A charity, a person, your masjid…"><datalist id="gToList">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
    <label class="field"><span>Note</span><input id="gNote" type="text" maxlength="120" value="${esc(pre.note || "")}"></label>
    <p class="err-text" id="gErr" hidden></p>
    <button class="btn primary" id="gSave">Save</button>`);
  let type = pre.type || "sadaqah"; onSeg("gType", v => { type = v; });
  $("gSave").onclick = () => {
    const amount = parseFloat(String($("gAmount").value).replace(/,/g, ""));
    if (!(amount > 0)) { $("gErr").textContent = "Enter an amount."; $("gErr").hidden = false; return; }
    const date = $("gDate").value || todayISO();
    G.log = [...G.log, { id: uid(), type, amount: Math.round(amount * 100) / 100, currency: G.currency, date, to: $("gTo").value.trim(), note: $("gNote").value.trim() }];
    closeSheet();
    if (location.hash === "#giving/log") viewLog(ctx); else location.hash = "#giving/log";
  };
}

const BACKUP_KEYS = ["log", "charities", "opts", "values", "currency", "fitr", "last", "zakatDate", "remind", "ownPrices"];
function exportSheet() {
  const data = JSON.stringify({ app: "muslim-companion", kind: "giving", version: 1, exported: new Date().toISOString(),
    ...Object.fromEntries(BACKUP_KEYS.map(k => [k, store.get("giving:" + k, null)]).filter(([, v]) => v != null)) });
  openSheet("Export", `<p class="note">Copy this and keep it somewhere safe (notes, email to yourself). Import it on another phone to bring everything back.</p>
    <textarea id="expText" class="code" readonly rows="8">${esc(data)}</textarea>
    <div class="row" style="justify-content:flex-start"><button class="btn primary" id="expCopy">Copy</button>${navigator.share ? '<button class="btn" id="expShare">Share</button>' : ""}</div>`);
  $("expCopy").onclick = async () => { try { await navigator.clipboard.writeText(data); $("expCopy").textContent = "Copied"; } catch (e) { $("expText").select(); document.execCommand && document.execCommand("copy"); $("expCopy").textContent = "Copied"; } };
  if ($("expShare")) $("expShare").onclick = () => navigator.share({ title: "Giving backup", text: data }).catch(() => {});
}
function importSheet(ctx) {
  openSheet("Import", `<p class="note">Paste a copy made with Export. Gifts and charities are added to what's here; settings are replaced.</p>
    <textarea id="impText" class="code" rows="8" placeholder='{"app":"muslim-companion", …}'></textarea>
    <p class="err-text" id="impErr" hidden></p><button class="btn primary" id="impGo">Import</button>`);
  $("impGo").onclick = () => {
    let d; try { d = JSON.parse($("impText").value); } catch (e) { d = null; }
    if (!d || d.app !== "muslim-companion" || d.kind !== "giving") { $("impErr").textContent = "That isn't a Giving backup from this app."; $("impErr").hidden = false; return; }
    const merge = (cur, add) => { const ids = new Set(cur.map(x => x.id)); return [...cur, ...(Array.isArray(add) ? add : []).filter(x => x && x.id && !ids.has(x.id))]; };
    G.log = merge(G.log, d.log); G.charities = merge(G.charities, d.charities);
    for (const k of BACKUP_KEYS) if (!["log", "charities"].includes(k) && d[k] != null) store.set("giving:" + k, d[k]);
    closeSheet(); ctx.resync(); viewLog(ctx);
  };
}

// ---------- charities ----------
function viewCharities(ctx) {
  const list = G.charities;
  const root = render(`${head("#giving", "Giving", "My charities", "Your own list. Give opens the charity's website, where you pay them directly.")}
    <div class="row" style="justify-content:flex-start"><button class="btn primary" id="chAdd">Add a charity</button></div>
    ${list.length ? `<div class="card list" id="chList">${list.map(c => `<div class="list-row ch-row" data-id="${esc(c.id)}">
        <span><b>${esc(c.name)}</b><small>${esc(host(c.url))}${c.zakat ? " · accepts zakat" : ""}${c.note ? ` · ${esc(c.note)}` : ""}</small></span>
        <span class="ch-actions"><a class="btn primary give" href="${esc(c.url)}" ${ctx.isNative ? "" : 'target="_blank"'} rel="noopener">Give</a><button class="why" data-edit="${esc(c.id)}">Edit</button></span></div>`).join("")}</div>`
      : `<div class="card state"><p>Add the charities and masjids you give to, with their donation pages, so they're one tap away.</p>
        <p class="note">Before giving zakat, check the charity says it distributes zakat to those eligible for it. Ratings: <a href="https://www.charitynavigator.org/" target="_blank" rel="noopener">Charity Navigator</a>, <a href="https://www.guidestar.org/" target="_blank" rel="noopener">Candid</a>.</p></div>`}`);
  $("chAdd").onclick = () => charitySheet(ctx, null);
  if ($("chList")) $("chList").onclick = e => { const b = e.target.closest("[data-edit]"); if (b) charitySheet(ctx, G.charities.find(c => c.id === b.dataset.edit)); };
}
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
export function cleanUrl(s) {
  s = String(s || "").trim(); if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : null; } catch (e) { return null; }
}
function charitySheet(ctx, c) {
  openSheet(c ? "Edit charity" : "Add a charity", `
    <label class="field"><span>Name</span><input id="cName" type="text" maxlength="60" value="${esc(c ? c.name : "")}"></label>
    <label class="field"><span>Donation page</span><input id="cUrl" type="url" inputmode="url" placeholder="https://…" value="${esc(c ? c.url : "")}"></label>
    <label class="check"><input id="cZakat" type="checkbox" ${c && c.zakat ? "checked" : ""}> Accepts zakat</label>
    <label class="field"><span>Note</span><input id="cNote" type="text" maxlength="80" value="${esc(c ? c.note || "" : "")}"></label>
    <p class="err-text" id="cErr" hidden></p>
    <div class="row" style="justify-content:flex-start"><button class="btn primary" id="cSave">Save</button>${c ? '<button class="btn" id="cDel">Remove</button>' : ""}</div>`);
  $("cSave").onclick = () => {
    const name = $("cName").value.trim(), url = cleanUrl($("cUrl").value);
    const err = !name ? "Enter a name." : !url ? "Enter the web address of their donation page, like https://example.org/donate." : "";
    if (err) { $("cErr").textContent = err; $("cErr").hidden = false; return; }
    const item = { id: c ? c.id : uid(), name, url, zakat: $("cZakat").checked, note: $("cNote").value.trim() };
    G.charities = c ? G.charities.map(x => x.id === c.id ? item : x) : [...G.charities, item];
    closeSheet(); viewCharities(ctx);
  };
  if ($("cDel")) $("cDel").onclick = () => { G.charities = G.charities.filter(x => x.id !== c.id); closeSheet(); viewCharities(ctx); };
}

// ---------- reminders ----------
function viewReminders(ctx) {
  const R = G.remind, zd = G.zakatDate;
  const row = (k, title, sub) => `<div class="zfield"><span>${esc(title)}<small>${esc(sub)}</small></span>${seg("r_" + k, [["on", "On"], ["off", "Off"]], R[k] ? "on" : "off").replace('class="seg"', 'class="seg small"')}</div>`;
  const root = render(`${head("#giving", "Giving", "Reminders")}
    ${ctx.isNative ? `<section class="card zgroup">
      ${row("zakat", "Zakat date", zd ? `A week before and on ${zd.day} ${ctx.HIJRI_EN[zd.month - 1]}` : "Set your zakat date first")}
      ${row("fitr", "Zakat al-fitr", "On the 27th of Ramadan")}
      ${row("friday", "Friday sadaqah", "Fridays at 10 am")}
      ${row("lastTen", "The last ten nights", "Each night of the last ten of Ramadan, after Maghrib")}
      <p class="note" id="rStatus"></p></section>
      <div class="row" style="justify-content:flex-start"><button class="btn" id="rDate">${zd ? "Change zakat date" : "Set your zakat date"}</button></div>`
    : `<div class="card state"><p>Reminders need the Android or iPhone app, which can send notifications when it's closed.</p></div>`}`);
  if (!ctx.isNative) return;
  for (const k of ["zakat", "fitr", "friday", "lastTen"]) onSeg("r_" + k, async v => {
    if (v === "on" && !(await ctx.requestNotify())) {
      $("r_" + k).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === "off")));
      $("rStatus").textContent = "Notifications are turned off for this app. Turn them on in your phone's Settings, under Notifications."; return;
    }
    const x = G.remind; x[k] = v === "on"; G.remind = x; ctx.resync();
    $("rStatus").textContent = k === "zakat" && v === "on" && !G.zakatDate ? "Set your zakat date so the reminder knows when to come." : "";
  });
  $("rDate").onclick = () => zakatDateSheet(ctx, () => viewReminders(ctx));
}

// ---------- about zakat ----------
function viewLearn(ctx) {
  const root = render(`${head("#giving", "Giving", "About zakat", "How the calculator works, and where each rule comes from.")}
    ${Object.entries(RULES).map(([k, r]) => `<article class="card dhikr"><h2 class="rule">${esc(r.title)}</h2><p class="body-text">${esc(r.text)}</p>
      <div class="sources">${r.sources.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</div></article>`).join("")}
    <h2 class="sub">From the hadith</h2><div id="gHadith"><div class="card state">Loading…</div></div>
    <p class="note">Gold and silver prices: the free daily feed from fawazahmed0/exchange-api. You can always enter your own.</p>`);
  let alive = true;
  loadJSON("data/hadith-forty.json").then(d => {
    if (!alive) return;
    $("gHadith").innerHTML = HADITH.map(([b, n]) => { const h = d[b].hadiths.find(x => x.n === n); return h ? `<article class="card hadith">
      <span class="eyebrow">${b === "nawawi" ? "An-Nawawi" : "Hadith Qudsi"} ${n}</span><div class="en">${esc(h.en).split(/\n+/).map(p => `<p>${p}</p>`).join("")}</div>
      <a class="more" href="#hadith/${b}">${esc(d[b].name)}</a></article>` : ""; }).join("");
  }).catch(() => { if (alive) $("gHadith").innerHTML = ""; });
  return () => { alive = false; };
}
