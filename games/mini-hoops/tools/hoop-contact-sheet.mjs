// One-off asset tool: render the hoop over a real room so its SHAPE can be
// checked with eyes instead of arithmetic.
//
//   node tools/hoop-contact-sheet.mjs [--out <dir>] [--room <id>]
//
// Sibling of `room-contact-sheet.mjs`, and it exists for the same reason: the
// bug it was written to catch is invisible to a unit test and glaring in a
// screenshot. That bug was the rim drawn as a FIXED 48x12 ellipse at every
// height, with its near and far halves split as though the camera looked DOWN
// on a rim that in fact sits above eye level.
//
// It draws three sheets:
//
//   hoop-ladder.png - the hoop at five heights spanning the vertical travel of
//     the motion modes, with the eye line on top. Read the RIM ELLIPSE up the
//     ladder: it must open as it climbs away from the eye line and flatten as it
//     drops toward it, and the net's hem must do the same one beat later. A rung
//     whose ring is the same shape as its neighbour's is the old bug back.
//
//   hoop-sweep.png - the hoop at five points across a horizontal sweep, with the
//     rim centre and the board centre ticked. Read the GAP between the two
//     ticks: the board is deeper, so it must trail the rim, by more the further
//     out the assembly travels, and never lead it.
//
//   hoop-through.png - one hoop at 2.6x with a ball at four points along a made
//     shot, drawn in the real composition order. This is the sheet for the
//     NEAR/FAR SPLIT, which no other view can settle: the ball must pass BEHIND
//     the cords nearest the camera and IN FRONT of the far ones, and the rim
//     rides above eye level here, so the near cords are the UPPER ones. If the
//     ball reads as skating across the front of the net, or as buried behind all
//     of it, the halves are inverted.

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
const room = flag("--room", "rec-hall");

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

