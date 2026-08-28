// Drive the real cabinet at real phone and laptop viewports and MEASURE the layout.
//
// Screen layout is the one part of this game the unit tests cannot reach, and
// the `## Mobile` section of CLAUDE.md is a record of measurements rather than
// of reasoning. This is the instrument those measurements come from, so a change
// to the phone rules can be re-checked the same way it was made in the first
// place instead of being eyeballed in a desktop browser at a narrow window --
// which is not the same thing, because `dvh`, the portrait canvas crop and the
// landscape rail all key off the viewport's real shape.
//
// Reports, per viewport and per screen:
//   overflow   -- a screen that must FIT and does not. The setup and boards
//                 screens are lists and scroll by design; a court and the
//                 How-to-Play demo are instruments and never may.
//   ball       -- where the ball's resting screen position lands across the width,
//                 which is the whole of whether a shot is a right-thumb reach
//   offscreen  -- interactive controls outside the viewport or under the fold
//   small      -- tap targets under the 44px Material/HIG minimum
//
//   node tools/mobile-audit.mjs [--viewport <name>] [--shots <dir>] [--theme <id>]
//
// Hand-run, no new dependencies, Chrome via CHROME_PATH -- the same shape as the
// contact sheets. Screenshots are written only when --shots is passed.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(here, "..");
// The cabinet imports shared platform modules from the repo root, so the root is
// what has to be served -- the same constraint the live site has.
const repoRoot = path.resolve(gameDir, "../..");
const gameUrlPath = `/${path.relative(repoRoot, gameDir).split(path.sep).join("/")}/index.html`;

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1];
};
const shotDir = flag("--shots");
const only = flag("--viewport");
// A theme changes no measurement -- it is fourteen colours and not one box --
// but every screen here is also the only place a palette can be REVIEWED, and
// eight cabinets are eight times as many screens to look at. This seeds the
// preference before the cabinet boots, so `--theme carbon --shots <dir>` is a
// contact sheet of the whole game in one theme.
const theme = flag("--theme");

// Real handsets, not round numbers: the two portrait widths either side of the
// common case and the two landscape shapes a phone actually produces.
//
// AND TWO LAPTOPS, because a court can fail to fit on one of those as well and
// for the same reason -- the shortage is vertical on a laptop too, since a
// browser's chrome takes 200-odd pixels off a 900-tall screen and the court's
// reservation is measured against what is left. Tic-tac-toe overflowed by 78px
// on every desktop under about 1080 tall for months while this tool, which asks
// exactly that question, was only ever pointed at phones.
const VIEWPORTS = [
  { name: "portrait-360", width: 360, height: 800, mobile: true },
  { name: "portrait-393", width: 393, height: 852, mobile: true },
  { name: "portrait-430", width: 430, height: 932, mobile: true },
  { name: "landscape-740", width: 740, height: 360, mobile: true },
  { name: "landscape-852", width: 852, height: 393, mobile: true },
  { name: "landscape-915", width: 915, height: 412, mobile: true },
  { name: "laptop-1280", width: 1280, height: 640, mobile: false },
  { name: "laptop-1598", width: 1598, height: 731, mobile: false },
];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(repoRoot, rel);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
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
  server.close();
  process.exit(1);
}

/** The page-side probe. Runs in the browser; returns plain data only. */
const MEASURE = () => {
  // Measure from the top. A button press can scroll the page, and every rect
  // below is viewport-relative -- an overflow measured mid-scroll hides exactly
  // the element that caused it, which is how a shot panel pushed onto a second
  // grid row read as "clean" the first time.
  window.scrollTo(0, 0);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = (node) => {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  };
  const visible = (node) => {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  const screen = document.querySelector(".screen.is-active");
  const scope = screen ?? document.body;
  const canvas = scope.querySelector("canvas.court-canvas");
  const court = scope.querySelector(".court");

  // The ball rests on the projection origin, canvas x=480 of 960. Where that
  // lands across the viewport is the whole question about which thumb shoots.
  let ball = null;
  if (canvas) {
    const box = canvas.getBoundingClientRect();
    const x = box.x + (box.width * 480) / 960;
    const y = box.y + (box.height * 700) / 760;
    ball = {
      x: Math.round(x),
      y: Math.round(y),
      fromLeft: +(x / vw).toFixed(3),
      offCentre: Math.round(x - vw / 2),
      onScreen: x >= 0 && x <= vw && y >= 0 && y <= vh,
      canvasBox: rect(canvas),
    };
  }

  // A control below the fold of a panel that SCROLLS ON PURPOSE is reachable,
  // and reporting it as stranded buries the real strandings in noise. The Lab's
  // tool rail and How to Play's notes box are both deliberate scroll containers
  // — the design rule in both cases is "the instrument fits and the LIST is what
  // scrolls" — so the question is whether some ancestor can actually bring the
  // control into view, not whether it happens to be inside the viewport now.
  const inScrollContainer = (node) => {
    for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight - parent.clientHeight > 2) return true;
    }
    return false;
  };

  const controls = [...scope.querySelectorAll("button, input, select, [role=button]")].filter(visible);
  const offscreen = [];
  const small = [];
  for (const node of controls) {
    const box = node.getBoundingClientRect();
    const label = (node.id || node.className || node.tagName).toString().split(" ")[0];
    const text = (node.textContent || "").trim().slice(0, 22);
    if ((box.bottom > vh + 1 || box.top < -1 || box.right > vw + 1 || box.left < -1) && !inScrollContainer(node)) {
      offscreen.push({ label, text, box: rect(node) });
    }
    if (box.width < 44 || box.height < 44) {
      small.push({ label, text, w: Math.round(box.width), h: Math.round(box.height) });
    }
  }

  // When the page scrolls at all, name what is sticking out. Layout bugs here are
  // almost always one container, and hunting it by hand is the slow part.
  const culprits = [];
  if (window.__auditMustFit && document.documentElement.scrollHeight - vh > 2) {
    for (const node of scope.querySelectorAll("*")) {
      const box = node.getBoundingClientRect();
      if (box.height > 0 && box.bottom > vh + 1) {
        culprits.push(`${node.tagName.toLowerCase()}.${(node.className || "").toString().split(" ")[0]} top=${Math.round(box.top)} h=${Math.round(box.height)}`);
      }
    }
  }

  return {
    vw, vh,
    culprits: culprits.slice(0, 6),
    screen: screen?.id ?? "(none)",
    overflowX: Math.max(0, document.documentElement.scrollWidth - vw),
    overflowY: Math.max(0, document.documentElement.scrollHeight - vh),
    court: rect(court),
    panel: rect(scope.querySelector(".shot-panel")),
    ball,
    offscreen,
    small,
  };
};

