// Checks the bundled content: the files are exactly what the build produced from the recorded sources
// (checksums in data/SOURCES.md), and nothing is missing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(root, f));
const json = f => JSON.parse(read(f));
let failures = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.error("FAIL -", what); } };

// 1. checksums
const sources = read("data/SOURCES.md").toString();
const listed = [...sources.split("## Data file checksums")[1].matchAll(/^([0-9a-f]{64})\s+(\S+\.json)$/gm)];
ok(listed.length === 4, "four data files listed in SOURCES.md");
for (const [, sum, file] of listed) {
  const got = crypto.createHash("sha256").update(read("data/" + file)).digest("hex");
  ok(got === sum, `data/${file} matches its recorded checksum (rebuild with tools/build-content.mjs, never edit by hand)`);
}

// 2. completeness
const filled = x => typeof x === "string" && x.trim().length > 0;
const a = json("data/athkar.json");
ok(a.morning.length === 26 && a.evening.length === 24, "26 morning and 24 evening athkar");
for (const set of ["morning", "evening"]) a[set].forEach((x, i) => ok(filled(x.ar) && filled(x.en) && filled(x.ref) && x.count >= 1, `${set} ${i + 1} has Arabic, English, reference and a count`));
ok(a.morning.some(x => x.ar.includes("أَصْبَحْنَا")) && !a.morning.some(x => x.ar.startsWith("أمسينا")), "morning set has the morning wording, not the evening one");
ok(a.evening.some(x => x.ar.startsWith("أمسينا")) && !a.evening.some(x => x.ar.startsWith("أَصْبَحْنَا وَأَصْبَحَ")), "evening set has the evening wording, not the morning one");
for (const set of ["prayer", "sleep", "waking"]) { ok(a[set].length > 0, `${set} athkar present`); a[set].forEach((x, i) => ok(filled(x.ar) && filled(x.en) && filled(x.ref), `${set} ${i + 1} complete`)); }

const d = json("data/duas.json");
const chapters = d.categories.flatMap(c => c.chapters), items = chapters.flatMap(c => c.items);
ok(d.categories.length === 11 && chapters.length === 133 && items.length === 287, "Hisn al-Muslim: 11 categories, 133 chapters, 287 duas");
ok(items.every(x => filled(x.ar) && filled(x.en) && filled(x.ref)), "every dua has Arabic, English and a reference");
ok(chapters.every(c => filled(c.name) && c.items.length > 0), "every chapter is named and has duas");
ok(d.names.length === 99 && d.names.every(n => filled(n.ar) && filled(n.en)), "99 Names, each with a meaning");

const f = json("data/hadith-forty.json");
ok(f.nawawi.hadiths.length === 42 && f.qudsi.hadiths.length === 40, "42 Nawawi and 40 Qudsi hadith");
for (const k of ["nawawi", "qudsi"]) ok(f[k].hadiths.every(h => filled(h.ar) && filled(h.en)), `every ${k} hadith has Arabic and English`);

const books = json("data/hadith-books.json");
ok(books.map(b => b.id).join() === "bukhari,muslim,abudawud,tirmidhi,nasai,ibnmajah,malik", "seven collections in order");
for (const b of books) {
  ok(b.sections.length > 20, `${b.id} has its chapters`);
  ok(b.sections.every(s => s.n > 0 && s.name && s.first > 0 && s.first <= s.last), `${b.id} chapters are numbered, named and have valid ranges`);
}

// 3. the hadith CDN address in the app is pinned to the commit recorded in SOURCES.md
const app = read("content.js").toString();
ok(app.includes("df57907be35291c91ad6a6691180e22ca9920784") && sources.includes("df57907be35291c91ad6a6691180e22ca9920784"), "hadith chapters load from the recorded commit");

if (failures) { console.error(`FAIL: ${failures} of ${checks} content checks`); process.exit(1); }
console.log(`ok - ${checks} content checks pass`);
