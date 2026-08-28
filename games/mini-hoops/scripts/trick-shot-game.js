// Trick Shot Lab: composition root for a reusable sandbox editor.
//
// The lab owns a local named-layout bank. It does not own or serialize HORSE
// state. HORSE reuses the modules below this file — sim/trick-shot.js,
// sim/trick-shot-target.js, sim/trick-shot-physics.js, render/trick-shot.js —
// plus bin-target records from the shared saved-shot bank.
//
// THE TARGET IS PART OF THE SHOT, AND IT DECIDES WHICH INTEGRATOR RUNS.
// `sim/physics.js` steps the ball against the wall hoop and knows nothing about
// bins; `sim/bin-physics.js` steps it against bins and has no backboard. They
// are two complete integrators rather than two colliders, so exactly one runs
// per substep — which is the honest shape of a mode where you choose ONE target.
// `sim/trick-shot-target.js` is the seam that says which, and the piece step
// runs after whichever it was, on the same substep, so a thin pad can never be
// skipped at 60 Hz.
//
// TWO CLOCKS, THE CABINET'S OWN RULE. The target's motion clock runs the whole
// time the screen is up, so a moving hoop or bin can be watched and led before
// anyone commits to a pull. The shot's own clock only runs while a ball is in
// the air.

import { DEFAULT_BALL, ballById, ballFlight, ballSplat } from "./assets/ball-catalog.js";
import { DEFAULT_LOCATION } from "./assets/location-catalog.js";
import { createAssetLibrary } from "./assets/loader.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import {
  addTrickShotImpact,
  clearTrickShotImpacts,
  createTrickShotImpactField,
  tickTrickShotImpacts,
} from "./effects/trick-shot-impact.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHYSICS_SUBSTEP_SECONDS,
  PULL_MIN,
  TICK_MS,
  TICK_SECONDS,
} from "./sim/constants.js";
import { launchSpin, solveLaunch, trajectoryPoints } from "./sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "./sim/physics.js";
import { stepBallAgainstBins } from "./sim/bin-physics.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import {
  BOARD_PIECE,
  CANNON_PIECE,
  MAX_SANDBOX_PIECES,
  SPRING_PIECE,
  createSandboxPiece,
  isPadPiece,
} from "./sim/trick-shot.js";
import {
  BIN_TARGET,
  HOOP_TARGET,
  defaultTrickShotMotion,
  defaultTrickShotPlacement,
  defaultTrickShotTarget,
  normalizeTrickShotTarget,
  trickShotTargetAt,
  trickShotTargetKind,
} from "./sim/trick-shot-target.js";
import {
  createTrickShotPhysics,
  resetTrickShotPhysics,
  stepTrickShotPieces,
} from "./sim/trick-shot-physics.js";
import {
  binDepthHandleAt,
  renderTrickShotFrame,
  sandboxPieceAtPoint,
  sandboxPieceControlAtPoint,
  trickShotTargetAtPoint,
  TRICK_SHOT_ASSET_PATHS,
} from "./render/trick-shot.js";
import { ballScreenPosition } from "./render/frame.js";
import { prepareContext } from "./render/scene.js";
import { projectPoint, screenToWorldAtZ, screenToWorldOnFloor } from "./sim/projection.js";
import { createTrickShotStore } from "./store/trick-shots-store.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import { createTrickShotView } from "./ui/trick-shot-view.js";

