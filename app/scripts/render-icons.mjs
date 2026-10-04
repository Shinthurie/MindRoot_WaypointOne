// Renders the PWA icons from public/brand/logo.svg using headless Chrome (no image libraries needed).
// Brinjal logo on a coconut background. Usage: npm run icons
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!CHROME) throw new Error("Chrome or Edge not found");

const COCONUT = "#FBF8F1";
const root = resolve(".");
const tmp = mkdtempSync(join(tmpdir(), "wp-icons-"));
const logo = "data:image/svg+xml;base64," + readFileSync(join(root, "public/brand/logo.svg")).toString("base64");

// fill = share of the icon the logo occupies; maskable icons keep the logo inside Android's safe zone.
function render(out, size, { radius = 0, fill = 0.78 } = {}) {
  const html = join(tmp, `${size}-${radius}-${fill}.html`);
  const inner = Math.round(size * fill);
  writeFileSync(html, `<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;background:${COCONUT};border-radius:${radius}px;display:flex;align-items:center;justify-content:center">
<img src="${logo}" width="${inner}" height="${inner}"></div></body></html>`);
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    `--user-data-dir=${join(tmp, "profile")}`, `--window-size=${size},${size}`, `--screenshot=${join(root, out)}`, `file:///${html.replace(/\\/g, "/")}`,
  ], { stdio: "ignore" });
  console.log("wrote", out);
}

render("public/icons/icon-512.png", 512, { radius: 112 });
render("public/icons/icon-192.png", 192, { radius: 42 });
render("public/icons/maskable-512.png", 512, { fill: 0.6 });
render("public/icons/apple-touch-180.png", 180, { fill: 0.72 });
render("public/icons/favicon-32.png", 32, { radius: 7, fill: 0.92 });
