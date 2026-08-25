// One-off asset tool: write each room's COLLISION GEOMETRY out as SVG.
//
//   node tools/room-masks.mjs [--out <dir>] [--room <id>] [--no-embed]
//
// Two files per room, both 960x760 — the canvas size the art is authored at, so
// either can be laid straight over a backdrop with no scaling:
//
//   <room>-geometry.svg   the aligned backdrop with every collider drawn on top
//   <room>-mask.svg       the same geometry with the art removed: flat
//                         silhouettes on white, which is the shape a new room's
//                         splash has to be painted around
//
// WHY SVG RATHER THAN THE CONTACT SHEET. `tools/room-contact-sheet.mjs` answers
// "does the camera agree with this picture", and needs a browser to do it. This
// answers a different question — "what shape is the room the ball is actually
// flying through" — and that answer wants to be scalable, readable as text and
// pasteable into other tools, none of which a PNG is. It also has no
// dependencies at all: every number comes from the sim and the file is
// assembled as a string.
//
// THE MASK IS THE BRIEF. A room backdrop is not free art. The camera is fixed,
// the painted wall base has to land on one scanline, the ceiling has to read at
// one world height, and anything in the foreground has to be traceable as an
// occluder that stays clear of the lane the hoop travels down. The mask states
// all of that as a picture, so a new room can be generated against it instead of
// painted first and argued with afterwards.
//
// Ships nothing and is not part of `npm test`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AIM_RIM_Y_OFFSET,
  BALL_RADIUS_WORLD,
  BOARD_Z,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CEILING_Y,
  FLOOR_SCREEN_Y,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  HORIZON_SCREEN_Y,
  REFERENCE_POWER,
  RIM_CENTER_Z,
  RIM_DRAW_RADIUS_X,
  RIM_DRAW_RADIUS_Y,
  RIM_RADIUS_WORLD,
  TICK_SECONDS,
  WALL_BASE_SCREEN_Y,
} from "../scripts/sim/constants.js";
import {
  ballScreenRadius,
  ceilingScreenY,
  floorScreenY,
  projectPoint,
  screenToWorldAtZ,
} from "../scripts/sim/projection.js";
import { HOOP_TRAVEL_BOUNDS, hoopAt } from "../scripts/sim/hoop.js";
import { locationBackdropPath, locationIds } from "../scripts/assets/location-catalog.js";
import { roomBackdropOffsetY, roomOccluders, roomWallBaseY } from "../scripts/assets/room-geometry.js";
import { createBall, isBallSettled, launchBall, stepBall, worldFor } from "../scripts/sim/physics.js";
import { launchSpin, solveLaunch } from "../scripts/sim/launch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const outDir = path.resolve(flag("--out", path.join(gameRoot, "tools", "room-masks")));
const onlyRoom = flag("--room", null);
const embedArt = !args.includes("--no-embed");

// The depth ladder every plane is sampled at. z=0 is the player's feet and z=1
// is the back wall — the whole playable room is that short, which is most of
// what these pictures are for.
const DEPTHS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// Where the depth ladder's labels sit: right of the lane the hoop travels down,
// and clear of the legend panel in the bottom-left corner. The labels layer is
// drawn last, so sitting over a room's furniture costs nothing.
const DEPTH_LABEL_X = 604;

const round = (value) => Number(value.toFixed(2));
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const poly = (points) => points.map(([x, y]) => round(x) + "," + round(y)).join(" ");
/** Is a scanline inside the frame with room for a line of type on it? */
const onCanvas = (y) => y > 18 && y < CANVAS_HEIGHT - 6;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The rim's real collider, projected: a horizontal circle of RIM_RADIUS_WORLD at
 * depth RIM_CENTER_Z, run through the same camera as everything else.
 *
 * Deliberately drawn alongside the ellipse the renderer paints. The two agreeing
 * is the check — the drawn rim is a fixed screen ellipse and the collider is a
 * world circle, and nothing but this picture ever puts them side by side.
 */
