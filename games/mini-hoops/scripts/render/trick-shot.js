// Perspective-matched procedural art for reusable sandbox pieces, plus the
// Trick Shot Lab frame composition. The neon is drawn from world-space records
// through the cabinet's one camera; there are no separately eyeballed sprites
// to drift away from their colliders.

import { BALL_RADIUS_WORLD, BOARD_Z, GRAVITY, RIM_CENTER_Z } from "../sim/constants.js";
import {
  BOARD_PAD_THICKNESS,
  BOARD_PIECE,
  CANNON_PIECE,
  SPRING_PIECE,
  boardFrame,
  cannonDirection,
  isPadPiece,
} from "../sim/trick-shot.js";
import { ballScreenRadius, depthScaleAt, projectPoint } from "../sim/projection.js";
import { drawAim } from "./aim.js";
import { drawBall } from "./ball.js";
import { drawBackboard, drawNet, drawRim } from "./hoop.js";
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
const DELETE_HANDLE_RADIUS = 17;
const DEPTH_HANDLE_RADIUS = 18;

const imageReady = (image) => image?.complete && image.naturalWidth;

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

/** Projected faces and silhouette of the exact square box used by collision. */
export function boardProjectedGeometry(piece) {
  const frame = boardFrame(piece);
  const half = piece.length / 2;
  const depth = BOARD_PAD_THICKNESS / 2;
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const worldFront = signs.map(([x, y]) => boardPoint(piece, frame, x * half, y * half, depth));
  const worldBack = signs.map(([x, y]) => boardPoint(piece, frame, x * half, y * half, -depth));
  const front = worldFront.map(projectPoint);
  const back = worldBack.map(projectPoint);
  const face = (kind, indices, source) => ({
    kind,
    world: indices.map((index) => source[index]),
    points: indices.map((index) => projectPoint(source[index])),
  });
  const faces = [
    face("impact", [0, 1, 2, 3], worldFront),
    face("impact", [3, 2, 1, 0], worldBack),
    ...[0, 1, 2, 3].map((index) => ({
      kind: "edge",
      world: [worldFront[index], worldFront[(index + 1) % 4], worldBack[(index + 1) % 4], worldBack[index]],
      points: [front[index], front[(index + 1) % 4], back[(index + 1) % 4], back[index]],
    })),
  ];
  return {
    front,
    back,
    faces,
    hull: convexHull([...front, ...back]),
    centre: projectPoint(piece),
  };
}

function polygonPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function insetPolygon(points, amount) {
  const centre = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  return points.map((point) => ({
    x: point.x + (centre.x - point.x) * amount,
    y: point.y + (centre.y - point.y) * amount,
  }));
}

function strokeGlow(ctx, color, width, drawPath, selected = false) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = selected ? 24 : 15;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = width + (selected ? 12 : 8);
  drawPath();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = selected ? 13 : 7;
  ctx.lineWidth = width;
  drawPath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,.88)";
  ctx.lineWidth = Math.max(1.5, width * 0.18);
  drawPath();
  ctx.stroke();
  ctx.restore();
}

