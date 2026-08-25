// One-off asset tool: draw the EMPTY ROOM for a set of proposed room sizes, as
// a one-point-perspective skeleton to generate new backdrop art from.
//
//   node tools/room-skeletons.mjs [--out <dir>] [--size <name>]
//                                 [--depth <n> --height <n> [--rim <n>] --name <id>]
//
// Two files per size:
//
//   <name>-skeleton.svg   CLEAN. The room box, the hoop, and nothing else — no
//                         text, no labels, no legend. This is the generation
//                         input: anything written on it comes back painted onto
//                         the wall as garbled lettering.
//   <name>-spec.svg       the same box annotated with every number, for reading.
//
// This is the sibling of `tools/room-masks.mjs`, and the difference matters:
// that one documents the five rooms that EXIST, tracing their real occluders off
// their real art. This one describes rooms that do not exist yet, so it has no
// art to trace and no occluders to draw — those get traced afterwards, off the
// generated backdrop, with `room-contact-sheet.mjs --grid`.
//
// ---------------------------------------------------------------------------
// WHY A ROOM HAS TWO NUMBERS
//
// `depth` is how far the back wall is; `height` is how tall the room is at that
// wall. Both are load-bearing and they have to move together. Depth is the
// difficulty axis — an over-powered shot needs somewhere to overshoot TO, and in
// the shipped 1.0-deep room there is nowhere, so the wall behind the rim returns
// every long shot into the hoop. But depth on its own is not enough: at 2.4 deep
// with the shipped low ceiling a full-power pull still drops 91% of the time,
// because the ceiling truncates the arc and hands the ball back down onto the
// rim. Raise the ceiling with the depth and that same pull misses outright.
//
// ---------------------------------------------------------------------------
// WHY THE HOOP GROWS WITH THE ROOM
//
// The camera is fixed, so a wall twice as far away draws half the size, and a
// mini hoop at the back of a gym is a 20px smudge nobody can aim at. Each size
// therefore carries its own `rim` — a deep room is not the same hoop seen from
// further away, it is a BIGGER hoop, the way a real gym has a regulation ring
// where a bedroom has a toy one. The spec file prints the rim's on-screen
// radius so a size that has shrunk out of playability is obvious before anyone
// paints it.
//
// Ships nothing and is not part of `npm test`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BALL_RADIUS_WORLD,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEPTH_FALLOFF,
  FLOOR_SCREEN_Y,
  HORIZON_SCREEN_Y,
  PROJECTION_ORIGIN_X,
  PROJECTION_X_SCALE,
  PROJECTION_Y_SCALE,
} from "../scripts/sim/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const number = (name, fallback) => {
  const raw = flag(name, null);
  return raw === null ? fallback : Number(raw);
};
const outDir = path.resolve(flag("--out", path.join(gameRoot, "tools", "room-skeletons")));

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------
//
// This is `sim/projection.js`'s camera with the playable-depth clamp REMOVED.
// That clamp stops at z=1.22 because the shipped room is 1.0 deep and a ball
// that overshoots it must not flip the scene inside out — but every size below
// is deeper than the room the clamp was written for, so projecting through the
// real module would flatten them all onto the same wall. The arithmetic is
// otherwise identical, deliberately, and if the camera in constants.js changes
// these pictures change with it.

// THE LENS IS PER ROOM, and that is the whole reason a deep room is possible.
// `DEPTH_FALLOFF` = 1 is a very wide lens: the world halves in size by z=1,
// which is fine for a 1.0-deep bedroom and ruinous past it. At depth 3 on that
// lens the back wall is 240px across and the ball at the wall is SEVEN PIXELS —
// smaller than the minimum the renderer clamps it to, so the sprite would stop
// telling the truth about depth halfway down the room. A deeper room is shot on
// a longer lens, exactly as you would actually photograph a gym, and every size
// below picks one that keeps the far end of its own room legible.
const scaleAt = (z, lens) => 1 / (1 + lens * z);
const floorYAt = (z, lens) => HORIZON_SCREEN_Y + (FLOOR_SCREEN_Y - HORIZON_SCREEN_Y) * scaleAt(z, lens);
const project = (x, y, z, lens) => ({
  x: PROJECTION_ORIGIN_X + x * PROJECTION_X_SCALE * scaleAt(z, lens),
  y: floorYAt(z, lens) - y * PROJECTION_Y_SCALE * scaleAt(z, lens),
});
const lengthAt = (length, z, lens) => length * PROJECTION_X_SCALE * scaleAt(z, lens);