function rimFootprint(hoop) {
  const centre = screenToWorldAtZ(hoop.cx, hoop.rimY, RIM_CENTER_Z);
  const points = [];
  for (let step = 0; step <= 64; step++) {
    const angle = (step / 64) * Math.PI * 2;
    const projected = projectPoint({
      x: centre.x + Math.cos(angle) * RIM_RADIUS_WORLD,
      y: centre.y,
      z: RIM_CENTER_Z + Math.sin(angle) * RIM_RADIUS_WORLD,
    });
    points.push([projected.x, projected.y]);
  }
  return points;
}

/** Play one shot out through the real sim and return its screen-space path. */
function shotPath(power, loft) {
  const ball = createBall();
  const aim = { x: HOOP_BASE_X, y: HOOP_BASE_RIM_Y + AIM_RIM_Y_OFFSET };
  const launch = solveLaunch({ origin: { x: ball.x, y: ball.y, z: ball.z }, aim, power, loft });
  launchBall(ball, launch, launchSpin(launch));

  const points = [];
  const contacts = [];
  let scored = false;
  for (let tick = 0; tick < 220; tick++) {
    const stepped = stepBall(ball, worldFor(hoopAt("still", tick * TICK_SECONDS)), TICK_SECONDS, {
      ballId: "basketball",
      alreadyScored: scored,
    });
    const projected = projectPoint(ball);
    points.push([projected.x, projected.y]);
    // The floor is left out: every shot ends up there and it explains nothing.
    // `score` arrives in `contacts` already, so it is not added a second time.
    for (const kind of stepped.contacts) {
      if (kind !== "floor") contacts.push({ kind, x: projected.x, y: projected.y });
    }
    if (stepped.scored) scored = true;
    if (isBallSettled(ball)) break;
  }
  return { points, scored, contacts };
}