function quadPoint(points, u, v) {
  const top = {
    x: points[0].x + (points[1].x - points[0].x) * u,
    y: points[0].y + (points[1].y - points[0].y) * u,
  };
  const bottom = {
    x: points[3].x + (points[2].x - points[3].x) * u,
    y: points[3].y + (points[2].y - points[3].y) * u,
  };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

function drawSquarePad(ctx, piece, selected) {
  const springboard = piece.type === SPRING_PIECE;
  const geometry = boardProjectedGeometry(piece);
  const orderedFaces = [...geometry.faces].sort((a, b) => {
    const depthA = a.world.reduce((sum, point) => sum + point.z, 0) / a.world.length;
    const depthB = b.world.reduce((sum, point) => sum + point.z, 0) / b.world.length;
    return depthB - depthA;
  });
  ctx.save();
  ctx.lineJoin = "round";
  ctx.shadowColor = selected ? "#d8ff4d" : springboard ? "#ff5a45" : "#3ef4ff";
  ctx.shadowBlur = selected ? 18 : 9;
  for (const face of orderedFaces) {
    polygonPath(ctx, face.points);
    ctx.fillStyle = face.kind === "impact"
      ? selected ? "rgba(52,71,55,.97)" : springboard ? "rgba(120,24,26,.97)" : "rgba(11,58,72,.96)"
      : selected ? "rgba(132,159,54,.98)" : springboard ? "rgba(58,14,20,.98)" : "rgba(10,28,42,.98)";
    ctx.fill();
    ctx.strokeStyle = face.kind === "impact"
      ? selected ? "#d8ff4d" : springboard ? "#ffe34f" : "#53f5ff"
      : "#0b111c";
    ctx.lineWidth = face.kind === "impact" ? 3 : 2;
    ctx.stroke();

    if (face.kind === "impact" && polygonArea(face.points) > 240) {
      const inner = insetPolygon(face.points, 0.2);
      polygonPath(ctx, inner);
      ctx.fillStyle = springboard ? "rgba(255,70,50,.72)" : "rgba(62,244,255,.10)";
      ctx.fill();
      ctx.strokeStyle = selected
        ? "rgba(216,255,77,.95)"
        : springboard ? "rgba(255,231,84,.96)" : "rgba(186,252,255,.86)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const centre = inner.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
      if (springboard) {
        ctx.beginPath();
        for (const [index, [u, v]] of [[0.18, 0.28], [0.82, 0.28], [0.18, 0.5], [0.82, 0.5], [0.18, 0.72], [0.82, 0.72]].entries()) {
          const point = quadPoint(inner, u, v);
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = selected ? "#d8ff4d" : "#fff36a";
        ctx.lineWidth = Math.max(3, 5 * depthScaleAt(piece.z));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      } else {
        ctx.fillStyle = selected ? "#d8ff4d" : "#f2ffff";
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, Math.max(3, 5 * depthScaleAt(piece.z)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (selected) {
    polygonPath(ctx, geometry.hull);
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = "#f3ffb5";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoard(ctx, piece, selected) {
  drawSquarePad(ctx, piece, selected);
}

function drawSpringboard(ctx, piece, selected) {
  drawSquarePad(ctx, piece, selected);
}

function ringPoints(piece, count = 30) {
  const points = [];
  for (let index = 0; index <= count; index++) {
    const angle = (Math.PI * 2 * index) / count;
    points.push(projectPoint({
      x: piece.x + Math.cos(angle) * CANNON_RING_RADIUS,
      y: piece.y + 0.08,
      z: piece.z + Math.sin(angle) * CANNON_RING_RADIUS,
    }));
  }
  return points;
}

function pathPoints(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function cannonTrajectory(piece) {
  const direction = cannonDirection(piece);
  const points = [];
  for (let t = 0.06; t <= 0.72; t += 0.055) {
    points.push(projectPoint({
      x: piece.x + direction.x * piece.speed * t,
      y: piece.y + 0.08 + direction.y * piece.speed * t - 0.5 * GRAVITY * t * t,
      z: piece.z + direction.z * piece.speed * t,
    }));
  }
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function drawCannon(ctx, piece, selected, capture, assets = {}) {
  const mouth = projectPoint({ x: piece.x, y: piece.y + 0.08, z: piece.z });
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  const direction = cannonDirection(piece);
  const muzzle = projectPoint({
    x: piece.x + direction.x * 0.2,
    y: piece.y + 0.08 + direction.y * 0.2,
    z: piece.z + direction.z * 0.2,
  });
  const color = selected ? "#d8ff4d" : "#ff4ddb";

  const scale = depthScaleAt(piece.z);
  if (imageReady(assets.cannonBase)) {
    const baseHeight = 178 * scale;
    const baseWidth = 136 * scale;
    ctx.save();
    ctx.shadowColor = selected ? "#d8ff4d" : "rgba(0,0,0,.75)";
    ctx.shadowBlur = selected ? 20 : 9;
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
  strokeGlow(ctx, capture ? "#fff36a" : color, Math.max(4, 7 * depthScaleAt(piece.z)), () => pathPoints(ctx, ring), selected);

  // The authored trajectory is a real ballistic preview from the cannon's yaw,
  // pitch, and speed. It is rendered whenever selected, so tuning a slider gives
  // immediate feedback in the same perspective as the room.
  if (selected) {
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
    ctx.arc(mouth.x, mouth.y, 17 * depthScaleAt(piece.z), -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawSandboxPiece(ctx, piece, { selected = false, capture = null, pieceAssets = {} } = {}) {
  if (piece.type === BOARD_PIECE) drawBoard(ctx, piece, selected);
  else if (piece.type === SPRING_PIECE) drawSpringboard(ctx, piece, selected);
  else if (piece.type === CANNON_PIECE) drawCannon(ctx, piece, selected, capture?.pieceId === piece.id ? capture : null, pieceAssets);
}

/** Screen-space editor controls derived from the piece's projected geometry. */
export function pieceControlLayout(piece) {
  const centre = projectPoint({ x: piece.x, y: piece.y + (piece.type === CANNON_PIECE ? 0.08 : 0), z: piece.z });
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
  ctx.strokeStyle = "rgba(216,255,77,.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(controls.centre.x, controls.centre.y);
  ctx.lineTo(controls.floor.x, controls.floor.y);
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

function drawPlacementLane(ctx) {
  const nearLeft = projectPoint({ x: -0.36, y: 0, z: 0.06 });
  const nearRight = projectPoint({ x: 0.36, y: 0, z: 0.06 });
  const farLeft = projectPoint({ x: -0.36, y: 0, z: 0.96 });
  const farRight = projectPoint({ x: 0.36, y: 0, z: 0.96 });
  ctx.save();
  ctx.fillStyle = "rgba(62,244,255,.045)";
  ctx.strokeStyle = "rgba(62,244,255,.24)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 9]);
  ctx.beginPath();
  ctx.moveTo(nearLeft.x, nearLeft.y);
  ctx.lineTo(farLeft.x, farLeft.y);
  ctx.lineTo(farRight.x, farRight.y);
  ctx.lineTo(nearRight.x, nearRight.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "800 11px system-ui";
  ctx.textAlign = "center";
  for (const [z, label] of [[0.12, "NEAR"], [0.5, "MID"], [0.9, "HOOP"]]) {
    const point = projectPoint({ x: 0, y: 0, z });
    ctx.fillStyle = "rgba(186,252,255,.72)";
    ctx.fillText(label, point.x, point.y + 16);
  }
  ctx.restore();
}

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

/** Nearest visible piece at a canvas point; used by the editor, not the sim. */
export function sandboxPieceAtPoint(pieces, point) {
  for (const piece of [...pieces].sort((a, b) => a.z - b.z)) {
    if (isPadPiece(piece)) {
      if (pointInPolygon(point, boardProjectedGeometry(piece).hull)) return piece;
    } else {
      const centre = projectPoint({ x: piece.x, y: piece.y + 0.08, z: piece.z });
      if (Math.hypot(point.x - centre.x, point.y - centre.y) <= Math.max(22, 34 * depthScaleAt(piece.z))) return piece;
    }
  }
  return null;
}

/**
 * Editor overlay that remains above room masks. The body still obeys honest
 * furniture occlusion; this floor tether is the always-visible answer to
 * “where in the room is that tool?” and prevents a launcher from disappearing.
 */
function drawPieceLocator(ctx, piece, selected = false) {
  const centre = projectPoint({ x: piece.x, y: piece.y + (piece.type === CANNON_PIECE ? 0.08 : 0), z: piece.z });
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  const color = selected ? "#d8ff4d" : piece.type === BOARD_PIECE ? "#53f5ff" : piece.type === SPRING_PIECE ? "#ffe34f" : "#ff5ddd";
  ctx.save();
  ctx.setLineDash(selected ? [] : [4, 6]);
  ctx.strokeStyle = "rgba(5,8,16,.9)";
  ctx.lineWidth = selected ? 6 : 4;
  ctx.beginPath();
  ctx.moveTo(centre.x, centre.y);
  ctx.lineTo(floor.x, floor.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(floor.x, floor.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#071019";
  ctx.lineWidth = 2;
  const size = selected ? 8 : 6;
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  ctx.restore();

  ctx.save();
  const label = piece.type === BOARD_PIECE ? "PAD" : piece.type === SPRING_PIECE ? "SPRING" : "LAUNCHER";
  const labelY = centre.y - (isPadPiece(piece) ? 18 : 42 * depthScaleAt(piece.z));
  ctx.font = "900 10px system-ui";
  const width = ctx.measureText(label).width + 14;
  ctx.fillStyle = "rgba(5,8,16,.9)";
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.fillRect(centre.x - width / 2, labelY - 10, width, 18);
  ctx.strokeRect(centre.x - width / 2, labelY - 10, width, 18);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centre.x, labelY - 1);
  ctx.restore();
}

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

/**
 * Tools are interactive editor objects, so keep their complete silhouettes above
 * the photographed furniture. Their own far-to-near order still communicates
 * depth when two tools overlap.
 */
function drawForegroundSandboxPieces(ctx, pieces, { selectedId, capture, pieceAssets }) {
  for (const piece of [...pieces].sort((a, b) => b.z - a.z)) {
    drawSandboxPiece(ctx, piece, { selected: piece.id === selectedId, capture, pieceAssets });
  }
}

/** Draw one editor/play frame with room objects depth-sorted behind the sandbox tools. */
export function renderTrickShotFrame(ctx, view) {
  const { ball, hoop, backdrop, locationId, pieces, selectedId, capture, pull, trajectory, scored, pieceAssets = {} } = view;
  clearScene(ctx);
  drawRoom(ctx, backdrop, locationId);
  drawPlacementLane(ctx);
  if (!ball.splat) {
    drawWallShadow(ctx, ball);
    drawBallShadow(ctx, ball);
  }
  drawBackboard(ctx, hoop);
  drawNet(ctx, hoop, true, 0);
  drawRim(ctx, hoop, true, 0);
  drawRoomOccluders(ctx, backdrop, locationId, BOARD_Z);

  const entities = [
    { z: pull ? 0 : ball.z, draw: () => drawBallEntity(ctx, view) },
    { z: RIM_CENTER_Z, draw: () => { drawNet(ctx, hoop, false, scored ? 0.18 : 0); drawRim(ctx, hoop, false, 0); } },
  ];
  entities.sort((a, b) => b.z - a.z);
  for (const entity of entities) {
    entity.draw();
    drawRoomOccluders(ctx, backdrop, locationId, entity.z);
  }

  // Pads and launchers must be readable and draggable wherever they are placed;
  // painting them here prevents a bed or desk mask from erasing their bodies.
  drawForegroundSandboxPieces(ctx, pieces, { selectedId, capture, pieceAssets });

  // Locators are editor chrome and share the tools' foreground layer.
  for (const piece of pieces) drawPieceLocator(ctx, piece, piece.id === selectedId);

  const selected = pieces.find((piece) => piece.id === selectedId);
  if (selected && !pull) drawPieceControls(ctx, selected);

  if (pull) drawAim(ctx, { pull, trajectory });
}
