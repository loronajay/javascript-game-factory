// Standalone composition root for the first playable floor Tic-Tac-Toe mode.

import { createAssetLibrary } from "./assets/loader.js";
import { ballFlight } from "./assets/ball-catalog.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, PROJECTION_Y_SCALE, REFERENCE_POWER, TICK_SECONDS } from "./sim/constants.js";
import { createBinTargets, stepBallAgainstBins } from "./sim/bin-physics.js";
import { createBall, isBallSettled, launchBall, resetBall } from "./sim/physics.js";
import { launchSpin, solveLaunch } from "./sim/launch.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { ballScreenRadius, depthScaleAt, projectPoint, worldToScreenLength } from "./sim/projection.js";
import {
  DIFFICULTIES,
  chooseCpuCell,
  cpuMakesShot,
  createTicTacToeMatch,
  isHumanControlledTurn,
  markForCell,
  playerLabel,
  resolveAttempt,
} from "./sim/tic-tac-toe.js";
import { drawBall } from "./render/ball.js";
import { clearScene, depthGradeFilter, drawBallShadow, drawRoom, prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";
const X_PATH = "assets/modes/floor-tic-tac-toe/neon-x.png";
const O_PATH = "assets/modes/floor-tic-tac-toe/neon-o.png";
const BALL_ID = "basketball";
const BIN_VISIBLE_HEIGHT_RATIO = 1244 / 1326;
const BIN_FOOT_Y_RATIO = 1288 / 1326;
const BIN_ENTRY_VELOCITY = -4;

export function capturedBinForDraw(flight) {
  return Number.isInteger(flight?.capturedBin) ? flight.capturedBin : null;
}

export function bootTicTacToe(root, { random = Math.random } = {}) {
  const canvas = root.querySelector("#stageCourt");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  const assets = createAssetLibrary({ onLoad: () => draw() });
  const art = {
    room: assets.backdrop("warehouse"),
    bin: assets.image(BIN_PATH),
    x: assets.image(X_PATH),
    o: assets.image(O_PATH),
    ballFrames: assets.ballFrames(BALL_ID),
  };
  const bins = createBinTargets();
  const ball = createBall();
  const scoredAt = new Map();

  let mode = "cpu";
  let difficulty = "medium";
  let match;
  let selected = null;
  let pull = null;
  let pointerId = null;
  let grabOffset = { x: 0, y: 0 };
  let flight = null;
  let cpuDelay = 0;
  let elapsed = 0;
  let accumulator = 0;
  let previousFrame = performance.now();

  const status = root.querySelector("#tttStatus");
  const assignment = root.querySelector("#tttAssignment");
  const meter = root.querySelector("#tttMeterFill");
  const readout = root.querySelector("#tttMeterReadout");
  const difficultyControls = root.querySelector("#difficultyControls");
  const difficultySelect = root.querySelector("#difficulty");

  root.querySelector("#opponent")?.addEventListener("change", (event) => {
    mode = event.target.value === "local" ? "local" : "cpu";
    newMatch();
  });

  difficultySelect?.addEventListener("change", (event) => {
    difficulty = event.target.value;
    newMatch();
  });
  root.querySelector("#newMatch")?.addEventListener("click", newMatch);

  canvas.addEventListener("pointerdown", (event) => {
    if (!canHumanAct()) return;
    const point = canvasPoint(canvas, event);
    const screenBall = screenBallPosition();
    if (selected !== null && isGrab(point, screenBall)) {
      pointerId = event.pointerId;
      grabOffset = { x: point.x - screenBall.x, y: point.y - screenBall.y };
      pull = neutralPull(screenBall);
      canvas.setPointerCapture?.(pointerId);
      event.preventDefault();
      return;
    }
    const target = closestOpenBin(point);
    if (target !== null) {
      selected = target;
      setStatus(`Cell ${target + 1} selected · pull the ball to shoot`);
      draw();
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pull || event.pointerId !== pointerId) return;
    const point = canvasPoint(canvas, event);
    pull = resolvePull({ x: pull.anchorX, y: pull.anchorY }, { x: point.x - grabOffset.x, y: point.y - grabOffset.y });
    setPower(pull.power);
    event.preventDefault();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pull || event.pointerId !== pointerId) return;
    const point = canvasPoint(canvas, event);
    pull = resolvePull({ x: pull.anchorX, y: pull.anchorY }, { x: point.x - grabOffset.x, y: point.y - grabOffset.y });
    const released = pull;
    pull = null;
    pointerId = null;
    if (isShootablePull(released)) launchAt(selected, released.power, released.aimX);
    else setPower(0);
    event.preventDefault();
  });
  canvas.addEventListener("pointercancel", () => { pull = null; pointerId = null; setPower(0); });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function newMatch() {
    match = createTicTacToeMatch({
      mode,
      humanMark: mode === "cpu" ? (random() < 0.5 ? "x" : "o") : "x",
      difficulty,
    });
    scoredAt.clear();
    selected = null;
    pull = null;
    flight = null;
    cpuDelay = mode === "cpu" ? 0.75 : 0;
    resetBall(ball);
    setPower(0);
    if (difficultyControls) difficultyControls.hidden = mode !== "cpu";
    if (difficultySelect) difficultySelect.disabled = mode !== "cpu";
    assignment.textContent = mode === "local"
      ? "PLAYER 1: X · PLAYER 2: O"
      : `YOU: ${match.humanMark.toUpperCase()} · CPU: ${match.cpuMark.toUpperCase()}`;
    syncTurnStatus();
    draw();
  }

  function canHumanAct() {
    return isHumanControlledTurn(match) && !flight;
  }

  function launchAt(cell, power, aimX = 480) {
    if (cell === null || match.board[cell] || flight) return;
    const bin = bins[cell];
    // Pull angle supplies fine left/right placement inside the selected mouth.
    const offset = Math.max(-0.052, Math.min(0.052, ((aimX - 480) / 160) * 0.052));
    const target = projectPoint({ x: bin.x + offset, y: bin.topY, z: bin.z });
    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: target,
      targetZ: bin.z,
      power,
      loft: 1,
      entryVelocity: BIN_ENTRY_VELOCITY,
      weight: ballFlight(BALL_ID).weight,
    });
    launchBall(ball, launch, launchSpin(launch));
    flight = { selected: cell, age: 0, resolved: false, resetIn: null, capturedBin: null };
    selected = null;
    setPower(power);
    setStatus(`${playerLabel(match)} (${match.turn.toUpperCase()}) shoots…`);
  }

  function startCpuShot() {
    const cell = chooseCpuCell(match.board, match.cpuMark, match.difficulty, random);
    if (cell === null) return;
    const made = cpuMakesShot(match.difficulty, random);
    // CPU misses are still physical shots: under-pulled on easy/medium, or a
    // narrow lip graze on hard. No outcome is injected into the match rules.
    const power = made ? REFERENCE_POWER : (match.difficulty === "hard" ? 0.86 : 0.65);
    const aimX = made ? 480 : 615;
    launchAt(cell, power, aimX);
  }

  function tick() {
    elapsed += TICK_SECONDS;
    if (flight) tickFlight();
    else if (match.mode === "cpu" && match.status === "playing" && match.turn === match.cpuMark) {
      cpuDelay -= TICK_SECONDS;
      if (cpuDelay <= 0) startCpuShot();
    }
  }

  function tickFlight() {
    flight.age += TICK_SECONDS;
    if (!flight.resolved) {
      const activeBins = bins.filter((bin) => !match.board[bin.index]);
      const result = stepBallAgainstBins(ball, activeBins, TICK_SECONDS, {
        ballId: BALL_ID,
        capturedBin: flight.capturedBin,
      });
      if (result.capturedBin !== null) flight.capturedBin = result.capturedBin;
      if (result.scoredBin !== null && !match.board[result.scoredBin]) {
        resolveAttempt(match, result.scoredBin, true);
        scoredAt.set(result.scoredBin, elapsed);
        flight.resolved = true;
        flight.resetIn = 1.05;
        setStatus(`${match.board[result.scoredBin].toUpperCase()} scores!`);
      } else if (flight.age > 3.15 || (flight.age > 0.45 && isBallSettled(ball))) {
        resolveAttempt(match, flight.selected, false);
        flight.resolved = true;
        flight.resetIn = 0.45;
        setStatus("Miss · turn changes");
      }
    } else {
      // Keep the scored ball visibly falling inside the can during its one-second
      // replacement beat; misses simply rest where physics left them.
      if (flight.capturedBin !== null) {
        stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: BALL_ID, capturedBin: flight.capturedBin });
      }
      flight.resetIn -= TICK_SECONDS;
      if (flight.resetIn <= 0) {
        resetBall(ball);
        flight = null;
        setPower(0);
        cpuDelay = 0.7;
        syncTurnStatus();
      }
    }
  }

  function syncTurnStatus() {
    if (match.status === "won" && match.mode === "local") setStatus(`${playerLabel(match, match.winner).toUpperCase()} WINS!`);
    else if (match.status === "won") setStatus(match.winner === match.humanMark ? "YOU WIN!" : "CPU WINS");
    else if (match.status === "draw") setStatus("DRAW GAME");
    else if (match.mode === "local") setStatus(`${playerLabel(match)} (${match.turn.toUpperCase()}) turn · tap an open bin`);
    else if (match.turn === match.humanMark) setStatus("Your turn · tap an open bin");
    else setStatus("CPU is choosing a shot…");
  }

  function closestOpenBin(point) {
    let best = null;
    let distance = Infinity;
    for (const bin of bins) {
      if (match.board[bin.index]) continue;
      const screen = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
      const d = Math.hypot(point.x - screen.x, point.y - screen.y);
      const radius = worldToScreenLength(0.24, bin.z);
      if (d < radius && d < distance) { best = bin.index; distance = d; }
    }
    return best;
  }

  function setPower(power) {
    const value = Math.round(power * 100);
    if (meter) meter.style.width = `${value}%`;
    if (readout) readout.textContent = `${value}%`;
  }
  function setStatus(text) { if (status) status.textContent = text; }
  function screenBallPosition() {
    const screen = projectPoint(ball);
    return { x: screen.x, y: screen.y, radius: ballScreenRadius(ball.z) };
  }

  function draw() {
    if (!match) return;
    clearScene(ctx);
    drawRoom(ctx, art.room, "warehouse");
    drawGrid(ctx);

    const occupants = [];
    for (const bin of bins) {
      const mark = markForCell(match.board, scoredAt, bin.index, elapsed);
      if (mark) occupants.push({ type: "mark", z: bin.z, bin, mark });
      else occupants.push({ type: "bin", z: bin.z, bin });
    }
    if (!ball.splat) occupants.push({ type: "ball", z: ball.z });
    occupants.sort((a, b) => b.z - a.z);

    drawBallShadow(ctx, ball);
    for (const occupant of occupants) {
      if (occupant.type === "bin") drawBin(ctx, occupant.bin, art.bin);
      else if (occupant.type === "mark") drawMark(ctx, occupant.bin, art[occupant.mark]);
      else drawBall(ctx, {
        frames: art.ballFrames,
        ballId: BALL_ID,
        ...screenBallPosition(),
        rollPhase: ball.rollPhase,
        filter: depthGradeFilter(ball.z),
      });
    }
    if (selected !== null) drawSelection(ctx, bins[selected]);
    const capturedBin = capturedBinForDraw(flight);
    if (capturedBin !== null) drawBinFront(ctx, bins[capturedBin], art.bin);
  }

  function frame(now) {
    accumulator += Math.min(100, now - previousFrame) / 1000;
    previousFrame = now;
    while (accumulator >= TICK_SECONDS) { tick(); accumulator -= TICK_SECONDS; }
    draw();
    requestAnimationFrame(frame);
  }

  newMatch();
  requestAnimationFrame(frame);
  return { get match() { return match; }, bins, ball, newMatch, draw };
}

