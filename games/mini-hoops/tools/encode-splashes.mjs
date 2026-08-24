// One-off asset tool: re-encode the menu splash art as JPEG.
//
// The splashes arrive as PNGs — 2.6MB each, which is more download than every
// room, ball and preview in the cabinet put together, for a photographic image
// with no transparency in it. The rooms are already JPEG for exactly this
// reason; this brings the splashes in line with them.
//
// Like tools/resize-ball-frames.mjs this is NOT part of a build. It runs by
// hand when new splash art lands, the .jpg it writes is what gets committed,
// and it leans on the puppeteer already at the repo root rather than adding an
// image dependency.
//
//   node tools/encode-splashes.mjs [--quality 0.82] [--max 1800]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(gameRoot, "..", "..");
const require = createRequire(path.join(repoRoot, "package.json"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = Number(args[at + 1]);
  return Number.isFinite(value) ? value : fallback;
};

// 0.82 is where this art stops showing ringing around the neon edges. The long
// edge cap is roughly a 2x phone screen; past that nobody sees the pixels.
const quality = flag("quality", 0.82);
const maxEdge = flag("max", 1800);

const splashDir = path.join(gameRoot, "assets", "menu-splashes");
const sources = fs
  .readdirSync(splashDir)
  .filter((name) => name.endsWith(".png"))
  .sort();

if (sources.length === 0) {
  console.error(`no .png splashes in ${splashDir}`);
  process.exit(1);
}

const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;

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

for (const name of sources) {
  const file = path.join(splashDir, name);
  const source = fs.readFileSync(file);
  const dataUri = `data:image/png;base64,${source.toString("base64")}`;

  const encoded = await page.evaluate(
    async (uri, cap, q) => {
      const image = new Image();
      image.src = uri;
      await image.decode();
      const scale = Math.min(1, cap / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { uri: canvas.toDataURL("image/jpeg", q), width: canvas.width, height: canvas.height };
    },
    dataUri,
    maxEdge,
    quality,
  );

  const output = Buffer.from(encoded.uri.split(",")[1], "base64");
  const target = file.replace(/\.png$/, ".jpg");
  fs.writeFileSync(target, output);
  console.log(
    `  ${name} -> ${path.basename(target)}  ${encoded.width}x${encoded.height}  ` +
      `${(source.length / 1024) | 0}KB -> ${(output.length / 1024) | 0}KB`,
  );
}

await browser.close();
console.log("\nSource .png files are left in place; delete them once the .jpg is approved.");
