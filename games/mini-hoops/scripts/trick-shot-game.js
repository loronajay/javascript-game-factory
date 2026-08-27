// Trick Shot Lab: composition root for a reusable sandbox editor.
//
// The lab owns a local named-layout bank. It does not own or serialize HORSE
// state. What HORSE can reuse later is below this file: sim/trick-shot.js,
// sim/trick-shot-physics.js, and render/trick-shot.js.

import { DEFAULT_BALL, ballFlight } from "./assets/ball-catalog.js";
import { DEFAULT_LOCATION } from "./assets/location-catalog.js";
import { createAssetLibrary } from "./assets/loader.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHYSICS_SUBSTEP_SECONDS,
  PULL_MIN,
  TICK_MS,
  TICK_SECONDS,
} from "./sim/constants.js";
import { hoopAt } from "./sim/hoop.js";
import { launchSpin, solveLaunch, trajectoryPoints } from "./sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "./sim/physics.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import {
  BOARD_PIECE,
  CANNON_PIECE,
  MAX_SANDBOX_PIECES,
  createSandboxPiece,
} from "./sim/trick-shot.js";
import {
  createTrickShotPhysics,
  resetTrickShotPhysics,
  stepTrickShotPieces,
} from "./sim/trick-shot-physics.js";
import { renderTrickShotFrame, sandboxPieceAtPoint } from "./render/trick-shot.js";
import { ballScreenPosition } from "./render/frame.js";
import { prepareContext } from "./render/scene.js";
import { projectPoint, screenToWorldAtZ } from "./sim/projection.js";
import { createTrickShotStore } from "./store/trick-shots-store.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import { createTrickShotView } from "./ui/trick-shot-view.js";

const SILENT_AUDIO = Object.freeze({ released() {}, contact() {}, scored() {}, click() {} });
const MAX_SHOT_SECONDS = 14;
const SETTLED_SECONDS = 0.8;
const MADE_HOLD_SECONDS = 1.05;

