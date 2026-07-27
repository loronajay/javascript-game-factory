// Shared Chrome launch + touch emulation for the mobile harness.
//
// Uses raw CDP rather than puppeteer's page.emulate() because we need three
// separate things and page.emulate() only reliably gives the first two:
//   1. setDeviceMetricsOverride  -> viewport size + `mobile: true`, which is what
//      makes `(pointer: coarse)` match. Without it, styles/responsive/touch.css
//      and every coarse-pointer gate in the game stay switched off and you are
//      just looking at a narrow desktop window.
//   2. setTouchEmulationEnabled  -> real TouchEvents, so boardTouchAssist's
//      pointer/tap-drift arbitration runs the same code path as a phone.
//   3. setEmitTouchEventsForMouse -> desktop mouse input is delivered AS touch,
//      which is what makes the window actually drivable by hand.

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find Chrome. Tried:\n${CHROME_CANDIDATES.map((c) => `  ${c}`).join("\n")}\n` +
        "Set CHROME_PATH to your Chrome executable.",
    );
  }
  return found;
}

// puppeteer-core lives in the repo-root node_modules. Node's resolver walks up
// from this file so a bare import works, but resolving explicitly keeps the
// script runnable from any cwd and gives a clearer error when it is missing.
export async function loadPuppeteer() {
  const require = createRequire(path.join(REPO_ROOT, "package.json"));
  try {
    const entry = require.resolve("puppeteer-core");
    return (await import(pathToFileURL(entry).href)).default;
  } catch (error) {
    throw new Error(
      `Could not load puppeteer-core from ${REPO_ROOT}. Run "npm install" in the repo root.\n${error.message}`,
    );
  }
}

export async function applyDeviceEmulation(page, device, { deviceScaleFactor } = {}) {
  const dsf = deviceScaleFactor ?? device.dsf;

  // Viewport metrics MUST go through page.setViewport, not a raw CDP session.
  // Puppeteer owns the page's own device-metrics override (it applies the 800x600
  // default on every newPage), and a competing override from a second CDP session
  // loses — which silently produces screenshots at the default size instead of the
  // device size. `isMobile` is what makes `(pointer: coarse)` match; `hasTouch`
  // gives real TouchEvents.
  await page.setViewport({
    width: device.width,
    height: device.height,
    deviceScaleFactor: dsf,
    isMobile: true,
    hasTouch: true,
    isLandscape: !device.portrait,
  });

  // Only this one has no puppeteer equivalent: deliver desktop mouse input as
  // touch, so the headful preview window is drivable by hand.
  const client = await page.createCDPSession();
  await client.send("Emulation.setEmitTouchEventsForMouse", {
    enabled: true,
    configuration: "mobile",
  });

  // A phone reports a mobile UA; some platform code and font loading branch on it.
  await page.setUserAgent(
    "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Mobile Safari/537.36",
  );

  return client;
}

// Collects the signals that actually indicate a broken boot, and ignores the
// noise that does not (favicon, and the analytics/platform calls that are
// expected to fail when there is no signed-in account).
export function watchForErrors(page, { ignore = [] } = {}) {
  const errors = [];
  const shouldIgnore = (text) =>
    text.includes("favicon") || ignore.some((pattern) => text.includes(pattern));

  page.on("pageerror", (error) => {
    const text = `[pageerror] ${error.message}`;
    if (!shouldIgnore(text)) errors.push(text);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Chrome logs a URL-less "Failed to load resource: ... 404" for every bad
    // response. The `response` listener below reports the same thing WITH the
    // URL, so keeping this one just produces unactionable noise.
    if (message.text().startsWith("Failed to load resource")) return;
    const text = `[console] ${message.text()}`;
    if (!shouldIgnore(text)) errors.push(text);
  });
  page.on("requestfailed", (request) => {
    const text = `[request] ${request.url()} — ${request.failure()?.errorText || "failed"}`;
    if (!shouldIgnore(text)) errors.push(text);
  });
  // A 404 is a successful HTTP exchange, so it never reaches `requestfailed`.
  // Without this the console just says "404 (Not Found)" with no URL.
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const text = `[http ${response.status()}] ${response.url()}`;
    if (!shouldIgnore(text)) errors.push(text);
  });

  return errors;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    if (!raw.startsWith("--")) {
      args._.push(raw);
      continue;
    }
    const [key, value] = raw.slice(2).split("=");
    args[key] = value === undefined ? true : value;
  }
  return args;
}
