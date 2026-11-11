// Athkar, Duas and Hadith. All text comes from data/*.json, built from the sources in data/SOURCES.md
// by tools/build-content.mjs. The six large hadith collections load chapter by chapter from a pinned
// copy of fawazahmed0/hadith-api and are then kept for offline use by the service worker.
import { $, esc, store, loadJSON, todayKey } from "./util.js";

const BACK = '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
const head = (href, label, title, sub) => `<header class="sec-head">
  ${href ? `<a class="back" href="${href}">${BACK}<span>${esc(label)}</span></a>` : ""}
  <h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</header>`;
const loading = () => `<div class="card state"><div class="sk"><i></i><i></i><i></i></div>Loading…</div>`;
const failed = (msg, retry) => {
  $("view").insertAdjacentHTML("beforeend", `<div class="card state err" id="loadErr"><p>${esc(msg)}</p>${retry ? '<button class="btn" id="retry">Try again</button>' : ""}</div>`);
  if (retry) $("retry").onclick = retry;
};
const paras = s => esc(s).split(/\n+/).map(p => `<p>${p}</p>`).join("");

// ======================= Athkar =======================
const SETS = [
  { id: "morning", name: "Morning", ar: "أذكار الصباح" },
  { id: "evening", name: "Evening", ar: "أذكار المساء" },
  { id: "prayer", name: "After prayer", ar: "أذكار بعد السلام" },
  { id: "sleep", name: "Before sleep", ar: "أذكار النوم" },
  { id: "waking", name: "On waking", ar: "أذكار الاستيقاظ" }
];

export function viewAthkar([setId], fallback) {
  const set = SETS.find(s => s.id === setId) || SETS.find(s => s.id === fallback);
  $("view").innerHTML = `
    <nav class="chips" aria-label="Athkar">${SETS.map(s => `<a href="#athkar/${s.id}" ${s === set ? 'aria-current="page"' : ""}>${esc(s.name)}</a>`).join("")}</nav>
    <div id="athkarBody">${loading()}</div>`;
  $("view").querySelector('.chips [aria-current]')?.scrollIntoView({ block: "nearest", inline: "center" });
  let alive = true;
  loadJSON("data/athkar.json").then(data => { if (alive) renderAthkar(set, data[set.id]); })
    .catch(() => { if (alive) { $("athkarBody").innerHTML = ""; failed("Couldn't load the athkar. Check your connection and try again.", () => viewAthkar([set.id], fallback)); } });
  return () => { alive = false; };
}

