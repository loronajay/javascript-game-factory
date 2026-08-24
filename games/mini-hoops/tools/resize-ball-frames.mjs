// One-off asset tool: resample a ball's roll frames down to the cabinet's
// standard frame size.
//
// Source art arrives at whatever size it was authored at — the paper ball came
// in at 1254px, which is ~1.1MB per frame and more download than the whole rest
// of the cabinet. Every ball is drawn at BALL_SCREEN_RADIUS * 2 pixels or less,
// so anything past BALL_FRAME_SIZE is bandwidth nobody sees.
//
// This is not part of the build. It runs by hand when new frames land, and the
// resized frames are committed. It leans on the puppeteer already present at the
// repo root rather than adding an image dependency — repo rule is no new deps.
//
//   node tools/resize-ball-frames.mjs <ball-id> [--size 512]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(gameRoot, "..", "..");
const require = createRequire(path.join(repoRoot, "package.json"));

const DEFAULT_SIZE = 512;

const [, , ballId, ...rest] = process.argv;
if (!ballId) {
  console.error("usage: node tools/resize-ball-frames.mjs <ball-id> [--size 512]");
  process.exit(1);
}

const sizeFlag = rest.indexOf("--size");
const size = sizeFlag >= 0 ? Number(rest[sizeFlag + 1]) : DEFAULT_SIZE;
if (!Number.isFinite(size) || size < 16) {
  console.error(`--size must be a sensible pixel count, got ${rest[sizeFlag + 1]}`);
  process.exit(1);
}

const frameDir = path.join(gameRoot, "assets", "balls", ballId);
if (!fs.existsSync(frameDir)) {
  console.error(`no such ball: ${frameDir}`);
  process.exit(1);
}

const frames = fs
  .readdirSync(frameDir)
  .filter((name) => /^roll-\d+\.png$/.test(name))
  .sort();

if (frames.length === 0) {
  console.error(`no roll-NN.png frames in ${frameDir}`);
  process.exit(1);
}

const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;

// puppeteer-core ships no browser of its own. Prefer an explicit override, then
// fall back to the usual install locations — this is a hand-run tool, so a clear
// error beats any clever auto-download.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  console.error("Could not find Chrome. Set CHROME_PATH to its executable and re-run.");
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();

let before = 0;
let after = 0;

for (const frame of frames) {
  const file = path.join(frameDir, frame);
  const source = fs.readFileSync(file);
  before += source.length;

  const dataUri = `data:image/png;base64,${source.toString("base64")}`;
  const encoded = await page.evaluate(
    async (uri, target) => {
      const image = new Image();
      image.src = uri;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = target;
      canvas.height = target;
      const ctx = canvas.getContext("2d");
      // Smooth resampling on purpose: this art is painted, not pixel art.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, target, target);
      return canvas.toDataURL("image/png");
    },
    dataUri,
    size,
  );

  const output = Buffer.from(encoded.split(",")[1], "base64");
  fs.writeFileSync(file, output);
  after += output.length;
  console.log(`  ${frame}  ${(source.length / 1024) | 0}KB -> ${(output.length / 1024) | 0}KB`);
}

await browser.close();

console.log(
  `\n${ballId}: ${frames.length} frames, ${(before / 1024 / 1024).toFixed(1)}MB -> ${(after / 1024 / 1024).toFixed(1)}MB at ${size}px`,
);
