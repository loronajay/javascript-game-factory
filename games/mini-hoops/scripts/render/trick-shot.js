// Perspective-matched procedural art for the Trick Shot Lab's sandbox pieces,
// plus the Lab's frame composition. Everything here is projected from world-space
// records through the cabinet's one camera; there are no separately eyeballed
// sprites to drift away from their colliders.
//
// THREE RULES CAME OUT OF THE FIRST PASS READING AS "MESSY", AND THEY ARE WHAT
// THIS FILE IS ORGANISED AROUND.
//
// 1. A TOOL IS A SOLID BLOCK, LIT. The pads used to be drawn as flat neon quads
//    with flat fills. A flat fill carries no information about which way a
//    surface faces, so a pad being rotated read as a shape MORPHING rather than
//    an object turning — and near edge-on it collapsed to a bright sliver that
//    looked like a rendering fault. Every pad face is now back-face culled by
//    its own projected winding and shaded by one fixed light, the same
//    light-from-the-left the rooms and `render/hoop.js` already assume. The turn
//    reads as a turn because the lighting changes with it. `BOARD_PAD_THICKNESS`
//    is the other half of that fix and lives with the collider it belongs to.
//
// 2. DEPTH IS ANSWERED ON THE FLOOR, NOT IN THE AIR. A piece drawn smaller and
//    higher up the canvas is ambiguous on a still frame — a high near tool and a
//    low far one land in the same place. `drawPieceShadow` is the always-on
//    answer (the same trick `drawBallShadow` and `drawBinShadow` use), and in
//    build mode a footprint ring and tether at the piece's own depth say it in a
//    straight line. Only the GAP between a tool and its own floor mark grows
//    with height, which is what resolves the ambiguity.
//
// 3. CHROME BELONGS TO BUILD MODE, AND DETAIL BELONGS TO THE SELECTION. Handles,
//    tethers, footprint rings, the floor grid and the contact preview are all
//    gone the moment a shot is live — mid-flight, nothing about the colliders is
//    the player's business, which is the rule the tic-tac-toe court already
//    keeps. Unselected pieces get a shadow and a quiet footprint; the selected
//    one gets the handles. The per-piece text labels this replaced put a caption
//    box over every tool on the court at once, which is most of what made a
//    five-piece layout unreadable.

import { BALL_RADIUS_WORLD, BOARD_Z, GRAVITY, RIM_CENTER_Z } from "../sim/constants.js";
import { trickShotImpactProgress } from "../effects/trick-shot-impact.js";
import {
  BOARD_PAD_THICKNESS,
  BOARD_PIECE,
  CANNON_PIECE,
  SPRING_PIECE,
  boardFrame,
  cannonDirection,
  isPadPiece,
} from "../sim/trick-shot.js";
import { BIN_TARGET } from "../sim/trick-shot-target.js";
import { ballScreenRadius, depthScaleAt, projectPoint, worldToScreenLength } from "../sim/projection.js";
import { drawAim } from "./aim.js";
import { drawBall } from "./ball.js";
import { binMouthEllipse, drawBinBody, drawBinLip, drawBinShadow } from "./bin.js";
import { drawBackboard, drawNet, drawRim } from "./hoop.js";
import { drawSplatDecals, drawSplatParticles } from "./splats.js";
import {
  clearScene,
  depthGradeFilter,
  drawBallShadow,
  drawRoom,
  drawRoomOccluders,
  drawWallShadow,
} from "./scene.js";

export const TRICK_SHOT_ASSET_PATHS = Object.freeze({
  cannonBase: "assets/trick-shot/cannon-base.png",
  cannonBarrel: "assets/trick-shot/cannon-barrel.png",
});

const CANNON_RING_RADIUS = 0.135;
const CANNON_MOUTH_HEIGHT = 0.08;
const DELETE_HANDLE_RADIUS = 17;
const DEPTH_HANDLE_RADIUS = 18;

/**
 * The one light in the room, and it is the room's own.
 *
 * From the upper left and slightly in front of the scene, matching the painted
 * backdrops and every gradient in `render/hoop.js`. Stated once here because a
 * second light would make a pad's shading disagree with the rim standing next to
 * it, which is the class of drift a single constant makes impossible.
 */
const LIGHT = (() => {
  const raw = { x: -0.62, y: 0.68, z: -0.39 };
  const length = Math.hypot(raw.x, raw.y, raw.z);
  return { x: raw.x / length, y: raw.y / length, z: raw.z / length };
})();

/**
 * Ambient floor, so a face turned fully away is dim rather than black.
 *
 * Not a taste number: a pad turned edge-on shows only its shell faces, and at a
 * lower floor those went so dark that the one thing left saying which TOOL it
 * was — cyan pad or red springboard — was the thin silhouette. A block has to
 * keep its identity colour at every angle.
 */
const AMBIENT = 0.4;

/**
 * Each piece's palette: the shell it is made of, the accent its impact faces
 * carry, and the neon it glows with. One record per look, so "what colour is a
 * springboard" has one answer instead of eleven inline literals.
 */
const PALETTES = Object.freeze({
  [BOARD_PIECE]: {
    shell: [30, 66, 80],
    face: [24, 118, 142],
    accent: [83, 245, 255],
    glow: "#3ef4ff",
  },
  [SPRING_PIECE]: {
    shell: [86, 27, 27],
    face: [150, 38, 32],
    accent: [255, 214, 79],
    glow: "#ff5a45",
  },
  selected: {
    shell: [58, 70, 24],
    face: [122, 148, 40],
    accent: [216, 255, 77],
    glow: "#d8ff4d",
  },
});