function renderAthkar(set, list) {
  const counted = set.id === "morning" || set.id === "evening";
  const key = `athkar:${todayKey()}:${set.id}`;
  let left = store.get(key, null);
  if (!Array.isArray(left) || left.length !== list.length) left = list.map(x => x.count || 1);
  const save = () => store.set(key, left);
  const done = () => left.filter(n => n === 0).length;

  $("athkarBody").innerHTML = `
    <section class="page set-head">
      <div class="ar">${set.ar}</div>
      ${counted ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${list.length}"><i id="bar"></i></div>
      <p class="num" id="progressText"></p>` : `<p class="note">${list.length} remembrances from Hisn al-Muslim.</p>`}
    </section>
    ${list.map((x, i) => `
    <article class="card dhikr${counted && left[i] === 0 ? " done" : ""}" data-i="${i}">
      <div class="ar text">${paras(x.ar)}</div>
      <div class="en">${paras(x.en)}</div>
      ${x.tr ? `<details><summary>Transliteration</summary><div class="tr">${paras(x.tr)}</div></details>` : ""}
      ${x.virtue ? `<details><summary>Virtue and source</summary>${paras(x.virtue)}<div class="ref">${paras(x.ref)}</div></details>`
                 : `<div class="ref">${paras(x.ref)}</div>`}
      ${counted ? `<div class="count-row"><span class="times">${x.count > 1 ? `${x.count} times` : "Once"}</span>
        <button class="counter" aria-label="Count">${left[i] === 0 ? CHECK : `<b>${left[i]}</b>`}</button></div>` : ""}
    </article>`).join("")}
    ${counted ? `<div class="row"><button class="btn" id="resetAthkar">Start again</button></div>` : ""}`;

  if (!counted) return;
  const update = () => {
    $("bar").style.width = (done() / list.length * 100) + "%";
    $("progressText").textContent = done() === list.length ? "All done. May Allah accept it from you." : `${done()} of ${list.length} done`;
  };
  update();
  $("athkarBody").addEventListener("click", e => {
    const btn = e.target.closest(".counter"); if (!btn) return;
    const card = btn.closest(".dhikr"), i = Number(card.dataset.i);
    if (left[i] === 0) return;
    left[i]--; save();
    if (navigator.vibrate) navigator.vibrate(left[i] === 0 ? 30 : 8);
    if (left[i] === 0) {
      btn.innerHTML = CHECK; card.classList.add("done");
      const next = [...document.querySelectorAll(".dhikr")].find(c => left[Number(c.dataset.i)] > 0);
      if (next) next.scrollIntoView({ behavior: "smooth", block: "center" });
    } else btn.innerHTML = `<b>${left[i]}</b>`;
    update();
  });
  $("resetAthkar").onclick = () => { left = list.map(x => x.count || 1); save(); renderAthkar(set, list); window.scrollTo({ top: 0, behavior: "smooth" }); };
}

// ======================= Duas =======================
export function viewDuas([kind, id]) {
  $("view").innerHTML = loading();
  let alive = true;
  loadJSON("data/duas.json").then(d => {
    if (!alive) return;
    if (kind === "names") return renderNames(d.names);
    if (kind === "cat") { const c = d.categories.find(c => c.id === Number(id)); if (c) return renderCategory(c); }
    if (kind === "ch") {
      for (const c of d.categories) { const ch = c.chapters.find(h => h.id === Number(id)); if (ch) return renderChapter(c, ch); }
    }
    renderDuaHome(d);
  }).catch(() => { if (alive) { $("view").innerHTML = ""; failed("Couldn't load the duas. Check your connection and try again.", () => viewDuas([kind, id])); } });
  return () => { alive = false; };
}

function renderDuaHome(d) {
  $("view").innerHTML = `${head(null, "", "Duas", "From Hisn al-Muslim, the Fortress of the Muslim, with the source of each.")}
    <label class="search card">${SEARCH}<input id="duaSearch" type="search" placeholder="Search: travel, rain, anxiety…" autocomplete="off" aria-label="Search duas"></label>
    <div id="duaResults"></div>
    <div id="duaHome">
      <a class="page names-tile" href="#duas/names"><span class="ar">أسماء الله الحسنى</span><b>The 99 Names of Allah</b></a>
      <div class="tiles">${d.categories.map(c => `<a class="card tile" href="#duas/cat/${c.id}"><b>${esc(c.name)}</b><small>${c.chapters.length} ${c.chapters.length === 1 ? "chapter" : "chapters"}</small></a>`).join("")}</div>
    </div>`;
  const all = d.categories.flatMap(c => c.chapters.map(ch => ({ c, ch, hay: (ch.name + " " + c.name + " " + ch.items.map(i => i.en).join(" ")).toLowerCase() })));
  $("duaSearch").oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    $("duaHome").hidden = !!q;
    if (!q) { $("duaResults").innerHTML = ""; return; }
    const words = q.split(/\s+/);
    const hits = all.filter(x => words.every(w => x.hay.includes(w)))
      .sort((a, b) => (b.ch.name.toLowerCase().includes(q) ? 1 : 0) - (a.ch.name.toLowerCase().includes(q) ? 1 : 0));
    $("duaResults").innerHTML = hits.length
      ? `<div class="card list">${hits.map(x => chapterRow(x.ch, x.c.name)).join("")}</div>`
      : `<div class="card state"><p>Nothing found for “${esc(q)}”.</p></div>`;
  };
}
const chapterRow = (ch, sub) => `<a class="list-row" href="#duas/ch/${ch.id}"><span><b>${esc(ch.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><em>${ch.items.length}</em></a>`;

function renderCategory(c) {
  $("view").innerHTML = `${head("#duas", "Duas", c.name)}<div class="card list">${c.chapters.map(ch => chapterRow(ch)).join("")}</div>`;
}

function renderChapter(c, ch) {
  $("view").innerHTML = `${head(`#duas/cat/${c.id}`, c.name, ch.name)}
    ${ch.items.map(x => `<article class="card dhikr"><div class="ar text">${paras(x.ar)}</div><div class="en">${paras(x.en)}</div><div class="ref">${paras(x.ref)}</div></article>`).join("")}`;
}

function renderNames(names) {
  $("view").innerHTML = `${head("#duas", "Duas", "The 99 Names of Allah")}
    <div class="names">${names.map((n, i) => `<div class="card name"><span class="num">${i + 1}</span><span class="ar">${esc(n.ar)}</span><small>${esc(n.en)}</small></div>`).join("")}</div>`;
}

// ======================= Hadith =======================
const HADITH_SHA = "df57907be35291c91ad6a6691180e22ca9920784";
export const HADITH_CDN = [
  `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_SHA}/editions/`,
  `https://raw.githubusercontent.com/fawazahmed0/hadith-api/${HADITH_SHA}/editions/`
];
const BOOK_AR = { bukhari: "صحيح البخاري", muslim: "صحيح مسلم", abudawud: "سنن أبي داود", tirmidhi: "جامع الترمذي", nasai: "سنن النسائي", ibnmajah: "سنن ابن ماجه", malik: "موطأ مالك", nawawi: "الأربعون النووية", qudsi: "الأحاديث القدسية" };
const SAHIH = { bukhari: "Sahih al-Bukhari", muslim: "Sahih Muslim" };

