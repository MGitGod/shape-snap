// Writes the copyright notices of every Rust crate linked into the Windows app
// to src-tauri/target/third-party-licenses-rust.txt. Fails when a crate has no notice.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(here, "..", "src-tauri");
const out = join(tauriDir, "target", "third-party-licenses-rust.txt");
const text = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
const stored = (name) => text(join(here, "license-texts", `${name}.txt`));

const meta = JSON.parse(execFileSync("cargo",
  ["metadata", "--format-version", "1", "--locked", "--filter-platform", "x86_64-pc-windows-msvc"],
  { cwd: tauriDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
const packages = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));

// Follow normal dependencies only (not build or dev).
const seen = new Set();
const stack = [meta.resolve.root];
while (stack.length > 0) {
  const id = stack.pop();
  if (seen.has(id)) continue;
  seen.add(id);
  for (const dep of nodes.get(id).deps) {
    if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
  }
}
seen.delete(meta.resolve.root);

const isNotice = (name) => /^(licen[sc]e|copying|notice|unlicense|copyright)/i.test(name);
function noticesIn(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => isNotice(e.name))
    .flatMap((e) => {
      const path = join(dir, e.name);
      if (!e.isDirectory()) return [text(path)];
      return readdirSync(path, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => text(join(path, f.name)));
    })
    .filter(Boolean);
}

const crates = [...seen].map((id) => packages.get(id)).sort((a, b) => (a.name < b.name ? -1 : 1));
// Every crate under MPL-2.0 carries the same full text.
const mpl = crates.filter((p) => p.license === "MPL-2.0")
  .flatMap((p) => noticesIn(dirname(p.manifest_path)))
  .find((t) => t.includes("Mozilla Public License"));
// Crates published without a license file; the texts come from their repositories.
const fallback = {
  "alloc-stdlib": stored("alloc-stdlib"),
  selectors: mpl,
  "webview2-com": stored("webview2-com"),
  "webview2-com-macros": stored("webview2-com"),
  "webview2-com-sys": stored("webview2-com"),
};

// Identical texts are printed once, with every crate that uses them.
const byText = new Map();
const add = (label, notice) => byText.set(notice, [...(byText.get(notice) ?? []), label]);
const missing = [];
for (const p of crates) {
  const label = `${p.name} ${p.version} (${p.license}) https://crates.io/crates/${p.name}/${p.version}`;
  const found = noticesIn(dirname(p.manifest_path));
  const notices = found.length > 0 ? found : [fallback[p.name]].filter(Boolean);
  if (notices.length === 0) missing.push(label);
  for (const notice of new Set(notices)) add(label, notice);
}
if (missing.length > 0) {
  console.error(`No license text for:\n${missing.join("\n")}`);
  process.exit(1);
}
add("Rust standard library (MIT OR Apache-2.0) https://www.rust-lang.org", stored("rust-std"));
add("Microsoft Edge WebView2 loader https://www.nuget.org/packages/Microsoft.Web.WebView2", stored("webview2-loader"));

const body = [...byText].map(([notice, labels]) =>
  `${"=".repeat(80)}\n${labels.join("\n")}\n${"-".repeat(80)}\n${notice}\n`);
const intro = "Third-party notices for the Rust parts of Shape Snap.\n"
  + "The source code of each crate is available at the address next to its name.\n";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${intro}\n${body.join("\n")}`);
console.log(`${crates.length} crates, ${byText.size} texts -> ${out}`);