export function bootTrickShot(root, options = {}) {
  const canvas = root.querySelector("#trickShotCourt");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  const audio = options.audio || SILENT_AUDIO;
  const onLeave = options.onLeave || (() => {});
  const assets = options.assets || createAssetLibrary({ onLoad: () => draw() });
  const store = options.store || createTrickShotStore();
  const ball = createBall();
  const piecePhysics = createTrickShotPhysics();
  const hoop = hoopAt("still", 0);
  const world = worldFor(hoop);

  let active = false;
  let locationId = DEFAULT_LOCATION;
  let ballId = DEFAULT_BALL;
  let pieces = [];
  let selectedId = null;
  let currentId = "";
  let currentName = "Untitled Trick Shot";
  let pieceCounter = 0;
  let status = "BUILD MODE";
  let shotActive = false;
  let scored = false;
  let flightSeconds = 0;
  let settledSeconds = 0;
  let madeSeconds = 0;
  let pull = null;
  let pointerId = null;
  let pointerMode = null;
  let grabOffset = { x: 0, y: 0 };
  let dragOffset = { x: 0, y: 0 };
  let lastTime = null;
  let accumulator = 0;

  const view = createTrickShotView(root, {
    onExit: () => onLeave(),
    onAddBoard: () => addPiece(BOARD_PIECE),
    onAddCannon: () => addPiece(CANNON_PIECE),
    onResetBall: () => resetShot("BUILD MODE"),
    onDeletePiece: deleteSelected,
    onPieceChange: updateSelected,
    onSave: saveCurrent,
    onNew: newLayout,
    onLoad: loadLayout,
    onDeleteShot: deleteSaved,
  });

  function bank() {
    return store.list();
  }

  function renderView() {
    view.render({
      pieces,
      selectedId,
      bank: bank(),
      currentId,
      name: currentName,
      status,
      busy: shotActive,
    });
  }

  function uniquePieceId(type) {
    pieceCounter += 1;
    return `${type}-${Date.now().toString(36)}-${pieceCounter}`;
  }

  function addPiece(type) {
    if (shotActive || pieces.length >= MAX_SANDBOX_PIECES) return;
    const count = pieces.length;
    const piece = createSandboxPiece(type, {
      id: uniquePieceId(type),
      x: ((count % 5) - 2) * 0.12,
      y: type === CANNON_PIECE ? 0.3 : 0.65 + (count % 3) * 0.13,
      z: 0.32 + (count % 4) * 0.12,
      angle: type === BOARD_PIECE ? -0.18 + (count % 3) * 0.18 : undefined,
    });
    pieces = [...pieces, piece];
    selectedId = piece.id;
    status = type === BOARD_PIECE ? "BOARD ADDED" : "CANNON ADDED";
    renderView();
  }

  function replaceSelected(changes) {
    pieces = pieces.map((piece) => piece.id === selectedId
      ? createSandboxPiece(piece.type, { ...piece, ...changes }, piece.id)
      : piece);
  }

  function updateSelected(field, value) {
    if (shotActive || !selectedId) return;
    const piece = pieces.find((candidate) => candidate.id === selectedId);
    if (!piece) return;
    if (field === "depth") replaceSelected({ z: value / 100 });
    else if (field === "angle") replaceSelected(piece.type === BOARD_PIECE
      ? { angle: value * Math.PI / 180 }
      : { yaw: value * Math.PI / 180 });
    else if (field === "pitch") replaceSelected({ pitch: value * Math.PI / 180 });
    else if (field === "power") replaceSelected({ speed: value });
    else if (field === "delay") replaceSelected({ delay: value });
    else if (field === "bounce") replaceSelected({ restitution: value });
    status = "PIECE TUNED";
    renderView();
  }

  function deleteSelected() {
    if (shotActive || !selectedId) return;
    pieces = pieces.filter((piece) => piece.id !== selectedId);
    selectedId = null;
    status = "PIECE REMOVED";
    renderView();
  }

  function saveCurrent() {
    const saved = store.save({
      id: currentId,
      name: view.name(),
      locationId,
      ballId,
      pieces,
    });
    currentId = saved.id;
    currentName = saved.name;
    status = "SHOT SAVED";
    renderView();
  }

  function newLayout() {
    resetShot();
    pieces = [];
    selectedId = null;
    currentId = "";
    currentName = "Untitled Trick Shot";
    status = "NEW SHOT";
    renderView();
  }

  function loadLayout(id) {
    const saved = store.get(id);
    if (!saved) return;
    resetShot();
    currentId = saved.id;
    currentName = saved.name;
    locationId = saved.locationId;
    ballId = saved.ballId;
    pieces = saved.pieces;
    selectedId = pieces[0]?.id || null;
    status = `LOADED · ${saved.name.toUpperCase()}`;
    renderView();
  }

  function deleteSaved(id) {
    if (!store.remove(id)) return;
    if (id === currentId) currentId = "";
    status = "SAVED SHOT DELETED";
    renderView();
  }

  function resetShot(nextStatus = "BALL RESET") {
    resetBall(ball);
    resetTrickShotPhysics(piecePhysics);
    shotActive = false;
    scored = false;
    flightSeconds = 0;
    settledSeconds = 0;
    madeSeconds = 0;
    pull = null;
    pointerId = null;
    pointerMode = null;
    status = nextStatus;
    renderView();
  }

  function startPull(event, point) {
    const screen = ballScreenPosition(ball);
    if (!isGrab(point, screen)) return false;
    pointerId = event.pointerId;
    pointerMode = "pull";
    grabOffset = { x: point.x - screen.x, y: point.y - screen.y };
    pull = neutralPull(screen);
    selectedId = null;
    status = "AIMING";
    canvas.setPointerCapture?.(event.pointerId);
    renderView();
    return true;
  }

  function startPieceDrag(event, point, piece) {
    const centre = projectPointForPiece(piece);
    pointerId = event.pointerId;
    pointerMode = "piece";
    selectedId = piece.id;
    dragOffset = { x: point.x - centre.x, y: point.y - centre.y };
    canvas.setPointerCapture?.(event.pointerId);
    status = "PLACE PIECE";
    renderView();
  }

  function projectPointForPiece(piece) {
    return projectPoint({ x: piece.x, y: piece.y, z: piece.z });
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!active || shotActive) return;
    const point = canvasPoint(canvas, event);
    const piece = sandboxPieceAtPoint(pieces, point);
    event.preventDefault();
    if (piece) startPieceDrag(event, point, piece);
    else if (!startPull(event, point)) {
      selectedId = null;
      status = "BUILD MODE";
      renderView();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    if (pointerMode === "pull" && pull) {
      pull = resolvePull(
        { x: pull.anchorX, y: pull.anchorY },
        { x: point.x - grabOffset.x, y: point.y - grabOffset.y },
      );
      status = `POWER ${Math.round(pull.power * 100)}%`;
      renderView();
    } else if (pointerMode === "piece") {
      const piece = pieces.find((candidate) => candidate.id === selectedId);
      if (!piece) return;
      const worldPoint = screenToWorldAtZ(point.x - dragOffset.x, point.y - dragOffset.y, piece.z);
      replaceSelected({ x: worldPoint.x, y: worldPoint.y });
      renderView();
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    if (pointerMode === "pull") releasePull();
    pointerId = null;
    pointerMode = null;
  });
  canvas.addEventListener("pointercancel", () => {
    pull = null;
    pointerId = null;
    pointerMode = null;
    status = "BUILD MODE";
    renderView();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function releasePull() {
    const released = pull;
    pull = null;
    if (!released || released.distance < PULL_MIN || !isShootablePull(released)) {
      status = "BUILD MODE";
      renderView();
      return;
    }
    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: { x: released.aimX, y: released.aimY },
      power: released.power,
      loft: released.loft,
      weight: ballFlight(ballId).weight,
    });
    launchBall(ball, launch, launchSpin(launch));
    shotActive = true;
    scored = false;
    flightSeconds = 0;
    status = "SHOT LIVE";
    audio.released(ballId);
    renderView();
  }

  function tick() {
    if (!shotActive) return;
    const statusBeforeTick = status;
    flightSeconds += TICK_SECONDS;
    const substeps = Math.max(1, Math.ceil(TICK_SECONDS / PHYSICS_SUBSTEP_SECONDS));
    const dt = TICK_SECONDS / substeps;
    const heard = new Set();

    for (let index = 0; index < substeps; index++) {
      const previous = { x: ball.x, y: ball.y, z: ball.z };
      let base = { contacts: [], scored: false };
      if (!piecePhysics.capture) {
        base = stepBall(ball, world, dt, { ballId, alreadyScored: scored });
        if (base.scored) {
          scored = true;
          status = "SWISH!";
          audio.scored(1);
        }
        for (const contact of base.contacts) heard.add(contact);
      }

      const pieceStep = ball.splat
        ? { contacts: [], captured: false, launched: false }
        : stepTrickShotPieces(ball, previous, pieces, piecePhysics, dt);
      for (const contact of pieceStep.contacts) heard.add(contact);
      if (pieceStep.captured) status = "CANNON CHARGING";
      if (pieceStep.launched) {
        status = "CANNON FIRED";
        audio.released(ballId);
      }
    }

    for (const contact of heard) {
      if (contact === "sandbox-board") audio.contact("backboard", { ballId, speed: ball.vy });
      else if (contact === "sandbox-cannon-catch") audio.contact("rim", { ballId, speed: ball.vy });
      else if (!["score", "sandbox-cannon-fire"].includes(contact)) audio.contact(contact, { ballId, speed: ball.vy });
    }

    if (scored) madeSeconds += TICK_SECONDS;
    const settled = !piecePhysics.capture && isBallSettled(ball);
    settledSeconds = settled ? settledSeconds + TICK_SECONDS : 0;
    if ((scored && madeSeconds >= MADE_HOLD_SECONDS) || settledSeconds >= SETTLED_SECONDS || flightSeconds >= MAX_SHOT_SECONDS || ball.splat) {
      resetShot(scored ? "BUCKET · TRY IT AGAIN" : "READY · TRY IT AGAIN");
    } else if (status !== statusBeforeTick) {
      renderView();
    }
  }

  function currentTrajectory() {
    if (!pull || pull.power <= 0.03) return null;
    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: { x: pull.aimX, y: pull.aimY },
      power: pull.power,
      loft: pull.loft,
      weight: ballFlight(ballId).weight,
    });
    return trajectoryPoints({ x: ball.x, y: ball.y, z: ball.z }, launch);
  }

  function draw() {
    if (!ctx) return;
    renderTrickShotFrame(ctx, {
      ball,
      hoop,
      backdrop: assets.backdrop(locationId),
      locationId,
      ballFrames: assets.ballFrames(ballId),
      ballId,
      pieces,
      selectedId,
      capture: piecePhysics.capture,
      pull,
      trajectory: currentTrajectory(),
      scored,
    });
  }

  function frame(timestamp) {
    if (!active) return;
    if (lastTime === null) lastTime = timestamp;
    accumulator += Math.min(100, timestamp - lastTime);
    lastTime = timestamp;
    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      tick();
    }
    draw();
    requestAnimationFrame(frame);
  }

  return {
    enter(style = {}) {
      locationId = style.locationId || locationId;
      ballId = style.ballId || ballId;
      active = true;
      lastTime = null;
      accumulator = 0;
      status = "BUILD MODE";
      renderView();
      requestAnimationFrame(frame);
    },
    exit() {
      active = false;
      resetShot("BUILD MODE");
    },
    isActive: () => active,
    state: () => ({ pieces, selectedId, currentId, shotActive, ball, capture: piecePhysics.capture }),
  };
}