function drawGrid(ctx) {
  const xEdges = [-0.75, -0.25, 0.25, 0.75];
  const zEdges = [0.195, 0.465, 0.735, 1.005];
  ctx.save();
  ctx.strokeStyle = "rgba(255, 45, 225, .88)";
  ctx.shadowColor = "#ff2ddd";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  for (const x of xEdges) line(ctx, projectPoint({ x, y: 0.004, z: zEdges[0] }), projectPoint({ x, y: 0.004, z: zEdges[3] }));
  for (const z of zEdges) line(ctx, projectPoint({ x: xEdges[0], y: 0.004, z }), projectPoint({ x: xEdges[3], y: 0.004, z }));
  ctx.restore();
}

function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

function binRect(bin, image) {
  const visibleHeight = bin.topY * PROJECTION_Y_SCALE * depthScaleAt(bin.z);
  const height = visibleHeight / BIN_VISIBLE_HEIGHT_RATIO;
  const width = height * ((image.naturalWidth || 1060) / (image.naturalHeight || 1326));
  const foot = projectPoint({ x: bin.x, y: 0, z: bin.z });
  return { x: foot.x - width / 2, y: foot.y - height * BIN_FOOT_Y_RATIO, width, height };
}

function drawBin(ctx, bin, image) {
  const rect = binRect(bin, image);
  ctx.save(); ctx.filter = depthGradeFilter(bin.z);
  if (image.complete && image.naturalWidth) ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  else { ctx.fillStyle = "#111820"; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
  ctx.restore();
}

function drawBinFront(ctx, bin, image) {
  if (!image.complete || !image.naturalWidth) return;
  const rect = binRect(bin, image);
  const sourceY = image.naturalHeight * 0.145;
  const destY = rect.y + rect.height * 0.145;
  ctx.save(); ctx.filter = depthGradeFilter(bin.z);
  ctx.drawImage(image, 0, sourceY, image.naturalWidth, image.naturalHeight - sourceY, rect.x, destY, rect.width, rect.height * 0.855);
  ctx.restore();
}

function drawMark(ctx, bin, image) {
  const centre = projectPoint({ x: bin.x, y: 0.012, z: bin.z });
  const width = worldToScreenLength(0.38, bin.z);
  const height = width * ((image.naturalHeight || 1) / (image.naturalWidth || 1));
  ctx.save(); ctx.globalAlpha = 0.95; ctx.shadowColor = "#fff"; ctx.shadowBlur = 12;
  ctx.drawImage(image, centre.x - width / 2, centre.y - height / 2, width, height); ctx.restore();
}

function drawSelection(ctx, bin) {
  const centre = projectPoint({ x: bin.x, y: bin.topY + 0.008, z: bin.z });
  const rx = worldToScreenLength(bin.mouthRadius + 0.035, bin.z);
  ctx.save(); ctx.strokeStyle = "#53f6ff"; ctx.lineWidth = 5; ctx.shadowColor = "#53f6ff"; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(centre.x, centre.y, rx, rx * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