async function fetchSection(lang, book, n) {
  let err;
  for (const base of HADITH_CDN) {
    try { const r = await fetch(`${base}${lang}-${book}/sections/${n}.min.json`); if (r.ok) return await r.json(); err = new Error("HTTP " + r.status); }
    catch (e) { err = e; }
  }
  throw err;
}

export function viewHadith([book, section]) {
  $("view").innerHTML = loading();
  let alive = true;
  const fail = (msg, retry) => { if (alive) { $("view").innerHTML = ""; failed(msg, retry); } };
  if (book === "nawawi" || book === "qudsi") {
    loadJSON("data/hadith-forty.json").then(d => alive && renderForty(book, d[book])).catch(() => fail("Couldn't load the hadith.", () => viewHadith([book])));
  } else if (book) {
    loadJSON("data/hadith-books.json").then(books => {
      if (!alive) return;
      const b = books.find(x => x.id === book);
      if (!b) return renderHadithHome();
      if (!section) return renderBook(b);
      const s = b.sections.find(x => x.n === Number(section));
      if (!s) return renderBook(b);
      $("view").innerHTML = head(`#hadith/${b.id}`, b.name, s.name) + loading();
      Promise.all([fetchSection("eng", b.id, s.n), fetchSection("ara", b.id, s.n).catch(() => null)])
        .then(([en, ar]) => alive && renderSection(b, s, en, ar))
        .catch(() => fail(navigator.onLine === false
          ? "This chapter hasn't been saved yet. Open it once while online and it will be available offline."
          : "Couldn't load this chapter. Check your connection and try again.", () => viewHadith([book, section])));
    }).catch(() => fail("Couldn't load the hadith collections.", () => viewHadith([book])));
  } else {
    loadJSON("data/hadith-forty.json").then(d => alive && renderHadithHome(d)).catch(() => alive && renderHadithHome());
  }
  return () => { alive = false; };
}

function dayNumber() { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }

