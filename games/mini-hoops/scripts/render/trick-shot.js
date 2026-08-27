// Perspective-matched procedural art for reusable sandbox pieces, plus the
// Trick Shot Lab frame composition. The neon is drawn from world-space records
// through the cabinet's one camera; there are no separately eyeballed sprites
// to drift away from their colliders.

import { BALL_RADIUS_WORLD, BOARD_Z, GRAVITY, RIM_CENTER_Z } from "../sim/constants.js";
import { BOARD_PIECE, CANNON_PIECE, cannonDirection } from "../sim/trick-shot.js";
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

const BOARD_THICKNESS_SCREEN = 10;
const CANNON_RING_RADIUS = 0.135;

function boardEndpoints(piece) {
  const half = piece.length / 2;
  const dx = Math.cos(piece.angle) * half;
  const dy = Math.sin(piece.angle) * half;
  return [
    projectPoint({ x: piece.x - dx, y: piece.y - dy, z: piece.z }),
    projectPoint({ x: piece.x + dx, y: piece.y + dy, z: piece.z }),
  ];
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

function drawBoard(ctx, piece, selected) {
  const [a, b] = boardEndpoints(piece);
  const width = Math.max(5, BOARD_THICKNESS_SCREEN * depthScaleAt(piece.z));
  strokeGlow(ctx, selected ? "#d8ff4d" : "#3ef4ff", width, () => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }, selected);

  // End caps make the art read as a finite bumper, exactly where the capsule
  // collider ends, instead of as a glowing guide line.
  ctx.save();
  ctx.fillStyle = selected ? "#f5ffba" : "#bafcff";
  for (const end of [a, b]) {
    ctx.beginPath();
    ctx.arc(end.x, end.y, Math.max(3, width * 0.43), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

function drawCannon(ctx, piece, selected, capture) {
  const mouth = projectPoint({ x: piece.x, y: piece.y + 0.08, z: piece.z });
  const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
  const direction = cannonDirection(piece);
  const muzzle = projectPoint({
    x: piece.x + direction.x * 0.2,
    y: piece.y + 0.08 + direction.y * 0.2,
    z: piece.z + direction.z * 0.2,
  });
  const color = selected ? "#d8ff4d" : "#ff4ddb";

  strokeGlow(ctx, color, Math.max(7, 12 * depthScaleAt(piece.z)), () => {
    ctx.beginPath();
    ctx.moveTo(floor.x, floor.y);
    ctx.lineTo(mouth.x, mouth.y);
    ctx.lineTo(muzzle.x, muzzle.y);
  }, selected);

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

export function drawSandboxPiece(ctx, piece, { selected = false, capture = null } = {}) {
  if (piece.type === BOARD_PIECE) drawBoard(ctx, piece, selected);
  else if (piece.type === CANNON_PIECE) drawCannon(ctx, piece, selected, capture?.pieceId === piece.id ? capture : null);
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const amount = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(point.x - (a.x + dx * amount), point.y - (a.y + dy * amount));
}

/** Nearest visible piece at a canvas point; used by the editor, not the sim. */
export function sandboxPieceAtPoint(pieces, point) {
  for (const piece of [...pieces].sort((a, b) => a.z - b.z)) {
    if (piece.type === BOARD_PIECE) {
      const [a, b] = boardEndpoints(piece);
      if (pointSegmentDistance(point, a, b) <= 20) return piece;
    } else {
      const centre = projectPoint({ x: piece.x, y: piece.y + 0.08, z: piece.z });
      if (Math.hypot(point.x - centre.x, point.y - centre.y) <= Math.max(22, 34 * depthScaleAt(piece.z))) return piece;
    }
  }
  return null;
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

/** Draw one editor/play frame with sandbox pieces sorted in the same world depth as the ball. */
export function renderTrickShotFrame(ctx, view) {
  const { ball, hoop, backdrop, locationId, pieces, selectedId, capture, pull, trajectory, scored } = view;
  clearScene(ctx);
  drawRoom(ctx, backdrop, locationId);
  if (!ball.splat) {
    drawWallShadow(ctx, ball);
    drawBallShadow(ctx, ball);
  }
  drawRoomOccluders(ctx, backdrop, locationId, BOARD_Z);
  drawBackboard(ctx, hoop);
  drawNet(ctx, hoop, true, 0);
  drawRim(ctx, hoop, true, 0);

  const entities = pieces.map((piece) => ({ z: piece.z, draw: () => drawSandboxPiece(ctx, piece, { selected: piece.id === selectedId, capture }) }));
  entities.push({ z: pull ? 0 : ball.z, draw: () => drawBallEntity(ctx, view) });
  entities.push({ z: RIM_CENTER_Z, draw: () => { drawNet(ctx, hoop, false, scored ? 0.18 : 0); drawRim(ctx, hoop, false, 0); } });
  entities.sort((a, b) => b.z - a.z);
  for (const entity of entities) entity.draw();

  if (pull) drawAim(ctx, { pull, trajectory });
  const nearestDepth = Math.min(ball.z, ...pieces.map((piece) => piece.z), BOARD_Z);
  drawRoomOccluders(ctx, backdrop, locationId, nearestDepth);
}