/** Pick the setup screen's game-type chip whose label matches. */
const pickGameType = (pattern) => {
  const chips = [...document.querySelectorAll("#setupGameTypes button")];
  const chip = chips.find((node) => new RegExp(pattern, "i").test(node.textContent));
  if (!chip) throw new Error(`no game type chip matching ${pattern}`);
  chip.click();
};

/** Steps that put the cabinet on a screen worth measuring. */
const ROUTES = [
  {
    // The boot screen, and now also the front door to the customization layer.
    // It MUST fit: the whole point of the diegetic marquee is that the options
    // are an object in the room rather than a list you scroll, and a sixth entry
    // is exactly the kind of change that pushes the index card under the fold on
    // a sideways phone.
    name: "menu",
    mustFit: true,
    async go() {},
  },
  {
    // A list, so it scrolls by design -- but its two columns and its sticky
    // sampler are measured the same way the setup screen is.
    name: "customize",
    mustFit: false,
    async go(page) {
      await page.click('[data-command="customize"]');
      await page.waitForSelector("#customizeScreen.is-active");
    },
  },
  {
    name: "setup",
    mustFit: false,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
    },
  },
  {
    name: "solo run",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
      await page.click("#setupStartButton");
      await page.waitForSelector("#gameScreen.is-active");
    },
  },
  {
    // The mirror of the run above. The ball must land as far to the LEFT of
    // centre as the default lands to the right -- that symmetry is the whole
    // claim the setting makes, and it is one line of CSS away from silently
    // doing nothing.
    name: "solo run (left)",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
      await page.click('[data-intent="toggle-hand"]');
      await page.click("#setupStartButton");
      await page.waitForSelector("#gameScreen.is-active");
    },
  },
  {
    name: "solo results",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
      await page.click("#setupStartButton");
      await page.waitForSelector("#gameScreen.is-active");
      // Show the results card without playing a run out: it is the tallest thing
      // in the cabinet and the one overlay a player cannot dismiss if it overflows.
      await page.evaluate(() => {
        const results = document.querySelector("#resultRank")?.closest(".overlay");
        for (const node of document.querySelectorAll("#gameScreen .overlay")) node.hidden = true;
        if (results) results.hidden = false;
      });
    },
  },
  {
    name: "horse place",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
      await page.evaluate(pickGameType, "horse");
      await page.click("#setupStartButton");
      await page.waitForSelector("#horseScreen.is-active");
    },
  },
  {
    name: "tic-tac-toe",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="solo"]');
      await page.waitForSelector("#setupScreen.is-active");
      await page.evaluate(pickGameType, "tic");
      await page.click("#setupStartButton");
      await page.waitForSelector("#ticTacToeScreen.is-active");
    },
  },
  {
    // The Trick Shot Lab. A court beside a scrolling tool rail: the RAIL is the
    // part that scrolls, so the screen itself must fit -- the court and its power
    // meter are one instrument here exactly as they are in a run.
    name: "trick shot lab",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="trickshot"]');
      await page.waitForSelector("#trickShotScreen.is-active");
      await page.click("#trickAddBoard");
      await page.click("#trickAddSpring");
      await page.click("#trickAddCannon");
    },
  },
  {
    // The same screen with a floor bin as the target. Worth its own row: the
    // target panel gains a motion select and the court gains a placed bin with
    // its own depth handle, and both are new things that can fall under a fold.
    name: "trick shot lab (bin)",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="trickshot"]');
      await page.waitForSelector("#trickShotScreen.is-active");
      await page.click('#trickTargetKinds [data-target-kind="bin"]');
      await page.click("#trickAddSpring");
    },
  },
  {
    // A splash screen with a list on it. It scrolls by design, but it is also
    // where the scrim over the painted art is judged, and it had never been in
    // this sheet at all.
    name: "boards",
    mustFit: false,
    async go(page) {
      await page.click('[data-command="boards"]');
      await page.waitForSelector("#boardsScreen.is-active");
    },
  },
  {
    name: "how to play",
    mustFit: true,
    async go(page) {
      await page.click('[data-command="howto"]');
      await page.waitForSelector("#howToScreen.is-active");
    },
  },
];

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--mute-audio"] });
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