const paletteFor = (piece, selected) => (
  selected ? PALETTES.selected : PALETTES[piece.type] || PALETTES[BOARD_PIECE]
);

const imageReady = (image) => image?.complete && image.naturalWidth;

const rgb = ([r, g, b], alpha = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;

/** A base colour under this file's one light, given a world-space face normal. */
function litColor(base, normal, alpha = 1) {
  const lambert = Math.max(0, normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z);
  const level = AMBIENT + (1 - AMBIENT) * lambert;
  return rgb(base.map((channel) => Math.min(255, channel * level + 26 * lambert * lambert)), alpha);
}

const boardPoint = (piece, frame, right, up, normal) => ({
  x: piece.x + frame.right.x * right + frame.up.x * up + frame.normal.x * normal,
  y: piece.y + frame.right.y * right + frame.up.y * up + frame.normal.y * normal,
  z: piece.z + frame.right.z * right + frame.up.z * up + frame.normal.z * normal,
});

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = [];
  for (const point of sorted) {
    while (half.length >= 2 && cross(half.at(-2), half.at(-1), point) <= 0) half.pop();
    half.push(point);
  }
  const lower = half.slice(0, -1);
  half.length = 0;
  for (const point of sorted.reverse()) {
    while (half.length >= 2 && cross(half.at(-2), half.at(-1), point) <= 0) half.pop();
    half.push(point);
  }
  return [...lower, ...half.slice(0, -1)];
}

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

const polygonArea = (points) => Math.abs(signedArea(points));

/**
 * The six faces of the pad's box, each in an order that is counter-clockwise
 * SEEN FROM OUTSIDE, with its outward normal in the pad's own basis.
 *
 * The basis is right-handed (`right x up = normal`, see `boardFrame`), which is
 * what lets one winding convention cover all six. Front-facing is then decided
 * from each face's PROJECTED winding rather than from a camera position — this
 * camera has no explicit eye point, and the projected winding is the exact test
 * regardless of that.
 */
