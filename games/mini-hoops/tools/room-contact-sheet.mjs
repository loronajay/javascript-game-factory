// One-off asset tool: render every room with the camera drawn on top of it, so
// the alignment in `assets/room-geometry.js` can be checked against the paint
// with eyes instead of arithmetic.
//
//   node tools/room-contact-sheet.mjs [--out <dir>] [--room <id>] [--grid]
//
// It draws, for each room:
//   - the aligned backdrop, exactly as `render/scene.js` draws it;
//   - the ball at a ladder of depths, with its shadow, through the real
//     projection — so a ball at z=1 landing anywhere but against the painted
//     skirting is immediately obvious;
//   - the wall base and horizon as lines, and the occluder polygons as outlines.
//
// `--grid` swaps all of that for a labelled 60px coordinate grid over the bare
// art, which is how the occluder polygons get traced in the first place: read
// the vertices straight off the picture in the same source-image coordinates the
// catalog stores them in.
//
// This is not part of the build and it ships nothing. It exists because the one
// bug this whole subsystem was written to fix — the camera disagreeing with the
// picture behind it — is invisible to a unit test and glaring in a screenshot.
// Same hand-run, no-new-deps shape as the other tools in here: it leans on the
// puppeteer already at the repo root.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(gameRoot, "..", "..");
const require = createRequire(path.join(repoRoot, "package.json"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const outDir = path.resolve(flag("--out", path.join(gameRoot, "tools", "contact-sheet")));
const onlyRoom = flag("--room", null);
const gridMode = args.includes("--grid");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".css": "text/css" };

// ES modules will not load over file://, so the room is served rather than opened.
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(request.url.split("?")[0]).replace(/^\/+/, "");
  const file = path.join(gameRoot, relative);
  if (!file.startsWith(gameRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

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

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 980, height: 800 });
await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });

const rooms = await page.evaluate(async (origin) => {
  const { LOCATIONS } = await import(`${origin}/scripts/assets/location-catalog.js`);
  return LOCATIONS.map((location) => location.id);
}, origin);

for (const room of rooms) {
  if (onlyRoom && room !== onlyRoom) continue;
  await page.evaluate(async (origin, room, gridMode) => {
    const constants = await import(`${origin}/scripts/sim/constants.js`);
    const projection = await import(`${origin}/scripts/sim/projection.js`);
    const scene = await import(`${origin}/scripts/render/scene.js`);
    const geometry = await import(`${origin}/scripts/assets/room-geometry.js`);
    const { locationBackdropPath } = await import(`${origin}/scripts/assets/location-catalog.js`);

    document.body.innerHTML = "";
    document.body.style.margin = "0";
    const canvas = document.createElement("canvas");
    canvas.id = "sheet";
    canvas.width = constants.CANVAS_WIDTH;
    canvas.height = constants.CANVAS_HEIGHT;
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    scene.prepareContext(ctx);

    const backdrop = new Image();
    backdrop.src = `${origin}/${locationBackdropPath(room)}`;
    await backdrop.decode();

    scene.clearScene(ctx);

    if (gridMode) {
      // Bare art, in source coordinates, so vertices read off it can be typed
      // straight into `assets/room-geometry.js` without any mental arithmetic.
      ctx.drawImage(backdrop, 0, 0, canvas.width, canvas.height);
      ctx.font = "bold 12px monospace";
      for (let x = 0; x <= canvas.width; x += 60) {
        ctx.strokeStyle = x % 240 === 0 ? "rgba(255,90,209,.95)" : "rgba(255,255,255,.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
        ctx.fillStyle = "#ff5ad1";
        ctx.textAlign = "left";
        ctx.fillText(String(x), x + 3, 14);
      }
      for (let y = 0; y <= canvas.height; y += 60) {
        ctx.strokeStyle = y % 240 === 0 ? "rgba(255,90,209,.95)" : "rgba(255,255,255,.4)";
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
        ctx.fillStyle = "#ff5ad1";
        ctx.fillText(String(y), 3, y + 14);
      }
      return;
    }

    scene.drawRoom(ctx, backdrop, room);

    // The ball, down the middle of the room, at a ladder of depths.
    const depths = [0, 0.25, 0.5, 0.75, 1];
    for (const z of depths) {
      const ball = { x: 0, y: 0.1, z, splat: null };
      scene.drawWallShadow(ctx, ball);
      scene.drawBallShadow(ctx, ball);
      const point = projection.projectPoint(ball);
      const radius = projection.ballScreenRadius(z);
      ctx.save();
      ctx.filter = scene.depthGradeFilter(z);
      ctx.fillStyle = "#d76a28";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`z=${z}`, point.x, point.y - radius - 6);
    }
    scene.drawRoomOccluders(ctx, backdrop, room, 1);

    // The camera, drawn over the paint it is supposed to agree with.
    const line = (y, colour, label) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([9, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colour;
      ctx.textAlign = "left";
      ctx.fillText(label, 8, y - 6);
    };
    line(constants.HORIZON_SCREEN_Y, "#5ad1ff", `horizon ${constants.HORIZON_SCREEN_Y}`);
    line(constants.WALL_BASE_SCREEN_Y, "#7bff8a", `wall base ${constants.WALL_BASE_SCREEN_Y}`);
    line(constants.FLOOR_SCREEN_Y, "#ffd166", `floor at z=0 ${constants.FLOOR_SCREEN_Y}`);

    ctx.save();
    ctx.translate(0, geometry.roomBackdropOffsetY(room));
    ctx.strokeStyle = "#ff5ad1";
    ctx.lineWidth = 2;
    for (const occluder of geometry.roomOccluders(room)) {
      ctx.beginPath();
      const [first, ...rest] = occluder.polygon;
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of rest) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(`${room} — shift ${geometry.roomBackdropOffsetY(room)}px`, 8, 24);
  }, origin, room, gridMode);

  const file = path.join(outDir, `${room}.png`);
  const element = await page.$("#sheet");
  await element.screenshot({ path: file });
  console.log(`wrote ${path.relative(gameRoot, file)}`);
}

await browser.close();
server.close();