for (const sheet of ["ladder", "sweep", "through"]) {
  await page.evaluate(
    async (origin, room, sheet) => {
      const constants = await import(`${origin}/scripts/sim/constants.js`);
      const projection = await import(`${origin}/scripts/sim/projection.js`);
      const scene = await import(`${origin}/scripts/render/scene.js`);
      const hoopRender = await import(`${origin}/scripts/render/hoop.js`);
      const hoopSim = await import(`${origin}/scripts/sim/hoop.js`);
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
      scene.drawRoom(ctx, backdrop, room);

      const drawHoop = (hoop) => {
        hoopRender.drawBackboard(ctx, hoop);
        hoopRender.drawNet(ctx, hoop, true, 0);
        hoopRender.drawRim(ctx, hoop, true, 0);
        hoopRender.drawNet(ctx, hoop, false, 0);
        hoopRender.drawRim(ctx, hoop, false, 0);
      };

      // A hoop snapshot placed by hand, so the sheet can sample positions no
      // mode happens to pass through. Everything derived stays derived.
      const hoopAtScreen = (cx, rimY) => {
        const base = hoopSim.hoopAt("still", 0);
        const ratio =
          projection.depthScaleAt(constants.BOARD_Z) / projection.depthScaleAt(constants.RIM_CENTER_Z);
        const boardCx = constants.HOOP_BASE_X + (cx - constants.HOOP_BASE_X) * ratio;
        const rise = (rimY - constants.HOOP_BASE_RIM_Y) * ratio;
        return {
          ...base,
          cx,
          rimY,
          boardCx,
          boardX: boardCx - constants.BACKBOARD_WIDTH / 2,
          boardY: constants.HOOP_BASE_RIM_Y - constants.BACKBOARD_RISE + rise,
        };
      };

      const plate = (text, x, y) => {
        ctx.fillStyle = "#0d2b33";
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = 3;
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      };

      if (sheet === "through") {
        // One hoop, magnified, with the room magnified under it so the crop is
        // still a room rather than a hoop floating on flat colour.
        const ZOOM = 2.6;
        const hoop = hoopAtScreen(constants.HOOP_BASE_X, constants.HOOP_BASE_RIM_Y);
        const focusX = hoop.cx;
        const focusY = hoop.rimY + 10;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(ZOOM, ZOOM);
        ctx.translate(-focusX, -focusY);
        ctx.drawImage(backdrop, 0, 0, canvas.width, canvas.height);

        // Four points along a shot that drops: out in front of the rim, at the
        // ring, through it, and clear below. Same order `render/frame.js` uses.
        const ballAt = (x, y, z, madeDrop) => {
          const radius = projection.ballScreenRadius(z);
          const paint = () => {
            ctx.fillStyle = "#d76a28";
            ctx.strokeStyle = "rgba(60,26,10,.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          };
          hoopRender.drawNet(ctx, hoop, true, 0);
          hoopRender.drawRim(ctx, hoop, true, 0);
          if (madeDrop) paint();
          hoopRender.drawNet(ctx, hoop, false, 0);
          hoopRender.drawRim(ctx, hoop, false, 0);
          if (!madeDrop) paint();
        };

        hoopRender.drawBackboard(ctx, hoop);
        ballAt(hoop.cx - 96, hoop.rimY - 54, 0.45, false);
        ballAt(hoop.cx, hoop.rimY - 6, constants.RIM_CENTER_Z, true);
        ballAt(hoop.cx + 4, hoop.rimY + 40, constants.RIM_CENTER_Z, true);
        ballAt(hoop.cx + 8, hoop.rimY + 96, constants.RIM_CENTER_Z, false);
        ctx.restore();
      } else if (sheet === "ladder") {
        const bounds = hoopSim.HOOP_TRAVEL_BOUNDS;
        const rungs = 5;
        for (let i = 0; i < rungs; i++) {
          const rimY = bounds.minY + ((bounds.maxY - bounds.minY) * i) / (rungs - 1);
          // Fanned out horizontally only so the five do not stack on top of one
          // another. The shape is a function of HEIGHT alone, and this is what
          // makes that legible rather than asserted.
          const cx = 210 + (540 * i) / (rungs - 1);
          drawHoop(hoopAtScreen(cx, rimY));
          const ring = projection.ringEllipseAt(cx, rimY, constants.RIM_RADIUS_WORLD);
          plate(`rimY ${rimY.toFixed(0)}  ry ${ring.radiusY.toFixed(1)}`, cx, rimY + 155);
        }
      } else {
        const samples = 5;
        for (let i = 0; i < samples; i++) {
          const cx = 300 + (360 * i) / (samples - 1);
          const hoop = hoopAtScreen(cx, constants.HOOP_BASE_RIM_Y + 20);
          drawHoop(hoop);
          // Rim centre and board centre, ticked. The gap between them IS the
          // parallax; on the old rigid-on-screen assembly it was zero everywhere.
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ff5ad1";
          ctx.beginPath();
          ctx.moveTo(hoop.cx, hoop.rimY - 6);
          ctx.lineTo(hoop.cx, hoop.rimY + 18);
          ctx.stroke();
          ctx.strokeStyle = "#5adcff";
          ctx.beginPath();
          ctx.moveTo(hoop.boardCx, hoop.boardY - 20);
          ctx.lineTo(hoop.boardCx, hoop.boardY + 4);
          ctx.stroke();
          plate(`lag ${(hoop.cx - hoop.boardCx).toFixed(1)}px`, hoop.cx, hoop.rimY + 155);
        }
      }

      if (sheet === "through") {
        plate("near cords in front of the ball, far cords behind it", canvas.width / 2, 700);
      }

      // Eye level, last and over everything: it is the line every ring's shape
      // is measured against, so it has to read against the hoop, not under it.
      ctx.setLineDash([9, 7]);
      ctx.strokeStyle = "rgba(90,220,255,.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, constants.HORIZON_SCREEN_Y + 0.5);
      ctx.lineTo(canvas.width, constants.HORIZON_SCREEN_Y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#5adcff";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.fillText("EYE LEVEL", 12, constants.HORIZON_SCREEN_Y - 8);
    },
    origin,
    room,
    sheet,
  );

  const element = await page.$("#sheet");
  const file = path.join(outDir, `hoop-${sheet}.png`);
  await element.screenshot({ path: file });
  console.log(`wrote ${file}`);
}

await browser.close();
server.close();