let problems = 0;
for (const viewport of VIEWPORTS) {
  if (only && viewport.name !== only) continue;
  console.log(`\n=== ${viewport.name}  ${viewport.width}x${viewport.height} ===`);
  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
    });
    // Every route starts from a clean cabinet. Preferences persist in
    // localStorage and the whole run shares one browser profile, so without this
    // the left-handed route below leaks its setting into the next viewport's
    // default and both read as working while neither is being measured.
    await page.evaluateOnNewDocument((themeId) => {
      try {
        localStorage.clear();
        // Written as the store writes it, so it goes through the same catalog
        // validation a real preference does -- a typo here must degrade to the
        // default rather than quietly shooting the sheet in a ninth theme.
        if (themeId) localStorage.setItem("miniHoops.preferences.v1", JSON.stringify({ themeId }));
      } catch {
        /* private mode: nothing to clear */
      }
    }, theme);
    await page.goto(`${origin}${gameUrlPath}`, { waitUntil: "networkidle0" });
    try {
      await route.go(page);
    } catch (error) {
      console.log(`  ${route.name.padEnd(14)} COULD NOT REACH: ${String(error.message).split("\n")[0]}`);
      await page.close();
      problems += 1;
      continue;
    }
    // A beat for the layout to settle after the screen swap.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.evaluate((mustFit) => { window.__auditMustFit = mustFit; }, Boolean(route.mustFit));
    const found = await page.evaluate(MEASURE);
    if (shotDir) {
      await page.screenshot({ path: path.join(shotDir, `${viewport.name}-${route.name.replace(/\s+/g, "-")}.png`) });
    }

    const notes = [];
    // A list screen scrolling is not a bug; a court screen scrolling is.
    const scrolls = route.mustFit && found.overflowY > 2;
    if (found.overflowY > 2) notes.push(`scrolls ${found.overflowY}px${route.mustFit ? "" : " (by design)"}`);
    if (found.overflowX > 2) notes.push(`SIDEWAYS ${found.overflowX}px`);
    if (found.ball) {
      const sign = found.ball.offCentre >= 0 ? "+" : "";
      notes.push(`ball ${sign}${found.ball.offCentre}px off centre (${Math.round(found.ball.fromLeft * 100)}% across)`);
      if (!found.ball.onScreen) {
        // Say WHERE, because the answer is almost always a canvas that outgrew
        // its own court: a cap that cannot resolve leaves the canvas sized off
        // the court's width, and `overflow: hidden` then clips the bottom of the
        // room off — which is exactly where the ball rests.
        const box = found.ball.canvasBox;
        notes.push(
          `BALL OFF SCREEN (ball ${found.ball.x},${found.ball.y}`
          + ` canvas ${box?.x},${box?.y} ${box?.w}x${box?.h} vp ${found.vw}x${found.vh})`,
        );
      }
    }
    // Off-screen controls on a scrolling list screen are just below the fold.
    const stranded = route.mustFit ? found.offscreen : [];
    if (stranded.length) {
      notes.push(`${stranded.length} off screen: ${stranded.map((node) => node.text || node.label).join(", ")}`);
    }
    // 44px is a THUMB minimum. A laptop is driven with a pointer, so reporting it
    // there would bury the two things that matter on that shape -- overflow and a
    // stranded control -- under thirty rows of buttons that are fine.
    if (viewport.mobile && found.small.length) notes.push(`${found.small.length} tap target(s) under 44px`);
    if (scrolls || found.overflowX > 2 || stranded.length || (found.ball && !found.ball.onScreen)) {
      problems += 1;
    }

    console.log(`  ${route.name.padEnd(14)} ${found.screen.padEnd(16)} ${notes.join(" · ") || "clean"}`);
    for (const note of found.culprits ?? []) console.log(`      over: ${note}`);
    for (const node of (viewport.mobile ? found.small : []).slice(0, 6)) {
      console.log(`      small: ${(node.text || node.label).padEnd(26)} ${node.w}x${node.h}`);
    }
    await page.close();
  }
}

console.log(`\n${problems} problem(s) found.`);
await browser.close();
server.close();