const FACE_TEMPLATES = Object.freeze([
  { kind: "impact", axis: "normal", sign: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
  { kind: "impact", axis: "normal", sign: -1, corners: [[-1, -1], [-1, 1], [1, 1], [1, -1]] },
  { kind: "edge", axis: "right", sign: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
  { kind: "edge", axis: "right", sign: -1, corners: [[-1, -1], [-1, 1], [1, 1], [1, -1]] },
  { kind: "edge", axis: "up", sign: 1, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
  { kind: "edge", axis: "up", sign: -1, corners: [[-1, -1], [-1, 1], [1, 1], [1, -1]] },
]);

/** Place one template's corner in world space for this pad. */
function faceCorner(template, piece, frame, half, depth, [u, v]) {
  const fixed = template.sign * (template.axis === "normal" ? depth : half);
  if (template.axis === "normal") return boardPoint(piece, frame, u * half, v * half, fixed);
  if (template.axis === "right") return boardPoint(piece, frame, fixed, u * half, v * depth);
  return boardPoint(piece, frame, v * half, fixed, u * depth);
}

/**
 * Projected faces and silhouette of the EXACT box `sim/trick-shot-physics.js`
 * collides against — same half-face, same half-depth, one source for both.
 *
 * `front`/`back` are kept for the screen tests and for anything that only wants
 * the two impact quads; `faces` is what the renderer actually paints.
 */
export function boardProjectedGeometry(piece) {
  const frame = boardFrame(piece);
  const half = piece.length / 2;
  const depth = BOARD_PAD_THICKNESS / 2;
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const worldFront = signs.map(([x, y]) => boardPoint(piece, frame, x * half, y * half, depth));
  const worldBack = signs.map(([x, y]) => boardPoint(piece, frame, x * half, y * half, -depth));

  const faces = FACE_TEMPLATES.map((template) => {
    const world = template.corners.map((corner) => faceCorner(template, piece, frame, half, depth, corner));
    const points = world.map(projectPoint);
    const axis = frame[template.axis];
    return {
      kind: template.kind,
      axis: template.axis,
      sign: template.sign,
      world,
      points,
      normal: { x: axis.x * template.sign, y: axis.y * template.sign, z: axis.z * template.sign },
      centre: world.reduce((sum, point) => ({
        x: sum.x + point.x / 4,
        y: sum.y + point.y / 4,
        z: sum.z + point.z / 4,
      }), { x: 0, y: 0, z: 0 }),
      // Positive signed area on a y-down canvas, with the winding above, is a
      // face whose OUTSIDE is turned toward the camera. Near-zero means the face
      // is edge-on and is dropped by the area filter at the draw site: a
      // degenerate quad is a hairline that only ever draws as an artefact.
      facing: signedArea(points) > 0,
    };
  });

  return {
    front: worldFront.map(projectPoint),
    back: worldBack.map(projectPoint),
    faces,
    hull: convexHull([...worldFront, ...worldBack].map(projectPoint)),
    centre: projectPoint(piece),
  };
}

function pointInInflatedPadSegment(from, to, piece) {
  const frame = boardFrame(piece);
  const local = (point) => {
    const relative = { x: point.x - piece.x, y: point.y - piece.y, z: point.z - piece.z };
    return {
      x: relative.x * frame.right.x + relative.y * frame.right.y + relative.z * frame.right.z,
      y: relative.x * frame.up.x + relative.y * frame.up.y + relative.z * frame.up.z,
      z: relative.x * frame.normal.x + relative.y * frame.normal.y + relative.z * frame.normal.z,
    };
  };
  const a = local(from);
  const b = local(to);
  const direction = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const halfFace = piece.length / 2;
  const halfDepth = BOARD_PAD_THICKNESS / 2;
  const limits = {
    x: halfFace + BALL_RADIUS_WORLD,
    y: halfFace + BALL_RADIUS_WORLD,
    z: halfDepth + BALL_RADIUS_WORLD,
  };
  let enter = 0;
  let exit = 1;
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (Math.abs(a[axis]) > limits[axis]) return null;
      continue;
    }
    let near = (-limits[axis] - a[axis]) / direction[axis];
    let far = (limits[axis] - a[axis]) / direction[axis];
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  if (exit < 0 || enter > 1) return null;
  const t = Math.max(0, enter);
  const centre = {
    x: a.x + direction.x * t,
    y: a.y + direction.y * t,
    z: a.z + direction.z * t,
  };
  const faceSign = centre.z < 0 ? -1 : 1;
  return boardPoint(
    piece,
    frame,
    Math.max(-halfFace, Math.min(halfFace, centre.x)),
    Math.max(-halfFace, Math.min(halfFace, centre.y)),
    faceSign * halfDepth,
  );
}

/** First place the un-obstructed aiming arc enters a pad's ball-sized collider. */
export function trajectoryPadContact(trajectory, piece) {
  if (!isPadPiece(piece) || !Array.isArray(trajectory) || trajectory.length < 2) return null;
  for (let index = 1; index < trajectory.length; index++) {
    const contact = pointInInflatedPadSegment(trajectory[index - 1], trajectory[index], piece);
    if (contact) return contact;
  }
  return null;
}

// --- painting helpers -------------------------------------------------------

function polygonPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function insetPolygon(points, amount) {
  const centre = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
  return points.map((point) => ({
    x: point.x + (centre.x - point.x) * amount,
    y: point.y + (centre.y - point.y) * amount,
  }));
}

/** One arrowhead, pointing along the screen direction `from` -> `to`. */
function drawArrowHead(ctx, from, to, color, head) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  if (!Number.isFinite(angle) || Math.hypot(to.x - from.x, to.y - from.y) < 3) return;
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(4,7,13,.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(head, 0);
  ctx.lineTo(-head * 0.85, -head * 0.72);
  ctx.lineTo(-head * 0.85, head * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * The pad's bounce axis: one double-headed arrow through its centre, along the
 * face normal in BOTH directions.
 *
 * Double-headed because a pad is two-sided — `resolvePad` bounces off whichever
 * face the ball reaches — so a single arrow would be naming one of two equally
 * real answers.
 *
 * Drawn in WORLD length, which makes it exactly complementary to the face
 * motifs: when the pad faces the camera the normal points at the lens and this
 * foreshortens to nothing, which is the case where the face itself is fully
 * readable; when the pad turns edge-on and the faces vanish, this reaches its
 * full length. Between them, something always says which way the pad throws.
 */
function drawPadAxis(ctx, piece, palette, spring) {
  const frame = boardFrame(piece);
  // Scaled to the pad rather than fixed, so a small tool does not wear a huge
  // axis and a court full of them does not turn into a thicket of arrows.
  const reach = piece.length * (spring ? 0.42 : 0.32);
  const centre = projectPoint(piece);
  const ends = [1, -1].map((sign) => projectPoint({
    x: piece.x + frame.normal.x * reach * sign,
    y: piece.y + frame.normal.y * reach * sign,
    z: piece.z + frame.normal.z * reach * sign,
  }));
  if (Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y) < 7) return;

  const color = rgb(palette.accent);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(4,7,13,.8)";
  ctx.lineWidth = (spring ? 3.5 : 2.4) + 3.5;
  ctx.beginPath();
  ctx.moveTo(ends[0].x, ends[0].y);
  ctx.lineTo(ends[1].x, ends[1].y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = spring ? 3.5 : 2.4;
  ctx.stroke();
  ctx.restore();
  for (const end of ends) drawArrowHead(ctx, centre, end, color, spring ? 8 : 6);
}

// --- the pad ----------------------------------------------------------------

/**
 * The compression zig-zag on a springboard's impact face.
 *
 * Every point is placed by bilinear interpolation inside the already-inset face
 * quad, so the motif foreshortens WITH the face rather than being stamped on
 * flat. A zig-zag rather than four little coils: coils merge into a blob the
 * moment the face turns, and this reads as a spring at any size and any angle.
 */
function drawSpringFaceMotif(ctx, quad, accent) {
  const point = (u, v) => {
    const top = {
      x: quad[0].x + (quad[1].x - quad[0].x) * u,
      y: quad[0].y + (quad[1].y - quad[0].y) * u,
    };
    const bottom = {
      x: quad[3].x + (quad[2].x - quad[3].x) * u,
      y: quad[3].y + (quad[2].y - quad[3].y) * u,
    };
    return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [offset, alpha, width] of [[0, 0.9, 4], [0.16, 0.42, 2.5]]) {
    ctx.beginPath();
    for (let index = 0; index <= 6; index++) {
      const u = 0.14 + (index / 6) * 0.72;
      const spot = point(u, Math.min(0.92, 0.26 + (index % 2) * 0.46 + offset));
      if (index === 0) ctx.moveTo(spot.x, spot.y);
      else ctx.lineTo(spot.x, spot.y);
    }
    ctx.strokeStyle = rgb(accent, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
}

/** The target ring on a rebound pad's impact face — where a centred hit lands. */
function drawBoardFaceMotif(ctx, quad, accent) {
  const inner = insetPolygon(quad, 0.42);
  polygonPath(ctx, inner);
  ctx.strokeStyle = rgb(accent, 0.72);
  ctx.lineWidth = 2;
  ctx.stroke();
  const centre = inner.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  ctx.fillStyle = rgb(accent, 0.95);
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A pad, as a lit solid.
 *
 * Visible faces only, painted far to near, each shaded by its own world normal
 * against the one light. The impact faces additionally carry an outward arrow —
 * a pad bounces off WHICHEVER face is hit, so every visible one gets a marker
 * rather than one arbitrary side, and that marker is what still says "this way"
 * when the block is turned near edge-on and its face has almost no area left.
 */
function drawSquarePad(ctx, piece, selected, predictedContact = null, showPreview = true) {
  const palette = paletteFor(piece, selected);
  const spring = piece.type === SPRING_PIECE;
  const geometry = boardProjectedGeometry(piece);
  const visible = geometry.faces
    .filter((face) => face.facing && polygonArea(face.points) > 1)
    .sort((a, b) => b.centre.z - a.centre.z);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = selected ? 16 : 7;
  for (const face of visible) {
    polygonPath(ctx, face.points);
    ctx.fillStyle = litColor(face.kind === "impact" ? palette.face : palette.shell, face.normal);
    ctx.fill();
    // The seam between two faces of one solid is a dark crease, not a neon
    // outline: outlining every face in the accent is what made the old pad read
    // as a wireframe rather than as a block.
    ctx.strokeStyle = "rgba(4,8,14,.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  for (const face of visible) {
    if (face.kind !== "impact") continue;
    const area = polygonArea(face.points);
    if (area < 90) continue;
    const quad = insetPolygon(face.points, 0.13);
    polygonPath(ctx, quad);
    ctx.strokeStyle = rgb(palette.accent, 0.85);
    ctx.lineWidth = Math.max(1.5, 2.4 * depthScaleAt(piece.z));
    ctx.stroke();
    if (area < 900) continue;
    if (spring) drawSpringFaceMotif(ctx, quad, palette.accent);
    else drawBoardFaceMotif(ctx, quad, palette.accent);
  }

  // The silhouette. One bright edge around the whole solid keeps a pad readable
  // against a dark room without lighting up its internal seams.
  polygonPath(ctx, geometry.hull);
  ctx.strokeStyle = rgb(palette.accent, selected ? 0.95 : 0.58);
  ctx.lineWidth = selected ? 2.6 : 1.6;
  ctx.stroke();
  ctx.restore();

  drawPadAxis(ctx, piece, palette, spring);
  if (showPreview) drawPredictedContact(ctx, predictedContact, palette);
}

/**
 * Where the aiming arc will first meet this pad.
 *
 * Build-mode only, and deliberately small: it answers "will I hit it" while the
 * player is still holding the pull, and it has no business over a live shot.
 */
function drawPredictedContact(ctx, contact, palette) {
  if (!contact) return;
  const point = projectPoint(contact);
  ctx.save();
  ctx.strokeStyle = rgb(palette.accent, 0.95);
  ctx.fillStyle = rgb(palette.accent, 0.2);
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- the cannon -------------------------------------------------------------

function ringPoints(piece, count = 30) {
  const points = [];
  for (let index = 0; index <= count; index++) {
    const angle = (Math.PI * 2 * index) / count;
    points.push(projectPoint({
      x: piece.x + Math.cos(angle) * CANNON_RING_RADIUS,
      y: piece.y + CANNON_MOUTH_HEIGHT,
      z: piece.z + Math.sin(angle) * CANNON_RING_RADIUS,
    }));
  }
  return points;
}

function strokeGlow(ctx, color, width, drawPath, selected = false) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = selected ? 20 : 11;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = width + (selected ? 10 : 7);
  drawPath();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = selected ? 12 : 6;
  ctx.lineWidth = width;
  drawPath();
  ctx.stroke();
  ctx.restore();
}

function cannonTrajectory(piece) {
  const direction = cannonDirection(piece);
  const points = [];
  for (let t = 0.06; t <= 0.72; t += 0.055) {
    points.push(projectPoint({
      x: piece.x + direction.x * piece.speed * t,
      y: piece.y + CANNON_MOUTH_HEIGHT + direction.y * piece.speed * t - 0.5 * GRAVITY * t * t,
      z: piece.z + direction.z * piece.speed * t,
    }));
  }
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function drawCannon(ctx, piece, selected, capture, assets = {}, showPreview = true) {
  const mouth = projectPoint({ x: piece.x, y: piece.y + CANNON_MOUTH_HEIGHT, z: piece.z });
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  const direction = cannonDirection(piece);
  const muzzle = projectPoint({
    x: piece.x + direction.x * 0.2,
    y: piece.y + CANNON_MOUTH_HEIGHT + direction.y * 0.2,
    z: piece.z + direction.z * 0.2,
  });
  const color = selected ? "#d8ff4d" : "#ff4ddb";
  const scale = depthScaleAt(piece.z);

  if (imageReady(assets.cannonBase)) {
    const baseHeight = 178 * scale;
    const baseWidth = 136 * scale;
    ctx.save();
    // Graded with depth like every other object in the room. Without it the
    // launcher is the one thing that does not get darker as it goes back, which
    // is precisely the cue the depth complaint was about.
    ctx.filter = depthGradeFilter(piece.z);
    if (selected) {
      ctx.shadowColor = "#d8ff4d";
      ctx.shadowBlur = 18;
    }
    ctx.drawImage(assets.cannonBase, floor.x - baseWidth / 2, floor.y - baseHeight, baseWidth, baseHeight);
    ctx.restore();
  }

  if (imageReady(assets.cannonBarrel)) {
    const barrelAngle = Math.atan2(muzzle.y - mouth.y, muzzle.x - mouth.x);
    const projectedLength = Math.hypot(muzzle.x - mouth.x, muzzle.y - mouth.y);
    const barrelLength = Math.max(78 * scale, projectedLength * 1.35);
    const barrelHeight = Math.max(31, 48 * scale);
    ctx.save();
    ctx.translate(mouth.x, mouth.y);
    ctx.rotate(barrelAngle);
    ctx.filter = depthGradeFilter(piece.z);
    ctx.shadowColor = selected ? "#d8ff4d" : "rgba(255,77,219,.45)";
    ctx.shadowBlur = selected ? 18 : 8;
    ctx.drawImage(assets.cannonBarrel, -barrelHeight * 0.13, -barrelHeight / 2, barrelLength, barrelHeight);
    ctx.restore();
  }

  if (!imageReady(assets.cannonBase) || !imageReady(assets.cannonBarrel)) {
    strokeGlow(ctx, color, Math.max(7, 12 * scale), () => {
      ctx.beginPath();
      ctx.moveTo(floor.x, floor.y);
      ctx.lineTo(mouth.x, mouth.y);
      ctx.lineTo(muzzle.x, muzzle.y);
    }, selected);
  }

  const ring = ringPoints(piece);
  strokeGlow(ctx, capture ? "#fff36a" : color, Math.max(3.5, 6 * scale), () => {
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (const point of ring.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }, selected);

  // The authored trajectory is a real ballistic preview from this launcher's own
  // yaw, pitch and speed. Shown only for the SELECTED launcher in build mode, so
  // tuning a slider gives immediate feedback without every cannon on the court
  // trailing a dashed arc through a live shot.
  if (selected && showPreview) {
    const path = cannonTrajectory(piece);
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(216,255,77,.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(muzzle.x, muzzle.y);
    for (const point of path) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
  }

  if (capture) {
    const ratio = Math.max(0, Math.min(1, 1 - capture.remaining / piece.delay));
    ctx.save();
    ctx.strokeStyle = "#fff36a";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#fff36a";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(mouth.x, mouth.y, 17 * scale, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawSandboxPiece(ctx, piece, {
  selected = false, capture = null, pieceAssets = {}, predictedContact = null, showPreview = true,
} = {}) {
  if (isPadPiece(piece)) drawSquarePad(ctx, piece, selected, predictedContact, showPreview);
  else if (piece.type === CANNON_PIECE) {
    drawCannon(ctx, piece, selected, capture?.pieceId === piece.id ? capture : null, pieceAssets, showPreview);
  }
}

// --- depth cues -------------------------------------------------------------

/** How far a piece reaches sideways on screen, used to size its own floor marks. */
function pieceScreenHalfWidth(piece) {
  if (!isPadPiece(piece)) return worldToScreenLength(CANNON_RING_RADIUS, piece.z);
  const hull = boardProjectedGeometry(piece).hull;
  const span = Math.max(...hull.map((point) => point.x)) - Math.min(...hull.map((point) => point.x));
  return Math.max(10, span / 2);
}

/**
 * How high off the floor a piece's own body hangs.
 *
 * A pad's lowest corner rather than its centre, so a big pad resting near the
 * ground casts a tight contact shadow instead of a raised one. A cannon stands
 * on the floor by construction, so it is always zero.
 */
function pieceFootHeight(piece) {
  if (!isPadPiece(piece)) return 0;
  return Math.max(0, piece.y - piece.length / 2);
}

/**
 * The shadow a piece casts on the floor beneath it.
 *
 * THIS IS THE PRIMARY ANSWER TO "HOW FAR AWAY IS THAT?". A tool drawn smaller
 * and higher up the canvas is exactly as consistent with being further away as
 * with being raised, and those two are the whole vocabulary of this editor. The
 * shadow stays on the floor at the piece's own depth and only the GAP between
 * the two grows with height. Same trick, same reason, as `drawBallShadow` and
 * `drawBinShadow` — and unlike the build-mode floor ring, this one is on during
 * a live shot too, because it is scene lighting rather than editor chrome.
 */
function drawPieceShadow(ctx, piece) {
  const height = pieceFootHeight(piece);
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  const width = Math.max(9, pieceScreenHalfWidth(piece) * (1 + Math.min(0.75, height * 0.42)) * 0.82);

  ctx.save();
  ctx.globalAlpha = Math.max(0.09, 0.42 - height * 0.18);
  ctx.filter = `blur(${Math.min(17, 3.5 + height * 6)}px)`;
  ctx.fillStyle = "#150c08";
  ctx.beginPath();
  ctx.ellipse(
    floor.x + Math.min(20, height * 9),
    floor.y + Math.min(15, 4 + height * 6),
    width,
    Math.max(4, width * 0.28),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

/**
 * The floor mark under a piece while the layout is being built: a ring at the
 * piece's own depth, tethered up to the piece itself.
 *
 * The shadow says the same thing softly; this says it in a straight line, and
 * only while someone is actually arranging. Lifted wholesale from HORSE's
 * `drawPlacementFloorMark`, which exists for exactly this ambiguity.
 */
function drawPieceFloorMark(ctx, piece, selected) {
  const palette = paletteFor(piece, selected);
  const color = piece.type === CANNON_PIECE && !selected ? [255, 93, 221] : palette.accent;
  const floor = projectPoint({ x: piece.x, y: 0.004, z: piece.z });
  const body = projectPoint({ x: piece.x, y: piece.y, z: piece.z });
  const radius = pieceScreenHalfWidth(piece) * 0.78;

  ctx.save();
  ctx.strokeStyle = rgb(color, selected ? 0.9 : 0.42);
  ctx.lineWidth = selected ? 2.5 : 1.5;
  if (selected) {
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.ellipse(floor.x, floor.y, radius, Math.max(3.5, radius * 0.3), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (Math.abs(body.y - floor.y) > 6) {
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(floor.x, floor.y);
    ctx.lineTo(body.x, body.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A few ruled floor lines while building.
 *
 * The room's own perspective is the only thing that says how deep the floor is,
 * and a painted backdrop with a rug on it does not always say it clearly. Four
 * ruled depths give the eye something to measure a footprint ring against —
 * which is the other half of the depth answer, the first being the shadow.
 *
 * It replaced a filled cyan trapezoid captioned NEAR / MID / HOOP. That was a
 * hint that helped once and then sat on the floor forever, covering the part of
 * the room the tools stand on.
 */
function drawBuildFloorGrid(ctx) {
  const half = 0.62;
  ctx.save();
  ctx.lineWidth = 1;
  for (const z of [0.2, 0.4, 0.6, 0.8]) {
    const left = projectPoint({ x: -half, y: 0.002, z });
    const right = projectPoint({ x: half, y: 0.002, z });
    ctx.strokeStyle = `rgba(62,244,255,${(0.13 - z * 0.07).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(62,244,255,.07)";
  for (const x of [-half, -half / 2, 0, half / 2, half]) {
    const near = projectPoint({ x, y: 0.002, z: 0.14 });
    const far = projectPoint({ x, y: 0.002, z: 0.88 });
    ctx.beginPath();
    ctx.moveTo(near.x, near.y);
    ctx.lineTo(far.x, far.y);
    ctx.stroke();
  }
  ctx.restore();
}

// --- editor handles ---------------------------------------------------------

/** Screen-space editor controls derived from the piece's projected geometry. */
export function pieceControlLayout(piece) {
  const centre = projectPoint({
    x: piece.x,
    y: piece.y + (piece.type === CANNON_PIECE ? CANNON_MOUTH_HEIGHT : 0),
    z: piece.z,
  });
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  let right = centre.x + 34;
  let top = centre.y - 34;
  if (isPadPiece(piece)) {
    const hull = boardProjectedGeometry(piece).hull;
    right = Math.max(...hull.map((point) => point.x)) + 22;
    top = Math.min(...hull.map((point) => point.y)) - 24;
  }
  return {
    delete: { x: right, y: top },
    depth: { x: floor.x, y: floor.y + 24 },
    centre,
    floor,
  };
}

/** Hit a selected piece's explicit controls before its body. */
export function sandboxPieceControlAtPoint(pieces, point, selectedId) {
  const piece = pieces.find((candidate) => candidate.id === selectedId);
  if (!piece) return null;
  const controls = pieceControlLayout(piece);
  if (Math.hypot(point.x - controls.delete.x, point.y - controls.delete.y) <= DELETE_HANDLE_RADIUS + 5) {
    return { piece, action: "delete" };
  }
  if (Math.hypot(point.x - controls.depth.x, point.y - controls.depth.y) <= DEPTH_HANDLE_RADIUS + 6) {
    return { piece, action: "depth" };
  }
  return null;
}

function drawPieceControls(ctx, piece) {
  const controls = pieceControlLayout(piece);
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = "rgba(216,255,77,.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(controls.floor.x, controls.floor.y);
  ctx.lineTo(controls.depth.x, controls.depth.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.translate(controls.depth.x, controls.depth.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#d8ff4d";
  ctx.strokeStyle = "#081018";
  ctx.lineWidth = 3;
  ctx.fillRect(-11, -11, 22, 22);
  ctx.strokeRect(-11, -11, 22, 22);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#081018";
  ctx.font = "900 9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Z", 0, 3);
  ctx.restore();

  ctx.save();
  ctx.translate(controls.delete.x, controls.delete.y);
  ctx.fillStyle = "#ff5068";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, DELETE_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "900 20px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("×", 0, -1);
  ctx.restore();
}

// --- hit testing ------------------------------------------------------------

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Nearest visible piece at a canvas point; used by the editor, not the sim.
 *
 * A pad turned near edge-on is a narrow silhouette, which is a target no thumb
 * can find, so a too-narrow hull falls back to a minimum grab column. That is
 * the one place the editor is deliberately more generous than the picture —
 * picking a tool up is not a shot, and nothing about the collider moves.
 */
export function sandboxPieceAtPoint(pieces, point) {
  for (const piece of [...pieces].sort((a, b) => a.z - b.z)) {
    if (isPadPiece(piece)) {
      const hull = boardProjectedGeometry(piece).hull;
      if (pointInPolygon(point, hull)) return piece;
      const xs = hull.map((corner) => corner.x);
      const ys = hull.map((corner) => corner.y);
      const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
      if (Math.max(...xs) - Math.min(...xs) < 26
        && Math.abs(point.x - centreX) <= 13
        && point.y >= Math.min(...ys)
        && point.y <= Math.max(...ys)) {
        return piece;
      }
    } else {
      const centre = projectPoint({ x: piece.x, y: piece.y + CANNON_MOUTH_HEIGHT, z: piece.z });
      if (Math.hypot(point.x - centre.x, point.y - centre.y) <= Math.max(22, 34 * depthScaleAt(piece.z))) return piece;
    }
  }
  return null;
}

/**
 * Is this canvas point on the target's own body?
 *
 * Only a bin can answer yes. The wall hoop is bolted to the wall at a fixed
 * height and has nothing to drag — its motion is the only thing about it the
 * player chooses, and that is a picker, not a gesture.
 */
/**
 * The bin's own depth handle: the diamond on the floor beneath it.
 *
 * The SAME control the pieces carry, at the same offset below the same floor
 * point, because it answers the same question — up the screen is both higher and
 * further away, so height and depth cannot share one drag. A bin is placed with
 * the editor's existing vocabulary rather than with a second one of its own.
 */
export function binDepthHandle(target) {
  if (target?.kind !== BIN_TARGET || !target.bin) return null;
  const floor = projectPoint({ x: target.bin.x, y: 0, z: target.bin.z });
  return { x: floor.x, y: floor.y + 24, floor };
}

export function binDepthHandleAt(target, point) {
  const handle = binDepthHandle(target);
  if (!handle) return false;
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= DEPTH_HANDLE_RADIUS + 6;
}

/** The build-mode floor ring, tether and depth handle for a placed bin. */
function drawBinPlacementMarks(ctx, target) {
  const handle = binDepthHandle(target);
  if (!handle) return;
  const bin = target.bin;
  const mouth = binMouthEllipse(bin);
  const raised = (bin.baseY ?? 0) > 0.02;

  ctx.save();
  ctx.strokeStyle = "rgba(255,45,225,.75)";
  ctx.shadowColor = "#ff2ddd";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(handle.floor.x, handle.floor.y, mouth.radiusX * 0.92, Math.max(4, mouth.radiusX * 0.3), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (raised) {
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handle.floor.x, handle.floor.y);
    ctx.lineTo(mouth.cx, mouth.cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.translate(handle.x, handle.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#ff4ddb";
  ctx.strokeStyle = "#081018";
  ctx.lineWidth = 3;
  ctx.fillRect(-11, -11, 22, 22);
  ctx.strokeRect(-11, -11, 22, 22);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#081018";
  ctx.font = "900 9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Z", 0, 3);
  ctx.restore();
}

export function trickShotTargetAtPoint(target, point) {
  if (target?.kind !== BIN_TARGET || !target.bin) return false;
  const mouth = binMouthEllipse(target.bin);
  const foot = projectPoint({ x: target.bin.x, y: target.bin.baseY ?? 0, z: target.bin.z });
  if (Math.abs(point.x - mouth.cx) > Math.max(18, mouth.radiusX)) return false;
  return point.y >= mouth.cy - mouth.radiusY - 8 && point.y <= foot.y + 10;
}

// --- entities ---------------------------------------------------------------

function drawBallEntity(ctx, view) {
  const { ball, ballFrames, ballId, pull } = view;
  if (ball.splat) return;
  const screen = projectPoint(ball);
  const radius = ballScreenRadius(ball.z);
  drawBall(ctx, {
    frames: ballFrames,
    ballId,
    x: pull ? pull.visualX : screen.x,
    y: pull ? pull.visualY : screen.y,
    radius: pull ? radius * (1 + pull.power * 0.075) : radius,
    rollPhase: ball.rollPhase,
    filter: depthGradeFilter(ball.z),
  });
}

/** A ball the bin already has: clipped to the mouth, so it visibly sinks away. */
function drawSinkingBall(ctx, view, bin) {
  const mouth = binMouthEllipse(bin);
  const screen = projectPoint(view.ball);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(mouth.cx, mouth.cy, mouth.radiusX, mouth.radiusY, 0, 0, Math.PI * 2);
  ctx.clip();
  drawBall(ctx, {
    frames: view.ballFrames,
    ballId: view.ballId,
    x: screen.x,
    y: screen.y,
    radius: ballScreenRadius(view.ball.z),
    rollPhase: view.ball.rollPhase,
    filter: `${depthGradeFilter(bin.z)} brightness(0.62)`,
  });
  ctx.restore();
}

function drawTrickShotImpacts(ctx, field) {
  if (!field) return;
  for (const burst of field.bursts) {
    const progress = trickShotImpactProgress(burst);
    const springboard = burst.kind === SPRING_PIECE;
    const radius = (0.035 + progress * 0.17) * (0.72 + burst.strength * 0.5);
    const points = [];
    for (let index = 0; index <= 28; index++) {
      const angle = (index / 28) * Math.PI * 2;
      points.push(projectPoint({
        x: burst.x + burst.right.x * Math.cos(angle) * radius + burst.up.x * Math.sin(angle) * radius,
        y: burst.y + burst.right.y * Math.cos(angle) * radius + burst.up.y * Math.sin(angle) * radius,
        z: burst.z + burst.right.z * Math.cos(angle) * radius + burst.up.z * Math.sin(angle) * radius,
      }));
    }
    const centre = projectPoint(burst);
    const normalEnd = projectPoint({
      x: burst.x + burst.normal.x * (0.08 + progress * 0.14),
      y: burst.y + burst.normal.y * (0.08 + progress * 0.14),
      z: burst.z + burst.normal.z * (0.08 + progress * 0.14),
    });
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.shadowColor = springboard ? "#ffef57" : "#65f8ff";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = springboard ? "#fff36a" : "#b9fdff";
    ctx.lineWidth = springboard ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();

    // A spring hit gets a force streak along the actual collision normal; a
    // rebound pad gets a shorter flash at the same exact contact point.
    ctx.lineWidth = springboard ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(centre.x, centre.y);
    ctx.lineTo(normalEnd.x, normalEnd.y);
    ctx.stroke();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 4 + burst.strength * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw one editor/play frame, with every object in the room in ONE far-to-near
 * pass so a pad in front of the ball is in front of the ball.
 *
 * `target` is the resolved snapshot from `sim/trick-shot-target.js` — a hoop or
 * a bin, never both. The bin joins the depth list as TWO entities split at its
 * own mouth radius, which is the same near/far trick the hoop's rim and net
 * already use: the drum's body is a mouth-radius further from the camera than
 * its near lip, so a ball dropping in sorts naturally between them and passes
 * behind the lip rather than skating across it.
 */
export function renderTrickShotFrame(ctx, view) {
  const {
    ball, target, backdrop, locationId, pieces, selectedId, capture, pull, trajectory,
    scored, pieceAssets = {}, splats, splatImagesFor, impacts, binImage,
    building = true, capturedBin = null,
  } = view;
  const hoop = target?.hoop || null;
  const bin = target?.bin || null;
  const captured = capturedBin !== null && capturedBin !== undefined;

  clearScene(ctx);
  drawRoom(ctx, backdrop, locationId);
  if (splats) drawSplatDecals(ctx, splats, { imagesFor: splatImagesFor });
  if (building) drawBuildFloorGrid(ctx);

  // Ground contact, before anything stands on it.
  for (const piece of pieces) drawPieceShadow(ctx, piece);
  if (bin) drawBinShadow(ctx, bin);
  if (building) for (const piece of pieces) drawPieceFloorMark(ctx, piece, piece.id === selectedId);
  if (!ball.splat && !captured) {
    drawWallShadow(ctx, ball);
    drawBallShadow(ctx, ball);
  }

  if (hoop) {
    drawBackboard(ctx, hoop);
    drawNet(ctx, hoop, true, 0);
    drawRim(ctx, hoop, true, 0);
  }
  drawRoomOccluders(ctx, backdrop, locationId, BOARD_Z);

  const entities = pieces.map((piece) => ({
    z: piece.z,
    priority: 0,
    draw: () => drawSandboxPiece(ctx, piece, {
      selected: piece.id === selectedId,
      capture,
      pieceAssets,
      showPreview: building,
      predictedContact: building ? trajectoryPadContact(trajectory ? [ball, ...trajectory] : null, piece) : null,
    }),
  }));

  if (!captured) {
    entities.push({ z: pull ? 0 : ball.z, priority: 1, draw: () => drawBallEntity(ctx, view) });
  }

  if (hoop) {
    entities.push({
      z: RIM_CENTER_Z,
      priority: 2,
      draw: () => {
        drawNet(ctx, hoop, false, scored ? 0.18 : 0);
        drawRim(ctx, hoop, false, 0);
      },
    });
  }

  if (bin) {
    entities.push({
      z: bin.z,
      priority: 0,
      draw: () => {
        drawBinBody(ctx, bin, binImage);
        if (captured) drawSinkingBall(ctx, view, bin);
      },
    });
    entities.push({ z: bin.z - bin.mouthRadius, priority: 2, draw: () => drawBinLip(ctx, bin, binImage) });
  }

  entities.sort((a, b) => b.z - a.z || a.priority - b.priority);
  for (const entity of entities) {
    entity.draw();
    drawRoomOccluders(ctx, backdrop, locationId, entity.z);
  }

  // Transient contact feedback is UI-like information: it remains readable on
  // top of both participants even when the ball and pad overlap at the hit.
  if (splats) drawSplatParticles(ctx, splats);
  drawTrickShotImpacts(ctx, impacts);

  if (building) {
    if (bin && !pull) drawBinPlacementMarks(ctx, target);
    const selected = pieces.find((piece) => piece.id === selectedId);
    if (selected && !pull) drawPieceControls(ctx, selected);
  }

  if (pull) drawAim(ctx, { pull, trajectory });
}
