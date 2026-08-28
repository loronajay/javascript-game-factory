// One-off asset tool: render the Trick Shot Lab's tools over a real room, at
// every angle and depth they can be arranged into, so their SHAPE and their
// DEPTH can be checked with eyes instead of arithmetic.
//
//   node tools/trick-shot-contact-sheet.mjs [--out <dir>] [--room <id>]
//
// Sibling of `hoop-contact-sheet.mjs` and `bin-contact-sheet.mjs`, and it exists
// for the same reason both of those do: the bugs it was written to catch are
// invisible to a unit test and glaring in a picture. Those bugs were
//
//   * a pad drawn as a flat neon quad with a flat fill, which read as a shape
//     MORPHING rather than an object turning — a 0.48 pad measured 127px across
//     at yaw 0 and seventeen at yaw 90, while getting a third TALLER on the way;
//   * no floor cue of any kind, so a raised near tool and a low far one drew in
//     the same place and the room read flat.
//
// It draws three sheets:
//
//   pad-turn.png - one rebound pad at seven yaws across a row, then seven
//     springboards under it. Read each pad as a SOLID: at every angle some face
//     has to be lit differently from its neighbour, the block must never
//     collapse to a bright hairline, and the double-headed bounce axis must be
//     readable at exactly the angles where the impact face is not.
//
//   pad-tilt.png - the same row swept through face tilt instead, which is the
//     axis that decides whether a pad throws the ball up or down. The top face
//     must be visible below eye level and the underside above it — get that cull
//     backwards and a pad lights from the wrong side at half its range.
//
//   pad-depth.png - the depth sheet, and the one the "depth is ambiguous"
//     complaint is about. The same pad at four depths on the top row and four
//     HEIGHTS at one depth on the bottom. Read the FLOOR: every tool's shadow
//     and footprint ring stay at its own depth while the tool climbs away from
//     them, and only the gap between the two grows. If a raised near pad and a
//     grounded far pad still read alike here, the cue is not doing its job.

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
const room = flag("--room", "bedroom");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css",
};

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

for (const sheet of ["turn", "tilt", "depth"]) {
  await page.evaluate(async (origin, room, sheet) => {
    const constants = await import(`${origin}/scripts/sim/constants.js`);
    const scene = await import(`${origin}/scripts/render/scene.js`);
    const trick = await import(`${origin}/scripts/render/trick-shot.js`);
    const sim = await import(`${origin}/scripts/sim/trick-shot.js`);
    const targets = await import(`${origin}/scripts/sim/trick-shot-target.js`);
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

    const ball = { x: 0, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, omegaX: 0, rollPhase: 0, splat: null };
    const pad = (type, options) => sim.createSandboxPiece(type, { id: `${type}-${Math.random()}`, ...options });

    // The whole point is to see the tools in the composition they really ship
    // in, so the sheet goes through `renderTrickShotFrame` rather than poking at
    // the piece drawer directly. A sheet that drew them any other way could
    // agree with itself and still disagree with the game.
    const drawFrame = (pieces, { building = true } = {}) => trick.renderTrickShotFrame(ctx, {
      ball,
      target: targets.trickShotTargetAt(targets.defaultTrickShotTarget(), 0),
      backdrop,
      locationId: room,
      pieces,
      selectedId: null,
      capture: null,
      pull: null,
      trajectory: null,
      scored: false,
      pieceAssets: {},
      splats: null,
      impacts: null,
      building,
      ballFrames: [],
      ballId: "basketball",
    });

    const plate = (text, x, y) => {
      ctx.save();
      ctx.fillStyle = "#0d2b33";
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 3;
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const degrees = (radians) => Math.round((radians * 180) / Math.PI);
    const labels = [];
    const remember = (piece, text, dy = 0) => {
      const hull = trick.boardProjectedGeometry(piece).hull;
      labels.push([text, piece.x, Math.min(...hull.map((point) => point.y)) - 10 + dy]);
    };

    const LANES = [-0.62, -0.42, -0.21, 0, 0.21, 0.42, 0.62];
    const pieces = [];

    if (sheet === "turn") {
      const angles = [0, 30, 60, 90, 120, 150, 180];
      LANES.forEach((x, index) => {
        const yaw = (angles[index] * Math.PI) / 180;
        pieces.push(pad(sim.BOARD_PIECE, { x, y: 1.0, z: 0.5, yaw, angle: 0, length: 0.4 }));
        pieces.push(pad(sim.SPRING_PIECE, { x, y: 0.42, z: 0.5, yaw, angle: 0, length: 0.4 }));
      });
    } else if (sheet === "tilt") {
      const angles = [-70, -45, -20, 0, 20, 45, 70];
      LANES.forEach((x, index) => {
        const tilt = (angles[index] * Math.PI) / 180;
        pieces.push(pad(sim.BOARD_PIECE, { x, y: 1.0, z: 0.5, yaw: 0.5, angle: tilt, length: 0.4 }));
        pieces.push(pad(sim.SPRING_PIECE, { x, y: 0.42, z: 0.5, yaw: -0.5, angle: tilt, length: 0.4 }));
      });
    } else {
      // Top row: one depth each, all at the same height. Bottom row: one depth,
      // four heights. The two rows together are the ambiguity — a pad high and
      // near against a pad low and far — and the floor is what separates them.
      [0.15, 0.4, 0.65, 0.9].forEach((z, index) => {
        pieces.push(pad(sim.BOARD_PIECE, { x: -0.55 + index * 0.37, y: 1.0, z, yaw: 0.4, angle: 0.2, length: 0.4 }));
      });
      [0.2, 0.55, 0.9, 1.25].forEach((y, index) => {
        pieces.push(pad(sim.SPRING_PIECE, { x: -0.55 + index * 0.37, y, z: 0.45, yaw: -0.4, angle: 0, length: 0.34 }));
      });
    }

    drawFrame(pieces);

    const projection = await import(`${origin}/scripts/sim/projection.js`);
    if (sheet === "turn" || sheet === "tilt") {
      const angles = sheet === "turn" ? [0, 30, 60, 90, 120, 150, 180] : [-70, -45, -20, 0, 20, 45, 70];
      LANES.forEach((x, index) => {
        const top = projection.projectPoint({ x, y: 1.0, z: 0.5 });
        plate(`${angles[index]}\u00b0`, top.x, top.y - 62);
      });
      plate(sheet === "turn" ? "YAW  (pad above, spring below)" : "FACE TILT  (pad above, spring below)", 480, 34);
    } else {
      [0.15, 0.4, 0.65, 0.9].forEach((z, index) => {
        const top = projection.projectPoint({ x: -0.55 + index * 0.37, y: 1.0, z });
        plate(`z ${z}`, top.x, top.y - 58);
      });
      [0.2, 0.55, 0.9, 1.25].forEach((y, index) => {
        const spot = projection.projectPoint({ x: -0.55 + index * 0.37, y, z: 0.45 });
        plate(`y ${y}`, spot.x, spot.y - 46);
      });
      plate("DEPTH (top row) vs HEIGHT (bottom row) \u2014 read the floor", 480, 34);
    }
    void labels;
    void remember;
    void degrees;
  }, origin, room, sheet);

  const buffer = await page.$eval("#sheet", (node) => node.toDataURL("image/png"));
  fs.writeFileSync(path.join(outDir, `pad-${sheet}.png`), Buffer.from(buffer.split(",")[1], "base64"));
  console.log(`wrote ${path.join(outDir, `pad-${sheet}.png`)}`);
}

await browser.close();
server.close();
