// Draws the app icon (1024x1024) with Playwright's chromium, then runs `tauri icon`.
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "src-tauri", "app-icon.png");
mkdirSync(dirname(out), { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="200" fill="#f4efe4"/>
  <rect x="190" y="230" width="420" height="420" rx="24" fill="#1d2330"/>
  <circle cx="650" cy="640" r="220" fill="#e8553d" fill-opacity="0.92"/>
</svg>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
} finally {
  await browser.close();
}

const r = spawnSync("npx", ["tauri", "icon", out], { cwd: root, stdio: "inherit", shell: true });
// desktop only: drop the mobile icon sets
for (const d of ["android", "ios"]) rmSync(resolve(root, "src-tauri", "icons", d), { recursive: true, force: true });
process.exit(r.status ?? 1);
