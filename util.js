// Small helpers shared by app.js and content.js.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const store = {
  get(k, d) { try { const v = localStorage.getItem("companion:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("companion:" + k, JSON.stringify(v)); } catch (e) {} }
};
export function openSheet(title, html) {
  $("sheet").innerHTML = `<div class="sheet-inner"><div class="sheet-top"><h3>${esc(title)}</h3><button class="sheet-close" id="closeSheet">Done</button></div>${html}</div>`;
  $("sheet").hidden = false; $("scrim").hidden = false;
  $("closeSheet").onclick = closeSheet;
}
export function closeSheet() { $("sheet").hidden = true; $("scrim").hidden = true; }
// Loads a bundled JSON file once per session.
const cache = {};
export function loadJSON(url) {
  if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .catch(e => { delete cache[url]; throw e; });
  return cache[url];
}
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