// The shipped lens, for the reference size.
const SHIPPED_LENS = DEPTH_FALLOFF;

// Rim height above the floor, and the backboard's world size. These are the
// shipped hoop's real dimensions, and unlike the ring they do NOT grow with the
// room: a hoop is mounted at a height, and a bigger gym does not raise it.
const RIM_WORLD_Y = 1.6;
const BOARD_WORLD_W = 0.69;
const BOARD_WORLD_H = 0.49;
// How far the ring stands out from the wall, as a fraction of its own radius.
// Slightly more than the shipped hoop, which sits almost flush — see the note in
// the shot analysis: a ring tucked under the board turns the board into a funnel.
const RIM_STANDOFF = 0.55;

// ---------------------------------------------------------------------------
// The proposed sizes
// ---------------------------------------------------------------------------
//
// `depth` and `height` in world units; `rim` is the ring's radius, grown so the
// hoop stays a target you can actually aim at as the wall recedes. `nook` is the
// shipped room, included as the reference the others are read against.

const SIZES = Object.freeze([
  { name: "nook", depth: 1.0, width: 4.92, height: 2.5, lens: SHIPPED_LENS, rim: 0.22, blurb: "the shipped room, for comparison" },
  { name: "office", depth: 1.7, width: 5.2, height: 3.0, lens: 0.82, rim: 0.24, blurb: "a real room you stand back in" },
  { name: "hall", depth: 2.4, width: 5.2, height: 3.6, lens: 0.58, rim: 0.27, blurb: "rec room, function space, long lounge" },
  { name: "gym", depth: 4.0, width: 5.2, height: 6.0, lens: 0.345, rim: 0.33, blurb: "school gym — ceiling out of frame and out of reach" },
  // Kept clear of the gym rather than trailing it by a fraction: two sizes that
  // differ by 0.2 of depth are one size with two names.
  { name: "arena", depth: 5.2, width: 5.2, height: 8.0, lens: 0.27, rim: 0.36, blurb: "the deep end — a hall you shoot across" },
]);

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const round = (value) => Number(value.toFixed(2));
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Every screen-space number a size implies, worked out once. */
function measure(size) {
  const { depth, width, height, lens, rim } = size;
  const wallHalf = lengthAt(width / 2, depth, lens);
  const rimZ = depth - rim * RIM_STANDOFF;
  const rimCentre = project(0, RIM_WORLD_Y, rimZ, lens);
  const boardCentre = project(0, RIM_WORLD_Y + BOARD_WORLD_H * 0.42, depth, lens);
  const boardHpx = BOARD_WORLD_H * PROJECTION_Y_SCALE * scaleAt(depth, lens);

  return {
    ...size,
    rimZ,
    wallLeft: PROJECTION_ORIGIN_X - wallHalf,
    wallRight: PROJECTION_ORIGIN_X + wallHalf,
    wallBaseY: floorYAt(depth, lens),
    wallTopY: project(0, height, depth, lens).y,
    rimCx: rimCentre.x,
    rimCy: rimCentre.y,
    // The ring is a circle seen from above the plane it lies in, so its screen
    // height is a foreshortening of its width. 0.25 is the shipped hoop's ratio
    // (48 x 12) and it is a property of the camera, not of the hoop.
    rimRx: lengthAt(rim, rimZ, lens),
    rimRy: lengthAt(rim, rimZ, lens) * 0.25,
    boardX: boardCentre.x - lengthAt(BOARD_WORLD_W, depth, lens) / 2,
    boardY: boardCentre.y - boardHpx / 2,
    boardW: lengthAt(BOARD_WORLD_W, depth, lens),
    boardH: boardHpx,
    ballNear: lengthAt(BALL_RADIUS_WORLD, 0, lens),
    ballAtWall: lengthAt(BALL_RADIUS_WORLD, depth, lens),
    // Whether the room's ceiling lands inside the frame at all. Load-bearing for
    // the art AND for the physics: a ceiling nobody can see is a ceiling nobody
    // expects the ball to bounce off, so a room this tall wants its ceiling
    // collider out of reach rather than sitting invisibly across the top of the
    // picture. It is also the single fact the generator most needs told — paint
    // a ceiling into a room that has none in frame and the perspective breaks.
    ceilingVisible: project(0, height, depth, lens).y > 0,
  };
}

