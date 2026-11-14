// Copies the app's files into www/ — what GitHub Pages publishes and what goes inside the phone apps.
// Usage: node tools/build-www.mjs [--seed file.json]   (--seed is only for automated test builds)
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILES = ["index.html", "styles.css", "app.js", "util.js", "content.js", "native.js", "giving.js", "giving-calc.js", "sw.js", "manifest.webmanifest", "icons", "fonts", "vendor", "data"];
const out = path.join(root, "www");
fs.rmSync(out, { recursive: true, force: true });
for (const f of FILES) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
fs.rmSync(path.join(out, "data/SOURCES.md"), { force: true });
fs.writeFileSync(path.join(out, ".nojekyll"), "");
const i = process.argv.indexOf("--seed");
if (i > 0) fs.copyFileSync(path.resolve(process.argv[i + 1]), path.join(out, "seed.json"));
let n = 0; (function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : n++; })(out);
console.log(`www/: ${n} files${i > 0 ? " (with test seed)" : ""}`);
