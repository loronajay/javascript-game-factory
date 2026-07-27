// Interactive mobile preview: opens Tactical Arena in a real Chrome window that
// is emulating a phone — correct viewport, (pointer: coarse), and mouse input
// delivered as touch events — so mobile playability can be tested on the desktop
// without pushing anything to a device.
//
//   npm run mobile                     -- Pixel 5 landscape
//   npm run mobile -- --device=min     -- the 640x360 worst case
//   npm run mobile -- --portrait       -- exercise the rotate gate
//   npm run mobile -- --list           -- show device profiles
//
// The dev server sends no-store, so every reload (F5 / Ctrl+R) picks up your
// latest edit. There is no build step, so that is the whole iteration loop.

import { startDevServer } from "./dev-server.mjs";
import { DEFAULT_DEVICE, describeDevices, resolveDevice } from "./mobile-devices.mjs";
import {
  applyDeviceEmulation,
  findChrome,
  loadPuppeteer,
  parseArgs,
} from "./mobile-emulation.mjs";

const BADGE_SCRIPT = (label) => `
  (() => {
    const paint = () => {
      if (!document.body) return;
      let el = document.getElementById("__mobile_preview_badge__");
      if (!el) {
        el = document.createElement("div");
        el.id = "__mobile_preview_badge__";
        el.style.cssText = [
          "position:fixed", "left:4px", "bottom:4px", "z-index:2147483647",
          "font:10px/1.35 ui-monospace,monospace", "color:#9fe8b0",
          "background:rgba(0,0,0,.66)", "padding:3px 6px", "border-radius:4px",
          "pointer-events:none", "white-space:pre", "letter-spacing:.02em",
        ].join(";");
        document.body.appendChild(el);
      }
      const coarse = matchMedia("(pointer: coarse)").matches;
      const w = innerWidth, h = innerHeight;
      // Mirrors shouldUseBoardTouchAssist() in src/ui/boardTouchAssist.js.
      const assist = coarse && w > h && h <= 540;
      el.textContent = ${JSON.stringify(label)} + "  " + w + "x" + h +
        "  coarse:" + (coarse ? "on" : "OFF") +
        "  touch-assist:" + (assist ? "on" : "off");
    };
    addEventListener("DOMContentLoaded", paint);
    addEventListener("resize", paint);
    setInterval(paint, 1000);
  })();
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log(`Device profiles:\n${describeDevices()}\n\nDefault: ${DEFAULT_DEVICE}`);
    return;
  }

  const device = resolveDevice(args.device, { portrait: Boolean(args.portrait) });
  // Layout is what you are testing interactively and CSS px do not change with
  // DPR, so default to 1x for a crisp 1:1 window. Pass --dsf=2.75 to eyeball
  // asset sharpness at the real device pixel ratio.
  const deviceScaleFactor = args.dsf ? Number(args.dsf) : 1;
  const relativeUrl = typeof args.url === "string" ? args.url : "index.html";

  const server = await startDevServer({ port: args.port ? Number(args.port) : 4173 });
  const targetUrl = `${server.origin}/games/tactical-arena/${relativeUrl}`;

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: false,
    defaultViewport: null,
    args: [
      // Window is sized to the emulated viewport plus room for the omnibox, so
      // the phone frame sits 1:1 in the window instead of floating in grey.
      `--window-size=${device.width},${device.height + 88}`,
      "--window-position=60,60",
      "--force-device-scale-factor=1",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const [page] = await browser.pages();
  await applyDeviceEmulation(page, device, { deviceScaleFactor });
  await page.setCacheEnabled(false);

  if (!args["no-badge"]) {
    await page.evaluateOnNewDocument(BADGE_SCRIPT(`${device.key}${device.portrait ? " (portrait)" : ""}`));
  }

  // Live error feed. This is most of the value during a mobile pass — a missing
  // named import or a 404 asset shows up here instantly instead of as a blank screen.
  page.on("pageerror", (error) => console.error(`  [pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`  [console] ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.includes("favicon")) return;
    console.error(`  [failed] ${url.replace(server.origin, "")}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() < 400 || url.includes("favicon")) return;
    console.error(`  [http ${response.status()}] ${url.replace(server.origin, "")}`);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  console.log(`
  Tactical Arena — mobile preview
  ------------------------------------------------------------
  device      ${device.label}${device.portrait ? " (rotated to portrait)" : ""}
  viewport    ${device.width} x ${device.height} CSS px @ ${deviceScaleFactor}x
  serving     ${server.root}
  url         ${targetUrl}

  Mouse input is delivered as touch. Reload to pick up edits.
  Close the browser window to stop.
`);

  browser.on("disconnected", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