/**
 * The room as a box: back wall, and the four vanishing lines that carry its
 * corners out to the near plane.
 *
 * The lines run from each wall corner AWAY from the vanishing point until they
 * leave the canvas, which is what a one-point perspective edge is — no second
 * projection needed, just the ray through the corner.
 */
function roomBox(m, { ink, weight }) {
  const parts = [];
  const corners = [
    [m.wallLeft, m.wallTopY],
    [m.wallRight, m.wallTopY],
    [m.wallRight, m.wallBaseY],
    [m.wallLeft, m.wallBaseY],
  ];

  for (const [cx, cy] of corners) {
    // Push the ray out far enough to clear the canvas from any corner.
    const dx = cx - PROJECTION_ORIGIN_X;
    const dy = cy - HORIZON_SCREEN_Y;
    const reach = 6;
    parts.push(
      '<line x1="' + round(cx) + '" y1="' + round(cy) + '"' +
        ' x2="' + round(cx + dx * reach) + '" y2="' + round(cy + dy * reach) + '"' +
        ' stroke="' + ink + '" stroke-width="' + weight + '"/>',
    );
  }

  parts.push(
    '<rect x="' + round(m.wallLeft) + '" y="' + round(m.wallTopY) + '"' +
      ' width="' + round(m.wallRight - m.wallLeft) + '" height="' + round(m.wallBaseY - m.wallTopY) + '"' +
      ' fill="none" stroke="' + ink + '" stroke-width="' + weight * 1.5 + '"/>',
  );
  return parts.join("\n  ");
}

/** Backboard and ring, at the size this room's depth makes them. */
function hoop(m, { ink, weight }) {
  return [
    '<rect x="' + round(m.boardX) + '" y="' + round(m.boardY) + '"' +
      ' width="' + round(m.boardW) + '" height="' + round(m.boardH) + '"' +
      ' fill="none" stroke="' + ink + '" stroke-width="' + weight * 1.5 + '"/>',
    '<ellipse cx="' + round(m.rimCx) + '" cy="' + round(m.rimCy) + '"' +
      ' rx="' + round(m.rimRx) + '" ry="' + round(m.rimRy) + '"' +
      ' fill="none" stroke="' + ink + '" stroke-width="' + weight * 1.5 + '"/>',
    // The bracket, so the ring reads as standing off the wall rather than drawn
    // on it. This is the whole reason the standoff exists.
    '<line x1="' + round(m.rimCx) + '" y1="' + round(m.rimCy) + '"' +
      ' x2="' + round(m.rimCx) + '" y2="' + round(m.boardY + m.boardH) + '"' +
      ' stroke="' + ink + '" stroke-width="' + weight + '"/>',
  ].join("\n  ");
}

function label(x, y, text, { anchor = "start", size = 12, fill = "#111", weight = 600 } = {}) {
  return (
    '<text x="' + round(x) + '" y="' + round(y) + '"' +
    ' font-family="ui-monospace,Menlo,Consolas,monospace" font-size="' + size + '"' +
    ' font-weight="' + weight + '" fill="' + fill + '" text-anchor="' + anchor + '"' +
    ' paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round">' +
    esc(text) +
    "</text>"
  );
}

function svg(title, body) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '"',
    '     viewBox="0 0 ' + CANVAS_WIDTH + " " + CANVAS_HEIGHT + '">',
    "  <title>" + esc(title) + "</title>",
    '  <rect width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '" fill="#ffffff"/>',
    "  " + body,
    "</svg>",
    "",
  ].join("\n");
}

/** The generation input: architecture only, and not one word of text. */
function skeleton(m) {
  return svg(
    m.name + " skeleton",
    [roomBox(m, { ink: "#1b1b1b", weight: 2 }), hoop(m, { ink: "#1b1b1b", weight: 2 })].join("\n  "),
  );
}