const SILENT_AUDIO = Object.freeze({
  released() {}, contact() {}, splat() {}, scored() {}, binScored() {}, click() {},
});
const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";
const MAX_SHOT_SECONDS = 14;
const SETTLED_SECONDS = 0.8;
const MADE_HOLD_SECONDS = 1.05;
const SPLAT_HOLD_SECONDS = 0.72;
const MAX_EDIT_HISTORY = 40;

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
  const splats = createSplatField();
  const impacts = createTrickShotImpactField();

  let active = false;
  let locationId = DEFAULT_LOCATION;
  let ballId = DEFAULT_BALL;
  let target = defaultTrickShotTarget();
  // The motion each target kind was last set to, so flipping between the hoop
  // and the bin does not quietly reset either one. The two catalogs share no
  // ids — see the note at the top of `sim/trick-shot-target.js` — so there is
  // nothing to map across and a remembered pair is the whole answer.
  const rememberedMotion = { [HOOP_TARGET]: target.motionId, [BIN_TARGET]: defaultTrickShotMotion(BIN_TARGET) };
  // And where each kind was last stood, for the same reason and with the same
  // shape of answer. PER KIND, because the two placements are as incompatible as
  // the two motion ids: a bin's is a world point on the floor and a hoop's is a
  // screen point on the back wall, so there is nothing to carry across and a
  // guess would be worse than a memory.
  const rememberedPlacement = {
    [HOOP_TARGET]: defaultTrickShotPlacement(HOOP_TARGET),
    [BIN_TARGET]: defaultTrickShotPlacement(BIN_TARGET),
  };
  // The target's own clock. Runs whenever the screen is up, never reset by a
  // shot: the cabinet's two-clock rule, so a moving target can be watched.
  let motionSeconds = 0;
  let capturedBin = null;
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
  let splatSeconds = 0;
  let pull = null;
  let pointerId = null;
  let pointerMode = null;
  let grabOffset = { x: 0, y: 0 };
  let dragOffset = { x: 0, y: 0 };
  let history = [];
  let lastTime = null;
  let accumulator = 0;

  const view = createTrickShotView(root, {
    onExit: () => onLeave(),
    onAddBoard: () => addPiece(BOARD_PIECE),
    onAddSpring: () => addPiece(SPRING_PIECE),
    onAddCannon: () => addPiece(CANNON_PIECE),
    onUndo: undoEdit,
    onResetBall: () => resetShot("BUILD MODE"),
    onDeletePiece: deleteSelected,
    onPieceChange: updateSelected,
    onSave: saveCurrent,
    onNew: newLayout,
    onLoad: loadLayout,
    onDeleteShot: deleteSaved,
    onBallSelect: selectBall,
    onTargetKind: selectTargetKind,
    onTargetMotion: selectTargetMotion,
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
      power: pull?.power || 0,
      pulling: pointerMode === "pull",
      // Any live gesture at all, which is a different question from `pulling`:
      // the onboarding card is centred over the floor, which is exactly where a
      // bin is placed, and it has no business sitting on the controls of the
      // thing the player is dragging.
      interacting: pointerMode !== null,
      canUndo: history.length > 0,
      ballId,
      target,
    });
  }

  /** The target as the sim and the renderer see it right now. */
  function targetNow() {
    return trickShotTargetAt(target, motionSeconds);
  }

  /**
   * Adopt a target, and RESTART ITS SWEEP.
   *
   * A motion is an offset from where the target was placed, so a new one has to
   * begin there — HORSE's own rule, and without it changing the motion teleports
   * the bin to wherever the old sweep happened to be. It is the only thing that
   * zeroes this clock apart from picking the bin up; a shot ending does not,
   * because the sweep is the second clock and it does not belong to the shot.
   */
  function setTarget(next, status_ = "TARGET SET") {
    if (shotActive || pull) return;
    target = normalizeTrickShotTarget(next);
    rememberedMotion[target.kind] = target.motionId;
    rememberedPlacement[target.kind] = target.placement;
    motionSeconds = 0;
    resetShot(status_);
  }

  function selectTargetKind(kind) {
    const safe = trickShotTargetKind(kind);
    if (safe === target.kind) return;
    audio.click();
    setTarget(
      // Each kind's placement is remembered across a trip through the other, so a
      // player comparing the two does not have to re-place either one each time.
      { kind: safe, motionId: rememberedMotion[safe], placement: rememberedPlacement[safe] },
      safe === BIN_TARGET ? "FLOOR BIN · DRAG TO PLACE" : "WALL HOOP · DRAG TO HANG",
    );
  }

  function selectTargetMotion(motionId) {
    audio.click();
    setTarget({ ...target, motionId }, "TARGET MOTION SET");
  }

  function selectBall(nextBallId) {
    if (shotActive || pull) return;
    ballId = ballById(nextBallId).id;
    assets.ballFrames(ballId);
    assets.ballSplats(ballId);
    audio.click();
    resetShot("BALL SELECTED");
  }

  function rememberEdit() {
    history.push({ pieces: pieces.map((piece) => ({ ...piece })), selectedId });
    if (history.length > MAX_EDIT_HISTORY) history.shift();
  }

  function undoEdit() {
    if (shotActive || !history.length) return;
    const previous = history.pop();
    pieces = previous.pieces;
    selectedId = previous.selectedId;
    status = "UNDO";
    renderView();
  }

  function uniquePieceId(type) {
    pieceCounter += 1;
    return `${type}-${Date.now().toString(36)}-${pieceCounter}`;
  }

  function addPiece(type) {
    if (shotActive || pieces.length >= MAX_SANDBOX_PIECES) return;
    rememberEdit();
    const count = pieces.length;
    // A NEW TOOL HAS TO LAND SOMEWHERE THE LAST ONE IS NOT. These strides used
    // to be 0.12 across and 0.12 deep, which at mid-room is about 33 screen
    // pixels between two 125px-wide pads: three tools in a row buried each
    // other, and adding one read as nothing happening. The x stride is bounded
    // by the portrait crop rather than by `PIECE_BOUNDS` — a pad at 0.52 with
    // its own half-width still lands inside the columns a phone shows — and the
    // three moduli are coprime-ish on purpose, so consecutive pieces differ on
    // every axis at once instead of sliding along one.
    const piece = createSandboxPiece(type, {
      id: uniquePieceId(type),
      x: ((count % 5) - 2) * 0.26,
      y: type === CANNON_PIECE ? 0.3 : 0.6 + (count % 3) * 0.24,
      z: 0.28 + (count % 4) * 0.18,
      angle: type !== CANNON_PIECE ? -0.18 + (count % 3) * 0.18 : undefined,
    });
    pieces = [...pieces, piece];
    selectedId = piece.id;
    status = type === BOARD_PIECE
      ? "REBOUND PAD ADDED"
      : type === SPRING_PIECE ? "SPRINGBOARD ADDED" : "CANNON ADDED";
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
    rememberEdit();
    if (field === "depth") replaceSelected({ z: value / 100 });
    else if (field === "angle") replaceSelected({ yaw: value * Math.PI / 180 });
    else if (field === "pitch") replaceSelected(isPadPiece(piece)
      ? { angle: value * Math.PI / 180 }
      : { pitch: value * Math.PI / 180 });
    else if (field === "power") replaceSelected({ speed: value });
    else if (field === "delay") replaceSelected({ delay: value });
    else if (field === "bounce") replaceSelected({ restitution: value });
    status = "PIECE TUNED";
    renderView();
  }

  function deleteSelected() {
    if (shotActive || !selectedId) return;
    rememberEdit();
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
      target,
      pieces,
    });
    currentId = saved.id;
    currentName = saved.name;
    status = "SHOT SAVED";
    renderView();
  }

  function newLayout() {
    resetShot();
    clearSplatField(splats);
    clearTrickShotImpacts(impacts);
    if (pieces.length) rememberEdit();
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
    clearSplatField(splats);
    clearTrickShotImpacts(impacts);
    currentId = saved.id;
    currentName = saved.name;
    locationId = saved.locationId;
    ballId = saved.ballId;
    target = saved.target;
    rememberedMotion[target.kind] = target.motionId;
    rememberedPlacement[target.kind] = target.placement;
    motionSeconds = 0;
    history = [];
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
    capturedBin = null;
    shotActive = false;
    scored = false;
    flightSeconds = 0;
    settledSeconds = 0;
    madeSeconds = 0;
    splatSeconds = 0;
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
    rememberEdit();
    const centre = piece.type === CANNON_PIECE
      ? projectPoint({ x: piece.x, y: 0, z: piece.z })
      : projectPointForPiece(piece);
    pointerId = event.pointerId;
    pointerMode = "piece";
    selectedId = piece.id;
    dragOffset = { x: point.x - centre.x, y: point.y - centre.y };
    canvas.setPointerCapture?.(event.pointerId);
    status = "PLACE PIECE";
    renderView();
  }

  function startDepthDrag(event, point, piece) {
    rememberEdit();
    const floor = projectPoint({ x: piece.x, y: 0, z: piece.z });
    pointerId = event.pointerId;
    pointerMode = "depth";
    selectedId = piece.id;
    dragOffset = { x: point.x - floor.x, y: point.y - floor.y };
    canvas.setPointerCapture?.(event.pointerId);
    status = "MOVE IN DEPTH";
    renderView();
  }

  function projectPointForPiece(piece) {
    return projectPoint({ x: piece.x, y: piece.y, z: piece.z });
  }

  const isPlacingTarget = () => pointerMode === "target" || pointerMode === "target-depth";

  /**
   * Start dragging the target.
   *
   * THE MOTION CLOCK IS RESET TO ZERO, not merely paused. A motion is an offset
   * from where the target was placed, so with the clock anywhere else the drawn
   * target and its placement differ by a constant a drag would have to carry. At
   * zero they are the same point, the target sits still under the finger, and
   * the sweep restarts from where it was put down — which is HORSE's own rule
   * and the reason the target a player lined up is the one that is there when
   * the shot begins.
   *
   * `target-depth` is bin-only and stays that way: a hoop hangs at the one depth
   * there is, so there is no second axis to separate from the first.
   */
  function startTargetDrag(event, point, mode) {
    const hoop = target.kind === HOOP_TARGET;
    if (hoop && mode === "target-depth") return false;
    motionSeconds = 0;
    // A hoop's placement IS a screen point, so the anchor is that point and the
    // offset is honest with no round trip through the projection.
    const anchor = hoop
      ? { x: target.placement.cx, y: target.placement.rimY }
      : mode === "target-depth"
        ? projectPoint({ x: target.placement.x, y: 0, z: target.placement.z })
        : projectPoint({ x: target.placement.x, y: target.placement.y, z: target.placement.z });
    pointerId = event.pointerId;
    pointerMode = mode;
    selectedId = null;
    dragOffset = { x: point.x - anchor.x, y: point.y - anchor.y };
    canvas.setPointerCapture?.(event.pointerId);
    status = hoop ? "HANG HOOP" : mode === "target-depth" ? "BIN DEPTH" : "PLACE BIN";
    renderView();
    return true;
  }

  /**
   * Re-place the target, always back through its own legal-volume clamp.
   *
   * `normalizeTrickShotTarget` picks the clamp off the kind, so this hands it the
   * raw placement and does not choose one itself — which is what keeps the two
   * volumes stated in one place each rather than in two.
   */
  function moveTarget(placement) {
    target = normalizeTrickShotTarget({ ...target, placement });
    rememberedPlacement[target.kind] = target.placement;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!active || shotActive) return;
    const point = canvasPoint(canvas, event);
    const control = sandboxPieceControlAtPoint(pieces, point, selectedId);
    const piece = sandboxPieceAtPoint(pieces, point);
    const resolved = targetNow();
    event.preventDefault();
    if (control?.action === "delete") {
      selectedId = control.piece.id;
      deleteSelected();
    }
    else if (control?.action === "depth") startDepthDrag(event, point, control.piece);
    // A piece is picked up before the target is: the tools are what the player
    // is arranging, and a pad drawn over the bin has to be the thing they get.
    else if (piece) startPieceDrag(event, point, piece);
    else if (binDepthHandleAt(resolved, point) && startTargetDrag(event, point, "target-depth")) { /* placed */ }
    else if (trickShotTargetAtPoint(resolved, point) && startTargetDrag(event, point, "target")) { /* placed */ }
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
      if (piece.type === CANNON_PIECE) {
        const worldPoint = screenToWorldOnFloor(point.x - dragOffset.x, point.y - dragOffset.y);
        replaceSelected({ x: worldPoint.x, z: worldPoint.z });
      } else {
        const worldPoint = screenToWorldAtZ(point.x - dragOffset.x, point.y - dragOffset.y, piece.z);
        replaceSelected({ x: worldPoint.x, y: worldPoint.y });
      }
      renderView();
    } else if (pointerMode === "depth") {
      const worldPoint = screenToWorldOnFloor(point.x - dragOffset.x, point.y - dragOffset.y);
      replaceSelected({ x: worldPoint.x, z: worldPoint.z });
      renderView();
    } else if (pointerMode === "target") {
      // Across for the lane, up for the height — HORSE's own drag. For a BIN,
      // depth is a separate handle, because up the screen is both higher and
      // further away and one drag cannot carry both honestly. A HOOP has no
      // depth to confuse it with, and its placement is already a screen point,
      // so the pointer position is the whole answer.
      if (target.kind === HOOP_TARGET) {
        moveTarget({ cx: point.x - dragOffset.x, rimY: point.y - dragOffset.y });
        renderView();
        return;
      }
      const worldPoint = screenToWorldAtZ(point.x - dragOffset.x, point.y - dragOffset.y, target.placement.z);
      moveTarget({ x: worldPoint.x, y: worldPoint.y, z: target.placement.z });
      renderView();
    } else if (pointerMode === "target-depth") {
      const worldPoint = screenToWorldOnFloor(point.x - dragOffset.x, point.y - dragOffset.y);
      moveTarget({ x: worldPoint.x, y: target.placement.y, z: worldPoint.z });
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

  root.addEventListener("keydown", (event) => {
    if (!active || shotActive || !selectedId) return;
    const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (editable) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
    }
  });

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
    tickSplatField(splats, TICK_SECONDS);
    tickTrickShotImpacts(impacts, TICK_SECONDS);
    // The target's own clock, and it is not the shot's. It runs whether or not a
    // ball is in the air, so a moving hoop or bin can be watched and led before
    // anyone commits — the classic court's two-clock rule. It is held only while
    // the bin is being dragged, because then the player is placing it, not
    // reading it.
    if (!isPlacingTarget()) motionSeconds += TICK_SECONDS;
    if (!shotActive) return;
    const statusBeforeTick = status;
    flightSeconds += TICK_SECONDS;

    // Resolved ONCE per tick, like `worldFor` in the classic cabinet: within a
    // single tick the target is treated as moving at a constant velocity, which
    // is what keeps the substeps consistent with each other.
    const resolved = targetNow();
    const world = resolved.hoop ? worldFor(resolved.hoop) : null;
    const bins = resolved.bin ? [resolved.bin] : null;

    const substeps = Math.max(1, Math.ceil(TICK_SECONDS / PHYSICS_SUBSTEP_SECONDS));
    const dt = TICK_SECONDS / substeps;
    const heard = new Set();

    for (let index = 0; index < substeps; index++) {
      const previous = { x: ball.x, y: ball.y, z: ball.z };
      // EXACTLY ONE INTEGRATOR RUNS. `stepBall` and `stepBallAgainstBins` are
      // both complete integrators — each owns gravity, drag, the room and its
      // own target — so which one runs is the whole of what choosing a target
      // means down here. A cannon holding the ball suspends both.
      if (!piecePhysics.capture) {
        const step = world
          ? stepBall(ball, world, dt, { ballId, alreadyScored: scored })
          : stepBallAgainstBins(ball, bins, dt, { ballId, capturedBin });
        if (!world) capturedBin = step.capturedBin;
        const justScored = world ? step.scored : step.scoredBin !== null && step.scoredBin !== undefined;
        if (justScored && !scored) {
          scored = true;
          status = world ? "SWISH!" : "IN THE BIN!";
          if (world) audio.scored(1);
          else audio.binScored(ballId);
        }
        for (const contact of step.contacts) heard.add(contact);
        if (step.splat) {
          addSplat(splats, { ...step.splat, ballId, ...ballSplat(ballId) });
          audio.splat(step.splat.surface, { ballId, speed: step.splat.speed });
          status = "SPLAT!";
        }
      }

      const pieceStep = ball.splat || capturedBin !== null
        ? { contacts: [], impacts: [], captured: false, launched: false }
        : stepTrickShotPieces(ball, previous, pieces, piecePhysics, dt);
      for (const contact of pieceStep.contacts) heard.add(contact);
      for (const impact of pieceStep.impacts || []) addTrickShotImpact(impacts, impact);
      if (pieceStep.captured) status = "CANNON CHARGING";
      if (pieceStep.launched) {
        status = "CANNON FIRED";
        audio.released(ballId);
      }
    }

    for (const contact of heard) {
      if (ball.splat?.surface === contact) continue;
      if (contact === "sandbox-board" || contact === "sandbox-spring") {
        audio.contact("backboard", { ballId, speed: ball.vy });
        if (contact === "sandbox-spring") status = "SPRING!";
      }
      else if (contact === "sandbox-cannon-catch") audio.contact("rim", { ballId, speed: ball.vy });
      else if (!["score", "bin-score", "sandbox-cannon-fire"].includes(contact)) {
        audio.contact(contact, { ballId, speed: ball.vy });
      }
    }

    if (scored) madeSeconds += TICK_SECONDS;
    splatSeconds = ball.splat ? splatSeconds + TICK_SECONDS : 0;
    // A ball a bin has swallowed never settles — it is held on the drum's axis
    // and pushed down forever — so the made-shot hold is what ends that shot.
    const settled = !piecePhysics.capture && capturedBin === null && isBallSettled(ball);
    settledSeconds = settled ? settledSeconds + TICK_SECONDS : 0;
    if ((scored && madeSeconds >= MADE_HOLD_SECONDS)
      || settledSeconds >= SETTLED_SECONDS
      || flightSeconds >= MAX_SHOT_SECONDS
      || (ball.splat && splatSeconds >= SPLAT_HOLD_SECONDS)) {
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
      target: targetNow(),
      binImage: assets.image(BIN_PATH),
      building: !shotActive,
      capturedBin,
      backdrop: assets.backdrop(locationId),
      locationId,
      ballFrames: assets.ballFrames(ballId),
      ballId,
      pieceAssets: {
        cannonBase: assets.image(TRICK_SHOT_ASSET_PATHS.cannonBase),
        cannonBarrel: assets.image(TRICK_SHOT_ASSET_PATHS.cannonBarrel),
      },
      pieces,
      selectedId,
      capture: piecePhysics.capture,
      pull,
      trajectory: currentTrajectory(),
      scored,
      splats,
      splatImagesFor: assets.ballSplats,
      impacts,
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
      assets.ballSplats(ballId);
      assets.image(BIN_PATH);
      clearSplatField(splats);
      clearTrickShotImpacts(impacts);
      active = true;
      lastTime = null;
      accumulator = 0;
      status = "BUILD MODE";
      history = [];
      renderView();
      requestAnimationFrame(frame);
    },
    exit() {
      active = false;
      resetShot("BUILD MODE");
    },
    isActive: () => active,
    state: () => ({
      pieces, selectedId, currentId, shotActive, ballId, ball, splats, impacts,
      target, motionSeconds, capturedBin, capture: piecePhysics.capture,
    }),
  };
}