/** What a shot touched on the way, in order, as one readable string. */
function routeOf(path) {
  return path.contacts.length ? path.contacts.map((contact) => contact.kind).join(" -> ") : "clean";
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

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

/**
 * The colliders themselves — identical in both files, only tinted differently.
 *
 * `onArt` says whether this is going over a photograph (so fills are translucent
 * and the ball ladder needs to stay legible) or onto white (so an occluder is a
 * solid silhouette, which is what makes the mask usable as a layout brief).
 */
function colliderLayers(roomId, { onArt }) {
  const hoop = hoopAt("still", 0);
  const offset = roomBackdropOffsetY(roomId);
  const occluders = roomOccluders(roomId);
  const wallTop = ceilingScreenY(BOARD_Z);
  const parts = [];
  // Every piece of text is collected here and emitted in one layer at the very
  // end. Drawn inline it lands under the occluder silhouettes, and in a room
  // like the bedroom that swallows half the depth ladder — the labels are the
  // whole point of the picture, so they go on top of it.
  const labels = [];

  // --- the shell: back wall, floor plane, ceiling plane ----------------------
  parts.push('<g id="room-shell" fill="none" stroke-linejoin="round">');
  // The whole back wall is a collider. Only the backboard part of it is a LIVE
  // surface — bare wall is called a dead miss the instant it is touched.
  parts.push(
    '<rect x="0" y="' + round(wallTop) + '" width="' + CANVAS_WIDTH + '" height="' + round(WALL_BASE_SCREEN_Y - wallTop) + '"' +
      ' fill="' + (onArt ? "rgba(70,130,255,.14)" : "#eaf0ff") + '" stroke="#3f6fe0" stroke-width="2"/>',
  );
  labels.push(label(CANVAS_WIDTH - 14, wallTop + 22, "BACK WALL z=" + BOARD_Z + " — dead miss outside the board", { anchor: "end", fill: "#2b4fa8" }));

  for (const z of DEPTHS) {
    const floorY = floorScreenY(z);
    const ceilY = ceilingScreenY(z);
    const weight = z === 1 ? 2 : 1;
    const dash = z === 1 ? "none" : "6 6";
    parts.push(
      '<line x1="0" y1="' + round(floorY) + '" x2="' + CANVAS_WIDTH + '" y2="' + round(floorY) + '"' +
        ' stroke="#3f6fe0" stroke-width="' + weight + '" stroke-dasharray="' + dash + '"/>',
    );
    parts.push(
      '<line x1="0" y1="' + round(ceilY) + '" x2="' + CANVAS_WIDTH + '" y2="' + round(ceilY) + '"' +
        ' stroke="#8a5cd6" stroke-width="' + weight + '" stroke-dasharray="' + dash + '"/>',
    );
    // Pushed into the middle of the frame rather than the gutter: the left and
    // right thirds of most rooms are foreground furniture, and a depth label
    // sitting on a silhouette is the one label nobody can read.
    // The near end of the ceiling ladder is above the frame — the ceiling
    // directly over the player is off-camera — so those labels are dropped
    // rather than clamped into a row they do not belong on.
    if (onCanvas(floorY)) labels.push(label(DEPTH_LABEL_X, floorY - 5, "floor z=" + z, { size: 11, fill: "#2b4fa8" }));
    if (onCanvas(ceilY)) labels.push(label(DEPTH_LABEL_X, ceilY + 14, "ceiling z=" + z, { size: 11, fill: "#5b3a99" }));
  }

  // Eye level. Every receding edge in the paint has to converge on this line.
  parts.push(
    '<line x1="0" y1="' + HORIZON_SCREEN_Y + '" x2="' + CANVAS_WIDTH + '" y2="' + HORIZON_SCREEN_Y + '"' +
      ' stroke="#d0342c" stroke-width="1.5" stroke-dasharray="12 8"/>',
  );
  labels.push(label(CANVAS_WIDTH - 14, HORIZON_SCREEN_Y - 7, "HORIZON  y=" + HORIZON_SCREEN_Y, { anchor: "end", fill: "#a3241d" }));
  labels.push(
    label(CANVAS_WIDTH - 14, WALL_BASE_SCREEN_Y - 8, "WALL BASE  y=" + round(WALL_BASE_SCREEN_Y), { anchor: "end", fill: "#2b4fa8" }),
  );
  parts.push("</g>");

  // --- the hoop -------------------------------------------------------------
  parts.push('<g id="hoop" fill="none">');
  parts.push(
    '<rect x="' + round(hoop.boardX) + '" y="' + round(hoop.boardY) + '" width="' + hoop.boardW + '" height="' + hoop.boardH + '"' +
      ' fill="' + (onArt ? "rgba(255,190,60,.22)" : "#fff3d2") + '" stroke="#e08a00" stroke-width="2.5"/>',
  );
  labels.push(label(hoop.boardX + hoop.boardW / 2, hoop.boardY + 22, "BACKBOARD", { anchor: "middle", fill: "#a35f00" }));
  parts.push(
    '<ellipse cx="' + hoop.cx + '" cy="' + hoop.rimY + '" rx="' + RIM_DRAW_RADIUS_X + '" ry="' + RIM_DRAW_RADIUS_Y + '"' +
      ' stroke="#d0342c" stroke-width="3"/>',
  );
  parts.push('<polygon points="' + poly(rimFootprint(hoop)) + '" stroke="#d0342c" stroke-width="1.25" stroke-dasharray="4 4"/>');
  labels.push(label(hoop.cx + 62, hoop.rimY + 4, "RIM  z=" + RIM_CENTER_Z + "  r=" + RIM_RADIUS_WORLD, { fill: "#a3241d" }));
  parts.push(
    '<rect x="' + HOOP_TRAVEL_BOUNDS.minX + '" y="' + HOOP_TRAVEL_BOUNDS.minY + '"' +
      ' width="' + (HOOP_TRAVEL_BOUNDS.maxX - HOOP_TRAVEL_BOUNDS.minX) + '"' +
      ' height="' + (HOOP_TRAVEL_BOUNDS.maxY - HOOP_TRAVEL_BOUNDS.minY) + '"' +
      ' stroke="#d0342c" stroke-width="1.5" stroke-dasharray="8 6"/>',
  );
  labels.push(
    label(HOOP_TRAVEL_BOUNDS.minX, HOOP_TRAVEL_BOUNDS.minY - 8, "HOOP TRAVEL — keep foreground clear of this box", {
      fill: "#a3241d",
      size: 11,
    }),
  );
  parts.push("</g>");

  // --- the ball, at the depths it is actually seen at ------------------------
  parts.push('<g id="ball-ladder" fill="none" stroke="' + (onArt ? "#ffffff" : "#1b1b1b") + '" stroke-width="1.5">');
  for (const z of DEPTHS) {
    const centre = projectPoint({ x: 0, y: BALL_RADIUS_WORLD, z });
    parts.push(
      '<circle cx="' + round(centre.x) + '" cy="' + round(centre.y) + '" r="' + round(ballScreenRadius(z)) + '" stroke-dasharray="3 3"/>',
    );
  }
  parts.push("</g>");

  // --- occluders ------------------------------------------------------------
  parts.push('<g id="occluders">');
  for (const occluder of occluders) {
    // Source-image coordinates, carried onto the canvas by the room's own
    // alignment shift — the same arithmetic `render/scene.js` does.
    const shifted = occluder.polygon.map(([x, y]) => [x, y + offset]);
    parts.push(
      '<polygon points="' + poly(shifted) + '" fill="' + (onArt ? "rgba(30,190,140,.30)" : "#1b1b1b") + '"' +
        ' stroke="#0f9d68" stroke-width="2.5"/>',
    );
    const [anchorX, anchorY] = shifted[0];
    labels.push(label(anchorX + 6, anchorY + 18, "occluder z=" + occluder.z, { fill: onArt ? "#0b6f4a" : "#0f9d68", size: 12 }));
  }
  parts.push("</g>");

  return {
    markup: parts.join("\n  "),
    labels: '<g id="labels">\n  ' + labels.join("\n  ") + "\n  </g>",
    occluders,
  };
}

/**
 * The two arcs that show what the room does to a shot, played through the real
 * sim rather than sketched.
 */
function shotLayer() {
  const reference = shotPath(REFERENCE_POWER, 1);
  const full = shotPath(1, 1);

  // Both shots leave straight up the centre line, so the two polylines sit on
  // top of one another and the paths alone say almost nothing. What separates
  // them is WHERE EACH ONE TOUCHES THE ROOM — so every contact is marked and
  // named, and the full-power shot's route reads as the tour of the room it is.
  const line = (path, colour, dash) =>
    '<polyline points="' + poly(path.points) + '" fill="none" stroke="' + colour + '" stroke-width="2.5"' +
    ' stroke-dasharray="' + dash + '" stroke-linejoin="round" stroke-linecap="round"/>';
  const dots = (path, colour) =>
    path.contacts
      .map(
        (contact) =>
          '<circle cx="' + round(contact.x) + '" cy="' + round(contact.y) + '" r="5"' +
          ' fill="' + colour + '" stroke="#fff" stroke-width="1.5"/>',
      )
      .join("\n  ");

  return {
    markup: [
      '<g id="shots" opacity=".95">',
      line(reference, "#0f9d68", "none"),
      line(full, "#d0342c", "9 6"),
      dots(full, "#d0342c"),
      "</g>",
    ].join("\n  "),
    labels: full.contacts
      .map((contact, index) => label(contact.x + 12, contact.y + 4 + index * 14, contact.kind.toUpperCase(), { fill: "#a3241d", size: 11 }))
      .join("\n  "),
    rows: [
      "shot A solid  — pull " + Math.round(REFERENCE_POWER * 100) + "%: " + (reference.scored ? "IN" : "out") + ", " + routeOf(reference),
      "shot B dashed — pull 100%: " + (full.scored ? "IN" : "out") + ", " + routeOf(full),
    ],
  };
}

function legend(roomId, occluders, extraRows = []) {
  const shift = roomBackdropOffsetY(roomId);
  const rows = [
    "room: " + roomId,
    "canvas: " + CANVAS_WIDTH + "x" + CANVAS_HEIGHT + ", art authored 1:1",
    "painted wall base y=" + roomWallBaseY(roomId) + "  ->  art shifted " + (shift >= 0 ? "+" : "") + round(shift) + "px",
    "camera: horizon y=" + HORIZON_SCREEN_Y + ", floor@z0 y=" + FLOOR_SCREEN_Y + ", wall base y=" + round(WALL_BASE_SCREEN_Y),
    "room: 1.00 deep x " + round(CEILING_Y) + " tall (world units), no side walls",
    "ball radius " + BALL_RADIUS_WORLD + "  |  rim z=" + RIM_CENTER_Z + " r=" + RIM_RADIUS_WORLD + "  |  board plane z=" + BOARD_Z,
    "occluders: " + occluders.length,
    ...extraRows,
  ];
  const height = 22 + rows.length * 16;
  // Bottom-left. The top of every one of these rooms is wall, backboard and the
  // ceiling end of the depth ladder, and a panel up there covered the hoop in
  // all five.
  const top = CANVAS_HEIGHT - 14 - height;
  const parts = [
    '<g id="legend">',
    '<rect x="14" y="' + round(top) + '" width="560" height="' + height + '" rx="8" fill="rgba(255,255,255,.93)" stroke="#1b1b1b" stroke-width="1.5"/>',
  ];
  rows.forEach((row, index) => parts.push(label(28, top + 22 + index * 16, row, { size: 12, weight: 500 })));
  parts.push("</g>");
  return parts.join("\n  ");
}

function artLayer(roomId) {
  const file = path.join(gameRoot, locationBackdropPath(roomId));
  const href = embedArt
    ? "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64")
    : path.relative(outDir, file).split(path.sep).join("/");
  return (
    '<image href="' + href + '" x="0" y="' + round(roomBackdropOffsetY(roomId)) + '"' +
    ' width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '" preserveAspectRatio="none"/>'
  );
}

