// Headless mobile screenshot matrix: drives Tactical Arena through its key
// screens across every phone profile and writes true-DPR PNGs, so a mobile
// layout regression is a diff instead of a manual click-through.
//
//   npm run mobile:shots                          -- phone sweep, all routes
//   npm run mobile:shots -- --device=min          -- one device
//   npm run mobile:shots -- --route=match-15      -- one route
//   npm run mobile:shots -- --portrait            -- rotate-gate sweep
//
// Exit code is non-zero if any route failed or any page error fired, so this can
// gate a commit later.

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startDevServer } from "./dev-server.mjs";
import { PHONE_SWEEP, resolveDevice } from "./mobile-devices.mjs";
import {
  applyDeviceEmulation,
  findChrome,
  loadPuppeteer,
  parseArgs,
  watchForErrors,
} from "./mobile-emulation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "..", ".mobile-shots");

// Screens are addressed by their data-screen name and the .is-active class that
// screenManager.js toggles; buttons by the data-nav / data-action attributes the
// menu markup already uses. No ids are involved, so these selectors are stable.
const click = (selector) => ({ kind: "click", selector });
const screen = (name) => ({ kind: "screen", name });
const settle = (ms = 900) => ({ kind: "settle", ms });

const ROUTES = {
  title: [screen("title"), settle()],
  "main-menu": [click('[data-nav="mainMenu"]'), screen("mainMenu"), settle()],
  "sp-setup": [
    click('[data-nav="mainMenu"]'),
    screen("mainMenu"),
    click('[data-nav="spSetup"]'),
    screen("spSetup"),
    settle(),
  ],
  campaign: [
    click('[data-nav="mainMenu"]'),
    screen("mainMenu"),
    click('[data-nav="campaign"]'),
    screen("campaign"),
    settle(1200),
  ],
  shop: [
    click('[data-nav="mainMenu"]'),
    screen("mainMenu"),
    click('[data-action="shop"]'),
    settle(1200),
  ],
  // The two that matter most for the small-tile problem: the default board and
  // the largest board the game allows, both on a phone.
  "match-13": [
    click('[data-nav="mainMenu"]'),
    screen("mainMenu"),
    click('[data-nav="spSetup"]'),
    screen("spSetup"),
    click('[data-action="startSingle"]'),
    screen("match"),
    settle(2000),
  ],
  "match-15": [
    click('[data-nav="mainMenu"]'),
    screen("mainMenu"),
    click('[data-nav="spSetup"]'),
    screen("spSetup"),
    click('[data-size="15"]'),
    click('[data-action="startSingle"]'),
    screen("match"),
    settle(2000),
  ],
};

// Measures the rendered size of a board tile in CSS pixels. This is the number
// the mobile board work has to move: the platform guidance floor is a 44x44 CSS px
// touch target, and an isometric diamond only fills about half of its own bounding
// box, so a tile needs to measure well above 44 before it is comfortably tappable.
async function measureTouchTargets(page) {
  return page.evaluate(() => {
    const faces = [...document.querySelectorAll(".tile .tile-face")];
    if (!faces.length) return null;
    const rect = faces[0].getBoundingClientRect();
    return {
      tiles: faces.length,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    };
  });
}

async function runStep(page, step) {
  if (step.kind === "click") {
    await page.waitForSelector(step.selector, { timeout: 8000 });
    // Scope to the active screen. Every setup screen reuses the same
    // data-size / data-difficulty attributes, so a bare document.querySelector
    // silently clicks the hot-seat screen's control while the single-player
    // screen is the one on display — and the match starts at the wrong size.
    //
    // In-page click rather than page.click(): with touch emulation on, a
    // synthesized tap can land on an overlay and silently do nothing.
    const clicked = await page.evaluate((selector) => {
      const active = document.querySelector(".screen.is-active");
      const target = active?.querySelector(selector) || document.querySelector(selector);
      target?.click();
      return Boolean(target);
    }, step.selector);
    if (!clicked) throw new Error(`No element matched ${step.selector}`);
    return;
  }
  if (step.kind === "screen") {
    await page.waitForSelector(`[data-screen="${step.name}"].is-active`, { timeout: 12000 });
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, step.ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const portrait = Boolean(args.portrait);
  const deviceKeys = args.device ? [args.device] : PHONE_SWEEP;
  const routeKeys = args.route ? [args.route] : Object.keys(ROUTES);

  for (const key of routeKeys) {
    if (!ROUTES[key]) {
      throw new Error(`Unknown route "${key}". Known routes: ${Object.keys(ROUTES).join(", ")}`);
    }
  }

  // Clear only what this run will rewrite. Wiping the whole folder would mean a
  // narrow `--route=match-15` run silently throws away every other screenshot.
  await mkdir(OUT_DIR, { recursive: true });
  for (const deviceKey of deviceKeys) {
    for (const routeKey of routeKeys) {
      const suffix = portrait ? "-portrait" : "";
      await rm(path.join(OUT_DIR, `${deviceKey}${suffix}__${routeKey}.png`), { force: true });
    }
  }

  // A 404 the harness served itself is a genuinely missing local asset, which is
  // a different (and much more serious) problem than a call to the live backend
  // failing because the harness has no account. Track it separately.
  const missingLocalAssets = new Set();
  const server = await startDevServer({
    port: 0,
    onRequestError: (url) => missingLocalAssets.add(url),
  });
  const targetUrl = `${server.origin}/games/tactical-arena/index.html`;

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });

  const failures = [];

  for (const deviceKey of deviceKeys) {
    const device = resolveDevice(deviceKey, { portrait });

    for (const routeKey of routeKeys) {
      const label = `${device.key}${portrait ? "-portrait" : ""} / ${routeKey}`;
      const page = await browser.newPage();
      const errors = watchForErrors(page, {
        // No account and no live backend in the harness; these failures are expected.
        ignore: ["platform-api-production", "factory-network-server", "fonts.g"],
      });

      try {
        await applyDeviceEmulation(page, device);
        await page.setCacheEnabled(false);
        await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });

        for (const step of ROUTES[routeKey]) {
          await runStep(page, step);
        }

        const file = path.join(OUT_DIR, `${device.key}${portrait ? "-portrait" : ""}__${routeKey}.png`);
        await page.screenshot({ path: file });

        const targets = await measureTouchTargets(page);
        const board = targets ? Math.round(Math.sqrt(targets.tiles)) : 0;
        const note = targets
          ? `  ${board}x${board} board, tile ${targets.width}x${targets.height} CSS px` +
            `${targets.width < 44 || targets.height < 44 ? "  << under 44px" : ""}`
          : "";

        if (errors.length) {
          failures.push(`${label}\n${errors.map((e) => `      ${e}`).join("\n")}`);
          console.log(`  !  ${label}  (${errors.length} page error(s))${note}`);
        } else {
          console.log(`  ok ${label}${note}`);
        }
      } catch (error) {
        failures.push(`${label}\n      ${error.message.split("\n")[0]}`);
        console.log(`  X  ${label}  — ${error.message.split("\n")[0]}`);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
  await server.close();

  console.log(`\n  Screenshots: ${OUT_DIR}`);

  if (missingLocalAssets.size) {
    console.log(`\n  Missing local assets (${missingLocalAssets.size}):`);
    for (const url of [...missingLocalAssets].sort()) console.log(`    404  ${url}`);
  }

  if (failures.length) {
    console.log(`\n  ${failures.length} problem(s):\n${failures.map((f) => `    ${f}`).join("\n")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
