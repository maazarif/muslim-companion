// Builds data/*.json from the original sources. Nothing is typed by hand: the text is copied as it is in
// each source, with only line endings normalised and surrounding spaces trimmed.
//
//   node tools/build-content.mjs <Morning-And-Evening-Adhkar-DB> <muslim-data-ios> <hadith-api>
//
// The three arguments are checkouts of the repositories listed in data/SOURCES.md, at the commits listed
// there. The script refuses to run if any source file's checksum differs from the one recorded below.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const [adhkarDir, muslimDataDir, hadithDir] = process.argv.slice(2);
if (!hadithDir) { console.error("usage: node tools/build-content.mjs <adhkar-db> <muslim-data-ios> <hadith-api>"); process.exit(2); }
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data");
fs.mkdirSync(out, { recursive: true });

const SOURCES = {
  adhkar: path.join(adhkarDir, "en.json"),
  hisn: path.join(muslimDataDir, "Sources/MuslimData/Resources/muslim_db_v2.5.1.db"),
  hadithInfo: path.join(hadithDir, "info.json"),
  "eng-nawawi": path.join(hadithDir, "editions/eng-nawawi.json"),
  "ara-nawawi": path.join(hadithDir, "editions/ara-nawawi.json"),
  "eng-qudsi": path.join(hadithDir, "editions/eng-qudsi.json"),
  "ara-qudsi": path.join(hadithDir, "editions/ara-qudsi.json")
};
const EXPECTED = {
  adhkar: "eec053c4138bed6f3ec7dc3c0e06e926a935dca24663788e5b97a0bfb5f71896",
  hisn: "527913aaf9813d922f30f33a19cc59cea59d638206e57b2d8e28fb13d519deaa",
  hadithInfo: "cf1ced267ada8f606f95eb84e2b6ddfa87bfa2a6a9dd4cb2a5d9a8c1734f10fb",
  "eng-nawawi": "3c8124e3f633a576d1fb6e6a9cb352e162436781b15bc78188c28203ff08743d",
  "ara-nawawi": "91f559b90422005b768bb449426d87d2e6fabbb43ac3a31e5c24c50ca77465e6",
  "eng-qudsi": "4d9a35148af7b04ec41f6cc3dbaf0bdb82d2f2c93d03052ee229e86dd0f6c53c",
  "ara-qudsi": "8645482e46b9ab145b3a8b740ffc7dc6902cc1cc0a1845da35b2057ec23bb55a"
};
for (const [k, f] of Object.entries(SOURCES)) {
  const sum = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  if (sum !== EXPECTED[k]) { console.error(`checksum mismatch for ${k}: ${f}\n  expected ${EXPECTED[k]}\n  got      ${sum}`); process.exit(1); }
}
const clean = s => String(s ?? "").replace(/\r\n?/g, "\n").trim();
const write = (name, data) => { fs.writeFileSync(path.join(out, name), JSON.stringify(data)); console.log(`data/${name}  ${(fs.statSync(path.join(out, name)).size / 1024).toFixed(0)} KB`); };

// ---- Hisn al-Muslim (muslim-data, Apache-2.0): chapters, items, English translation and references
const db = new DatabaseSync(SOURCES.hisn, { readOnly: true });
const en = (table, idCol, valCol) => new Map(db.prepare(`select ${idCol} id, ${valCol} v from ${table} where language='en'`).all().map(r => [r.id, r.v]));
const catName = en("azkar_category_translation", "category_id", "category_name");
const chapName = en("azkar_chapter_translation", "chapter_id", "chapter_name");
const itemEn = en("azkar_item_translation", "item_id", "item_translation");
const refEn = new Map(db.prepare("select a.item_id id, r.reference v from azkar_reference a join azkar_reference_translation r on r.reference_id = a._id and r.language = 'en'").all().map(r => [r.id, r.v]));
const items = db.prepare("select _id, chapter_id, item from azkar_item order by _id").all();
const chapters = db.prepare("select _id, category_id from azkar_chapter order by _id").all();
const hisnItem = it => ({ id: it._id, ar: clean(it.item), en: clean(itemEn.get(it._id)), ref: clean(refEn.get(it._id)) });
const chapterItems = id => items.filter(i => i.chapter_id === id).map(hisnItem);
const categories = db.prepare("select _id from azkar_category order by _id").all().map(c => ({
  id: c._id, name: clean(catName.get(c._id)),
  chapters: chapters.filter(ch => ch.category_id === c._id).map(ch => ({ id: ch._id, name: clean(chapName.get(ch._id)), items: chapterItems(ch._id) }))
}));
const names = db.prepare("select n._id id, n.name ar, t.name en from name n join name_translation t on t.name_id = n._id and t.language = 'en' order by n._id").all()
  .map(r => ({ ar: clean(r.ar), en: clean(r.en) }));
write("duas.json", { categories, names });

// ---- Morning and evening athkar (Seen-Arabic, MIT): with repetition counts
const adhkar = JSON.parse(fs.readFileSync(SOURCES.adhkar, "utf8"));
const dhikr = x => ({ ar: clean(x.content), en: clean(x.translation), tr: clean(x.transliteration), count: x.count || 1, virtue: clean(x.fadl), ref: clean(x.source) });
const chapter = id => { const ch = chapters.find(c => c.id === id || c._id === id); return { name: clean(chapName.get(ch._id)), items: chapterItems(ch._id) }; };
write("athkar.json", {
  morning: adhkar.filter(x => x.type !== 2).sort((a, b) => a.order - b.order).map(dhikr),
  evening: adhkar.filter(x => x.type !== 1).sort((a, b) => a.order - b.order).map(dhikr),
  prayer: chapter(25).items,   // Remembrance after salam
  sleep: chapter(29).items,    // Before sleeping
  waking: chapter(1).items     // When waking up
});

// ---- Hadith (fawazahmed0/hadith-api, public domain)
const edition = n => JSON.parse(fs.readFileSync(SOURCES[n], "utf8"));
function forty(book) {
  const e = edition("eng-" + book), a = edition("ara-" + book);
  const arBy = new Map(a.hadiths.map(h => [h.hadithnumber, h.text]));
  return { name: e.metadata.name, hadiths: e.hadiths.filter(h => clean(h.text)).map(h => ({ n: h.hadithnumber, en: clean(h.text), ar: clean(arBy.get(h.hadithnumber)), grades: h.grades || [] })) };
}
write("hadith-forty.json", { nawawi: forty("nawawi"), qudsi: forty("qudsi") });

const info = JSON.parse(fs.readFileSync(SOURCES.hadithInfo, "utf8"));
const BOOKS = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "malik"];
write("hadith-books.json", BOOKS.map(id => {
  const m = info[id].metadata;
  return {
    id, name: m.name,
    sections: Object.keys(m.sections).map(Number).filter(n => n > 0 && clean(m.sections[n]))
      .map(n => { const d = m.section_details[n]; return { n, name: clean(m.sections[n]), first: d.hadithnumber_first, last: d.hadithnumber_last }; })
      .filter(s => s.first > 0)
  };
}));