function renderHadithHome(forty) {
  const daily = forty ? forty.nawawi.hadiths[dayNumber() % forty.nawawi.hadiths.length] : null;
  const row = (id, name, sub) => `<a class="list-row" href="#hadith/${id}"><span><b>${esc(name)}</b><small>${esc(sub)}</small></span><span class="ar">${BOOK_AR[id] || ""}</span></a>`;
  $("view").innerHTML = `${head(null, "", "Hadith")}
    ${daily ? `<article class="page daily"><span class="eyebrow">Hadith of the day · An-Nawawi ${daily.n}</span>
      <div class="en">${paras(daily.en)}</div><a class="more" href="#hadith/nawawi">Read the forty</a></article>` : ""}
    <h2 class="sub">Saved on this phone</h2>
    <div class="card list">${row("nawawi", "Forty Hadith of an-Nawawi", "42 hadith")}${row("qudsi", "Forty Hadith Qudsi", "40 hadith")}</div>
    <h2 class="sub">The six books and the Muwatta</h2>
    <p class="note">Each chapter downloads when you open it, then stays available offline.</p>
    <div class="card list">${[["bukhari", "Sahih al-Bukhari"], ["muslim", "Sahih Muslim"], ["abudawud", "Sunan Abu Dawud"], ["tirmidhi", "Jami at-Tirmidhi"], ["nasai", "Sunan an-Nasa'i"], ["ibnmajah", "Sunan Ibn Majah"], ["malik", "Muwatta Malik"]]
      .map(([id, n]) => row(id, n, "By chapter")).join("")}</div>
    <p class="note">Texts and gradings from the public-domain hadith-api collection by Fawaz Ahmed. Gradings are shown as each scholar gave them.</p>`;
}

function renderBook(b) {
  $("view").innerHTML = `${head("#hadith", "Hadith", b.name)}
    <label class="search card">${SEARCH}<input id="secSearch" type="search" placeholder="Find a chapter" autocomplete="off" aria-label="Find a chapter"></label>
    <div class="card list" id="secList">${b.sections.map(s => `<a class="list-row" href="#hadith/${b.id}/${s.n}" data-name="${esc(s.name.toLowerCase())}"><span><b>${s.n}. ${esc(s.name)}</b></span></a>`).join("")}</div>`;
  $("secSearch").oninput = e => { const q = e.target.value.trim().toLowerCase();
    $("secList").querySelectorAll(".list-row").forEach(a => { a.hidden = q && !a.dataset.name.includes(q); }); };
}

function grades(book, g) {
  if (g && g.length) return `<div class="grades">${g.map(x => `<span class="grade ${gradeClass(x.grade)}"><b>${esc(x.grade)}</b> · ${esc(x.name)}</span>`).join("")}</div>`;
  if (SAHIH[book]) return `<div class="grades"><span class="grade ok"><b>Sahih</b> · in ${SAHIH[book]}</span></div>`;
  return "";
}
function gradeClass(g) {
  g = String(g).toLowerCase();
  if (/(da.?if|daif|weak|munkar|mawdu|fabricat|shadh|batil)/.test(g)) return "weak";
  if (/(sahih|hasan)/.test(g)) return "ok";
  return "";
}
function hadithCard(book, h, ar) {
  return `<article class="card hadith" id="h${h.hadithnumber ?? h.n}">
    <span class="eyebrow num">Hadith ${h.hadithnumber ?? h.n}</span>
    <div class="en">${paras(h.text ?? h.en)}</div>
    ${ar ? `<details><summary>Arabic</summary><div class="ar text small">${paras(ar)}</div></details>` : ""}
    ${grades(book, h.grades)}
  </article>`;
}

function renderForty(book, d) {
  $("view").innerHTML = `${head("#hadith", "Hadith", d.name)}${d.hadiths.map(h => hadithCard(book, h, h.ar)).join("")}`;
}

function renderSection(b, s, en, ar) {
  const arBy = new Map((ar?.hadiths || []).map(h => [h.hadithnumber, h.text]));
  const list = en.hadiths.filter(h => String(h.text || "").trim());
  const i = b.sections.findIndex(x => x.n === s.n), prev = b.sections[i - 1], next = b.sections[i + 1];
  $("view").innerHTML = `${head(`#hadith/${b.id}`, b.name, s.name, `${list.length} hadith`)}
    ${list.map(h => hadithCard(b.id, h, arBy.get(h.hadithnumber))).join("")}
    <nav class="pager">${prev ? `<a class="btn" href="#hadith/${b.id}/${prev.n}">‹ ${esc(prev.name)}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#hadith/${b.id}/${next.n}">${esc(next.name)} ›</a>` : ""}</nav>`;
}