/** The same box, annotated, for a person. */
function spec(m) {
  const parts = [
    roomBox(m, { ink: "#8a8a8a", weight: 1.5 }),
    hoop(m, { ink: "#d0342c", weight: 2 }),
    '<line x1="0" y1="' + HORIZON_SCREEN_Y + '" x2="' + CANVAS_WIDTH + '" y2="' + HORIZON_SCREEN_Y + '"' +
      ' stroke="#d0342c" stroke-width="1.25" stroke-dasharray="12 8"/>',
    label(CANVAS_WIDTH - 14, HORIZON_SCREEN_Y - 7, "HORIZON y=" + HORIZON_SCREEN_Y, { anchor: "end", fill: "#a3241d" }),
    label(m.wallRight + 10, m.wallBaseY - 6, "wall base y=" + round(m.wallBaseY), { fill: "#2b4fa8" }),
    label(m.wallRight + 10, m.wallTopY + 16, "wall top y=" + round(m.wallTopY), { fill: "#5b3a99" }),
    label(m.rimCx + m.rimRx + 10, m.rimCy + 4, "rim r=" + m.rim + " (" + round(m.rimRx) + "px)", { fill: "#a3241d" }),
  ];

  // The ball at both ends of the room, which is the fastest read on whether a
  // size is playable: a ball that is a speck at the wall is a size to reject.
  for (const [z, radius] of [[0, m.ballNear], [m.depth, m.ballAtWall]]) {
    const centre = project(0, BALL_RADIUS_WORLD, z, m.lens);
    parts.push(
      '<circle cx="' + round(centre.x) + '" cy="' + round(centre.y) + '" r="' + round(radius) + '"' +
        ' fill="none" stroke="#1b1b1b" stroke-width="1.5" stroke-dasharray="3 3"/>',
    );
  }

  const rows = [
    m.name + " — " + m.blurb,
    "world: " + m.depth + " deep  x  " + m.width + " wide  x  " + m.height + " tall",
    "lens: " + m.lens + " falloff (shipped room is " + SHIPPED_LENS + ")",
    "rim radius " + m.rim + " at z=" + round(m.rimZ) + "  ->  " + round(m.rimRx) + "px on screen",
    "back wall: " + round(m.wallRight - m.wallLeft) + "px wide, y " + round(m.wallTopY) + ".." + round(m.wallBaseY),
    "ball: " + round(m.ballNear) + "px at the player, " + round(m.ballAtWall) + "px at the wall",
    m.ceilingVisible
      ? "ceiling IS in frame — paint one, the ball bounces off it"
      : "ceiling is OUT of frame — paint no ceiling, and nothing can reach it",
  ];
  const height = 22 + rows.length * 16;
  const top = CANVAS_HEIGHT - 14 - height;
  parts.push(
    '<rect x="14" y="' + round(top) + '" width="520" height="' + height + '" rx="8"' +
      ' fill="rgba(255,255,255,.93)" stroke="#1b1b1b" stroke-width="1.5"/>',
  );
  rows.forEach((row, index) => parts.push(label(28, top + 22 + index * 16, row, { size: 12, weight: 500 })));

  return svg(m.name + " spec", parts.join("\n  "));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

fs.mkdirSync(outDir, { recursive: true });

const custom = flag("--name", null);
const chosen = custom
  ? [
      {
        name: custom,
        depth: number("--depth", 2.4),
        width: number("--width", 4.6),
        height: number("--height", 3.8),
        lens: number("--lens", 0.58),
        rim: number("--rim", 0.27),
        blurb: "custom",
      },
    ]
  : SIZES.filter((size) => !flag("--size", null) || size.name === flag("--size", null));

const column = (value, width) => String(value).padEnd(width);
console.log(column("size", 9) + column("depth", 7) + column("wide", 6) + column("tall", 6) + column("lens", 7) +
  column("rim", 6) + column("rim px", 8) + column("wall px", 9) + "ball at wall");
for (const size of chosen) {
  const m = measure(size);
  fs.writeFileSync(path.join(outDir, m.name + "-skeleton.svg"), skeleton(m));
  fs.writeFileSync(path.join(outDir, m.name + "-spec.svg"), spec(m));
  console.log(
    column(m.name, 9) + column(m.depth, 7) + column(m.width, 6) + column(m.height, 6) + column(m.lens, 7) +
      column(m.rim, 6) + column(round(m.rimRx), 8) + column(round(m.wallRight - m.wallLeft), 9) +
      round(m.ballAtWall) + "px",
  );
}

console.log("\nwritten to " + outDir);