function svg(title, body) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '"',
    '     viewBox="0 0 ' + CANVAS_WIDTH + " " + CANVAS_HEIGHT + '">',
    "  <title>" + esc(title) + "</title>",
    "  " + body,
    "</svg>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

fs.mkdirSync(outDir, { recursive: true });
const rooms = onlyRoom ? [onlyRoom] : locationIds();

// The shots do not depend on the room — the sim has never heard of one — so they
// are played once and drawn into all five.
const shots = shotLayer();

for (const roomId of rooms) {
  // The geometry view carries the two shots; the mask deliberately does not. A
  // mask is a layout brief for whoever paints the next room, and a trajectory is
  // not part of that brief — it would be one more line to paint around.
  const overArt = colliderLayers(roomId, { onArt: true });
  fs.writeFileSync(
    path.join(outDir, roomId + "-geometry.svg"),
    svg(
      roomId + " — collision geometry over the paint",
      [
        artLayer(roomId),
        overArt.markup,
        shots.markup,
        overArt.labels,
        shots.labels,
        legend(roomId, overArt.occluders, shots.rows),
      ].join("\n  "),
    ),
  );

  const bare = colliderLayers(roomId, { onArt: false });
  fs.writeFileSync(
    path.join(outDir, roomId + "-mask.svg"),
    svg(
      roomId + " — collision mask",
      [
        '<rect width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '" fill="#ffffff"/>',
        bare.markup,
        bare.labels,
        legend(roomId, bare.occluders),
      ].join("\n  "),
    ),
  );
  console.log(roomId + ": " + roomId + "-geometry.svg, " + roomId + "-mask.svg");
}

console.log("\nwritten to " + outDir);
