// Headless drive of the room editor's resize handles + alignment guides. Temporary; not committed.
import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = process.argv[2];
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".woff2": "font/woff2", ".ttf": "font/ttf" };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const data = await readFile(path.join(root, p));
    res.writeHead(200, { "content-type": mime[path.extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860 });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await wait(300); await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name); };
const status = async () => page.$eval("#roomEditorStatus, [data-editor-status], .editor__status", (el) => el.textContent).catch(() => "");
const inspector = async () => page.$eval("#decorInspector", (el) => ({
  where: el.querySelector("small")?.textContent,
  length: el.querySelector("input[data-length]")?.value,
  scale: el.querySelector("input[data-scale]")?.value,
})).catch(() => null);

/** Pixel clusters of a colour in the current frame, via a screenshot decoded by the page itself. */
async function clusters(match, minSize = 6) {
  const data = await page.screenshot({ encoding: "base64" });
  return page.evaluate(async (base64, matchSource, minSize) => {
    const test = new Function("r", "g", "b", `return ${matchSource};`);
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data: px, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    const hit = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      if (test(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) hit[i] = 1;
    }
    const seen = new Uint8Array(width * height);
    const found = [];
    for (let start = 0; start < width * height; start += 1) {
      if (!hit[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let n = 0, sx = 0, sy = 0, minX = width, maxX = 0, minY = height, maxY = 0;
      while (stack.length) {
        const i = stack.pop();
        const x = i % width, y = (i / width) | 0;
        n += 1; sx += x; sy += y;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (hit[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (n >= minSize) found.push({ n, x: Math.round(sx / n), y: Math.round(sy / n), minX, maxX, minY, maxY });
    }
    return found.sort((a, b) => b.n - a.n);
  }, data, match, minSize);
}
const YELLOW = "r > 215 && g > 180 && g < 235 && b < 120";
const CYAN = "r < 150 && g > 200 && b > 220";

await page.goto(`http://localhost:${port}/room/`, { waitUntil: "networkidle0" });
await page.click("#enterShowroom");
await wait(800);
await page.click("#editArcade");
await wait(800);
await page.click('[data-tab="decor"]');
await wait(300);

// 1. Add a neon strip, look at it straight on, and find its two end arrows.
await page.click('[data-add-decor="decor.neon.strip"]');
await wait(500);
await page.keyboard.press("KeyF");
await wait(1200);
console.log("inspector after add:", await inspector());
await shot("01-handles");
let handles = (await clusters(YELLOW)).filter((c) => c.n > 30);
console.log("yellow clusters:", handles.slice(0, 6));
const byX = handles.slice(0, 2).sort((a, b) => a.x - b.x);
if (byX.length < 2) { console.log("FAIL: could not find two arrow handles"); }
const [leftArrow, rightArrow] = byX;

// 2. Drag the right arrow 320 px to the right: the strip should grow from its left end.
await page.mouse.move(rightArrow.x, rightArrow.y);
await wait(100);
await page.mouse.down();
await page.mouse.move(rightArrow.x + 160, rightArrow.y, { steps: 8 });
await page.mouse.move(rightArrow.x + 320, rightArrow.y, { steps: 8 });
await shot("02-stretch-mid-drag");
await page.mouse.up();
await wait(400);
console.log("inspector after stretch:", await inspector());
await shot("03-stretched");
handles = (await clusters(YELLOW)).filter((c) => c.n > 30).slice(0, 2).sort((a, b) => a.x - b.x);
console.log("arrows now:", handles, "left arrow moved by", handles[0] ? handles[0].x - leftArrow.x : "?");

// 3. Drag the right arrow off the screen edge: it must stop at the wall's corner.
const right = handles[1] ?? rightArrow;
await page.mouse.move(right.x, right.y);
await page.mouse.down();
await page.mouse.move(1395, right.y, { steps: 12 });
await page.mouse.up();
await wait(400);
console.log("inspector after over-stretch:", await inspector());
await shot("04-clamped-to-wall");

// 4. Undo both, add a second strip and drag it up beside the first: guides should appear and it should level.
await page.keyboard.down("Control"); await page.keyboard.press("KeyZ"); await page.keyboard.press("KeyZ"); await page.keyboard.up("Control");
await wait(300);
await page.click('[data-add-decor="decor.neon.strip"]');
await wait(500);
console.log("second strip:", await inspector());
await shot("05-second-strip");
// The second strip is placed at the first strip's default spot, offset by the search; find its body (pink) to grab it.
const pink = (await clusters("r > 200 && g < 120 && b > 100", 40));
console.log("pink clusters:", pink.slice(0, 4));

// 5. Type an exact length into the number field.
await page.focus("#decorInspector input[data-length]");
await page.$eval("#decorInspector input[data-length]", (el) => el.select());
await page.keyboard.type("4.5");
await page.keyboard.press("Tab");
await wait(400);
console.log("after typing 4.5:", await inspector());
await shot("06-typed-length");

// 6. A scalable item: a poster, corner grips, drag one corner outward.
await page.click('[data-decor-category="poster"]').catch(() => {});
await wait(200);
await page.click('[data-add-decor="decor.poster.bird-duty"]');
await wait(600);
console.log("poster:", await inspector());
await shot("07-poster-grips");
const grips = (await clusters(YELLOW)).filter((c) => c.n > 20).slice(0, 4);
console.log("grips:", grips);
const topRight = grips.slice().sort((a, b) => (b.x - b.y) - (a.x - a.y))[0];
if (topRight) {
  await page.mouse.move(topRight.x, topRight.y);
  await page.mouse.down();
  await page.mouse.move(topRight.x + 120, topRight.y - 90, { steps: 10 });
  await shot("08-scale-mid-drag");
  await page.mouse.up();
  await wait(400);
  console.log("poster after corner drag:", await inspector());
  await shot("09-scaled");
}

// 7. Models: claw machine and popcorn cart up close.
await page.click('[data-decor-category="prop"]').catch(() => {});
await wait(200);
await page.click('[data-add-decor="decor.prop.claw"]');
await wait(500);
await page.keyboard.press("KeyC");
await wait(1200);
await shot("10-claw");
await page.click('[data-add-decor="decor.prop.popcorn"]');
await wait(500);
await page.keyboard.press("KeyC");
await wait(1200);
await shot("11-popcorn");
console.log("cyan-guide clusters at end (expect none):", (await clusters(CYAN, 20)).length);

await browser.close();
server.close();
