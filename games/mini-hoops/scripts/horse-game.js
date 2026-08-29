// HORSE: a third composition root, on the cabinet's own page.
//
// A SCREEN, NOT A PAGE — the same rule floor tic-tac-toe learned the hard way. A
// navigation destroys the <audio> element the soundtrack streams through and
// nothing brings a stream back, so this takes the cabinet's `audio` and the
// cabinet's router rather than owning either.
//
// It is its own root because it owns a different loop and a different shape of
// turn. Tic-tac-toe's turn is one gesture; a HORSE turn is TWO phases —
// arranging a TARGET, then shooting at it — and the second half of that is only
// ever reached from the first.
//
// A TARGET IS A FLOOR BIN OR THE WALL HOOP, and which one is the first thing a
// setter chooses. The seam is `sim/trick-shot-target.js`, the same one the Trick
// Shot Lab uses, so the two modes describe a target identically and a layout
// authored in the Lab can be set here whichever way it ends. Everything that
// follows from that choice is a dispatch on one field: which motion catalog the
// picker is built from, which clamp a drag goes through, which integrator the
// flight runs on, and which of two gestures the pull means. See
// `sim/horse-shot.js` for why the gesture is allowed to change with the target
// here when the Lab deliberately refused to let it.
//
// WHAT IT DELIBERATELY DOES NOT IMPORT: `sim/run.js`, and any store. HORSE has
// no clock and files to no leaderboard, for the reason a board key is
// `mode:duration` — a HORSE score is not comparable to anything, because the
// target was invented by one of the two players.

import { createAssetLibrary } from "./assets/loader.js";
import { BALLS, DEFAULT_BALL, ballFlight, ballSplat, ballTrail } from "./assets/ball-catalog.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import { addFire, clearFlameTrail, createFlameTrail, emitFlameTrail, tickFlameTrail } from "./effects/flame-trail.js";
import {
  addTrickShotImpact,
  clearTrickShotImpacts,
  createTrickShotImpactField,
  tickTrickShotImpacts,
} from "./effects/trick-shot-impact.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  REFERENCE_POWER,
  CONTACT_DEBOUNCE_SECONDS,
  PHYSICS_SUBSTEP_SECONDS,
  TICK_SECONDS,
} from "./sim/constants.js";
import { stepBallAgainstBins } from "./sim/bin-physics.js";
import { HOOP_MODES, hoopModeById } from "./sim/hoop.js";
import {
  defaultHoopPlacement,
  hoopPlacementBoundsFor,
  hoopPlacementFromFractions,
  placedHoopAt,
} from "./sim/hoop-placement.js";
import {
  BIN_MOTIONS,
  binMotionById,
  motionEnvelope,
  defaultPlacement,
  heightBoundsAt,
  horizontalBoundsAt,
  placedBinAt,
  placementFromFractions,
  PLACEMENT_BOUNDS,
} from "./sim/bin-placement.js";
import { needsProvenPull, provenPullPhase, provenPullShot } from "./sim/horse-cpu.js";
import { createHorseShot, horsePowerForDepth, horseTargetAt } from "./sim/horse-shot.js";
import {
  HORSE_FIXED_SETUP,
  PHASE_MATCH,
  PHASE_SET,
  canPlaceBin,
  chooseCpuBinSetup,
  chooseCpuTargetKind,
  chooseCpuTurnBall,
  cpuMakesHorseShot,
  createHorseMatch,
  horseDifficultyById,
  horseModeId,
  isHumanControlledTurn,
  judgeHorseShot,
  letterState,
  normalizeWord,
  playerLabel,
  requiredPieceIds,
  resolveHorseShot,
  shotSetupFor,
} from "./sim/horse.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "./sim/physics.js";
import {
  BOARD_PIECE,
  CANNON_PIECE,
  MAX_SANDBOX_PIECES,
  SPRING_PIECE,
  createSandboxPiece,
  isPadPiece,
  normalizeSandboxPieces,
} from "./sim/trick-shot.js";
import {
  createTrickShotPhysics,
  resetTrickShotPhysics,
  stepTrickShotPieces,
} from "./sim/trick-shot-physics.js";
import {
  BIN_TARGET,
  HOOP_TARGET,
  TRICK_SHOT_TARGETS,
  defaultTrickShotMotion,
  defaultTrickShotPlacement,
  normalizeTrickShotTarget,
  trickShotTargetAt,
  trickShotTargetKind,
} from "./sim/trick-shot-target.js";
import { createMiniHoopsAccountAccess } from "./multiplayer/account-access.js";
import { normalizeRoomCode } from "./multiplayer/online-client.js";
import { createHorseOnlineClient } from "./multiplayer/horse-online-client.js";
import { launchSpin, trajectoryPoints } from "./sim/launch.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { ballScreenRadius, projectPoint, screenToWorldAtZ, screenToWorldOnFloor } from "./sim/projection.js";
import { prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import { createTurnBallPicker, normalizeTurnBallId } from "./ui/turn-ball-picker.js";
import { drawFlameEmbers, drawFlameFires } from "./render/flames.js";
import {
  TRICK_SHOT_ASSET_PATHS,
  binDepthHandleAt,
  renderTrickShotFrame,
  sandboxPieceAtPoint,
  sandboxPieceControlAtPoint,
  trickShotTargetAtPoint,
} from "./render/trick-shot.js";
import { createTrickShotStore } from "./store/trick-shots-store.js";

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";

// The room is fixed; the ball is a decision made on every turn. The catalog
// default still lives in `sim/horse.js` because the server needs the same safe
// fallback for old or malformed online intents.
const ROOM_ID = HORSE_FIXED_SETUP.locationId;
const LOSER_POPUP_SECONDS = 2.4;
const MAX_HORSE_SHOT_SECONDS = 7;

// How far one nudge of a key or an on-screen stepper moves the target. Two sets,
// because the two targets are placed in two different spaces — a bin in world
// units on the floor, a hoop in screen pixels on the wall. Sized so a nudge is
// about the same visible step either way rather than the same number.
const NUDGE_DEPTH = 0.035;
const NUDGE_LATERAL = 0.045;
const NUDGE_HEIGHT = 0.03;
const NUDGE_HOOP_X = 14;
const NUDGE_HOOP_Y = 8;

// A turn's two phases. `placing` is only ever reached when the rules say this
// player owes nobody a shot.
const PHASE_PLACING = "placing";
const PHASE_AIMING = "aiming";

/**
 * The ball owed by the current shooter.
 *
 * A setter may use their own per-seat choice. Once that shot stands, the ball
 * becomes part of the standing setup just like the bin and its motion, so the
 * matcher never gets to replace it with their own last choice.
 */
export function horseTurnBallId(match, turnBalls = []) {
  const standingBall = match?.phase === PHASE_MATCH ? match.standingShot?.ballId : null;
  return normalizeTurnBallId(standingBall || turnBalls[match?.turn] || DEFAULT_BALL);
}

/** Silent stand-in so the root can be constructed in a test without a browser. */
const SILENT_AUDIO = Object.freeze({
  released() {}, contact() {}, scored() {}, binScored() {}, missed() {},
  celebrate() {}, click() {}, splat() {}, sizzle() {},
});

export function bootHorse(root, options = {}) {
  const random = options.random || Math.random;
  const audio = options.audio || SILENT_AUDIO;
  const onLeave = options.onLeave || (() => {});
  // How this root asks the cabinet to swap between its court and its online
  // lobby. It owns both; it does not own the router.
  const onShowLobby = options.onShowLobby || (() => {});
  const accountAccess = options.accountAccess || createMiniHoopsAccountAccess();
  const store = options.store || createTrickShotStore();
  const onlineClient = options.onlineClient || createHorseOnlineClient({
    resolveIdentity: () => accountAccess.identity(),
  });

  const canvas = root.querySelector("#horseCourt");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  // Injectable for the same reason the practice court's is: the loader
  // constructs `Image`, which does not exist under node, and the turn state
  // machine is exactly the thing that has to be testable without a browser.
  const assets = options.assets || createAssetLibrary({ onLoad: () => draw() });
  const art = {
    bin: assets.image(BIN_PATH),
    cannonBase: assets.image(TRICK_SHOT_ASSET_PATHS.cannonBase),
    cannonBarrel: assets.image(TRICK_SHOT_ASSET_PATHS.cannonBarrel),
  };

  const ball = createBall();
  const splats = createSplatField();
  const impacts = createTrickShotImpactField();
  const piecePhysics = createTrickShotPhysics();
  // The magma ball burns, and what it leaves in the air and on the floor is a
  // second transient field beside the splats. Same layer, same tick clock, and
  // the same guarantee: it cannot touch a score. See `effects/flame-trail.js`.
  const trail = createFlameTrail();
  const lastContactAt = new Map();

  let mode = horseModeId(options.mode);
  let difficulty = options.difficulty || "medium";
  let word = options.word;
  let active = false;
  let match;
  let phase = PHASE_PLACING;
  // The target the current shooter is arranging. Carried between turns on
  // purpose: a player who liked where they stood the bin last time starts from
  // there rather than from the middle of the room again.
  let workingTarget = defaultWorkingTarget();
  // What each KIND was last set to, so flipping between the bin and the hoop to
  // compare them does not quietly reset either. The Lab keeps exactly this pair
  // for exactly this reason — and it has to be per kind, because the two motion
  // catalogs do not share ids and the two placements do not share a shape.
  const rememberedMotion = {
    [HOOP_TARGET]: defaultTrickShotMotion(HOOP_TARGET),
    [BIN_TARGET]: "still",
  };
  const rememberedPlacement = {
    [HOOP_TARGET]: defaultHoopPlacement(),
    [BIN_TARGET]: defaultPlacement(),
  };
  let workingPieces = [];
  let activePieces = [];
  let selectedPieceId = null;
  let currentLocationId = ROOM_ID;
  let currentSavedShotId = "";
  let pieceSerial = 0;
  // The target the shot in progress is actually against — frozen at the moment
  // the shot was set, so the setter cannot keep fiddling once the ball is in the
  // air.
  let activeSetup = null;
  // The motion clock. Reset to zero at the start of EVERY turn, which is what
  // makes the matcher face the shot the setter faced: same bin, same phase, same
  // moment. Two players, one deterministic path.
  let turnClock = 0;
  let elapsed = 0;
  let pull = null;
  let pointerId = null;
  let grabOffset = { x: 0, y: 0 };
  let placingPointerId = null;
  let placingPointerMode = null;
  let pieceDragOffset = { x: 0, y: 0 };
  let flight = null;
  let cpuDelay = 0;
  let accumulator = 0;
  let previousFrame = 0;
  // Each seat remembers its last SET-shot choice. A matcher does not read this
  // array at all: the standing shot's recorded ball overrides it.
  let turnBalls = [DEFAULT_BALL, DEFAULT_BALL];
  let loserPopupRemaining = 0;
  let loserPopupPlayed = false;

  // ------------------------------------------------------------- online
  // Which of the two rows in `match.players` is this device. Seat 0 is the
  // lobby host; it never moves off zero in any other mode.
  let seat = 0;
  let onlineSnapshot = onlineClient.getSnapshot();
  // The server's newest word on the match, held until the local court is ready
  // to take it — a shot in the air is played out before its ruling lands, or the
  // ball would vanish mid-flight and reappear as a letter.
  let pendingState = null;
  // The last `sequence` this court has actually applied, and the last one it has
  // seen. A shot is replayed exactly once, and only if this device did not take
  // it — the shooter has already watched their own ball.
  let appliedSequence = -1;
  let seenSequence = -1;
  // Set while a shot has been sent and the ruling has not come back. Nothing on
  // this court is interactive while it is true.
  let awaitingServer = false;
  // The bin the OTHER player has arranged this turn, as the server reports it.
  let pendingOnlineSetup = null;

  const el = {
    status: root.querySelector("#horseStatus"),
    modeLabel: root.querySelector("#horseModeLabel"),
    meter: root.querySelector("#horseMeterFill"),
    readout: root.querySelector("#horseMeterReadout"),
    legend: root.querySelector("#horseMeterLegend"),
    hint: root.querySelector("#horseHint"),
    letters: root.querySelector("#horseLetters"),
    place: root.querySelector("#horsePlacePanel"),
    placeHead: root.querySelector("#horsePlaceHead"),
    targets: root.querySelector("#horseTargets"),
    depthNudges: root.querySelector("#horseDepthNudges"),
    motions: root.querySelector("#horseMotions"),
    confirm: root.querySelector("#horseConfirm"),
    readouts: root.querySelector("#horsePlaceReadout"),
    court: root.querySelector("#horseScreen .court"),
    onlinePanel: root.querySelector("#horseOnlinePanel"),
    ballLabel: root.querySelector("#horseBallLabel"),
    ballPanel: root.querySelector("#horseBallPanel"),
    loserPopup: root.querySelector("#horseLoserPopup"),
    loserPopupText: root.querySelector("#horseLoserPopupText"),
    savedShots: root.querySelector("#horseSavedShots"),
    useSavedShot: root.querySelector("#horseUseSavedShot"),
    toolInspector: root.querySelector("#horseToolInspector"),
    toolTitle: root.querySelector("#horseToolTitle"),
    toolDepth: root.querySelector("#horseToolDepth"),
    toolDirection: root.querySelector("#horseToolDirection"),
    toolAngle: root.querySelector("#horseToolAngle"),
    toolAngleLabel: root.querySelector("#horseToolAngleLabel"),
    toolPower: root.querySelector("#horseToolPower"),
    toolPowerLabel: root.querySelector("#horseToolPowerLabel"),
    toolDelay: root.querySelector("#horseToolDelay"),
    toolDelayRow: root.querySelector("#horseToolDelayRow"),
  };
  const results = {
    overlay: root.querySelector("#horseResultsOverlay"),
    word: root.querySelector("#horseResultWord"),
    title: root.querySelector("#horseResultTitle"),
    meta: root.querySelector("#horseResultMeta"),
    letters: root.querySelector("#horseResultLetters"),
    rematch: root.querySelector("#horseResultRematch"),
    lobby: root.querySelector("#horseResultLobby"),
  };
  const ballPicker = createTurnBallPicker(root.querySelector("#horseBallChoices"), {
    onSelect: selectTurnBall,
  });
  const onlineWordInput = root.querySelector("#horseOnlineWordInput");

  onlineClient.subscribe(handleOnlineSnapshot);
  root.querySelector("#horseOnlineQuick")?.addEventListener("click", () => onlineClient.findQuickMatch(word));
  root.querySelector("#horseOnlineCreate")?.addEventListener("click", () => onlineClient.createPrivateRoom(word));
  root.querySelector("#horseOnlineJoin")?.addEventListener("click", () => {
    onlineClient.joinPrivateRoom(root.querySelector("#horseOnlineRoomInput")?.value);
  });
  root.querySelector("#horseOnlineStart")?.addEventListener("click", () => onlineClient.startMatch());
  root.querySelector("#horseOnlineLeave")?.addEventListener("click", () => onlineClient.leave());
  root.querySelector("#horseOnlineRoomInput")?.addEventListener("input", (event) => {
    event.target.value = normalizeRoomCode(event.target.value);
  });
  onlineWordInput?.addEventListener("input", (event) => {
    const clean = String(event.target.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
    event.target.value = clean;
    word = clean;
    renderOnlineLobby();
  });

  buildTargetChips();
  buildMotionChips();

  results.rematch?.addEventListener("click", () => { audio.click(); newMatch(); });
  // Online, a rematch is the LOBBY's to arrange — the other player has to agree,
  // and the room they agreed to last time has finished. Dealing a second match
  // here would be one this device alone believed in.
  results.lobby?.addEventListener("click", () => {
    audio.click();
    onlineClient.leave();
    newMatch();
  });
  el.confirm?.addEventListener("click", () => { audio.click(); confirmPlacement(); });
  for (const button of root.querySelectorAll('[data-intent="leave-horse"]')) {
    button.addEventListener("click", () => onLeave());
  }
  el.motions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button || !isPlacing()) return;
    audio.click();
    setWorking({ motionId: button.dataset.value });
  });
  // THE TARGET IS THE FIRST DECISION OF A TURN, not a variant of the motion —
  // it decides which motion catalog the chips below are even built from, so it
  // is its own row above them rather than a ninth chip among them.
  el.targets?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button || !isPlacing()) return;
    audio.click();
    setWorking({ kind: button.dataset.value });
  });
  // The on-screen nudges. THESE ARE THE PRIMARY PLACEMENT CONTROL, not a
  // fallback: the keys below are a desktop accelerant, and a cabinet that can
  // only be placed with WASD is a cabinet that cannot be played on a phone —
  // which the rest of this game very deliberately can be.
  root.querySelector("#horseNudges")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-nudge]");
    if (!button || !isPlacing()) return;
    audio.click();
    nudge(button.dataset.nudge);
  });
  // One listener on the placement panel keeps the expandable tray's controls
  // live as a single unit. It also makes the DOM contract explicit through
  // data attributes, instead of duplicating a selector/listener per tool.
  el.place?.addEventListener("click", (event) => {
    if (!isPlacing()) return;
    const pieceButton = event.target.closest("[data-horse-piece]");
    if (pieceButton) {
      audio.click();
      addPiece(pieceButton.dataset.horsePiece);
      return;
    }
    const action = event.target.closest("[data-horse-tool-action]")?.dataset.horseToolAction;
    if (action === "use-saved") {
      audio.click();
      useSavedShot(el.savedShots?.value);
    } else if (action === "remove") {
      audio.click();
      removeSelectedPiece();
    }
  });
  for (const [node, field] of [
    [el.toolDepth, "depth"],
    [el.toolDirection, "direction"],
    [el.toolAngle, "angle"],
    [el.toolPower, "power"],
    [el.toolDelay, "delay"],
  ]) {
    node?.addEventListener("input", (event) => updateSelectedPiece(field, Number(event.target.value)));
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(canvas, event);
    if (isPlacing()) {
      placingPointerId = event.pointerId;
      canvas.setPointerCapture?.(placingPointerId);
      const control = sandboxPieceControlAtPoint(workingPieces, point, selectedPieceId);
      const piece = sandboxPieceAtPoint(workingPieces, point);
      const target = placementTargetNow();
      if (control?.action === "delete") {
        selectedPieceId = control.piece.id;
        removeSelectedPiece();
        placingPointerId = null;
      } else if (control?.action === "depth") {
        selectedPieceId = control.piece.id;
        placingPointerMode = "piece-depth";
        const floor = projectPoint({ x: control.piece.x, y: 0, z: control.piece.z });
        pieceDragOffset = { x: point.x - floor.x, y: point.y - floor.y };
      } else if (piece) {
        selectedPieceId = piece.id;
        placingPointerMode = "piece";
        const centre = projectPoint({ x: piece.x, y: piece.y, z: piece.z });
        pieceDragOffset = { x: point.x - centre.x, y: point.y - centre.y };
        syncToolInspector();
      } else if (binDepthHandleAt(target, point)) {
        turnClock = 0;
        placingPointerMode = "bin-depth";
        const floor = projectPoint({ x: workingTarget.placement.x, y: 0, z: workingTarget.placement.z });
        pieceDragOffset = { x: point.x - floor.x, y: point.y - floor.y };
        selectedPieceId = null;
        syncToolInspector();
      } else if (trickShotTargetAtPoint(target, point)) {
        turnClock = 0;
        placingPointerMode = "target";
        selectedPieceId = null;
        syncToolInspector();
        dragTargetTo(point);
      } else {
        placingPointerMode = null;
        selectedPieceId = null;
        syncToolInspector();
      }
      event.preventDefault();
      return;
    }
    if (!canHumanShoot()) return;
    const screenBall = screenBallPosition();
    if (!isGrab(point, screenBall)) return;
    pointerId = event.pointerId;
    grabOffset = { x: point.x - screenBall.x, y: point.y - screenBall.y };
    pull = neutralPull(screenBall);
    el.hint?.classList.add("is-hidden");
    syncBallPicker();
    canvas.setPointerCapture?.(pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (placingPointerId !== null && event.pointerId === placingPointerId) {
      movePlacementPointer(canvasPoint(canvas, event));
      event.preventDefault();
      return;
    }
    if (!pull || event.pointerId !== pointerId) return;
    const point = canvasPoint(canvas, event);
    pull = resolvePull({ x: pull.anchorX, y: pull.anchorY }, { x: point.x - grabOffset.x, y: point.y - grabOffset.y });
    setPower(pull.power);
    event.preventDefault();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (placingPointerId !== null && event.pointerId === placingPointerId) {
      placingPointerId = null;
      placingPointerMode = null;
      event.preventDefault();
      return;
    }
    if (!pull || event.pointerId !== pointerId) return;
    const point = canvasPoint(canvas, event);
    pull = resolvePull({ x: pull.anchorX, y: pull.anchorY }, { x: point.x - grabOffset.x, y: point.y - grabOffset.y });
    const released = pull;
    pull = null;
    pointerId = null;
    if (isShootablePull(released)) launchFromPull(released);
    else setPower(0);
    syncBallPicker();
    event.preventDefault();
  });

  canvas.addEventListener("pointercancel", () => {
    pull = null;
    pointerId = null;
    placingPointerId = null;
    placingPointerMode = null;
    setPower(0);
    syncBallPicker();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  /**
   * The keyboard accelerant.
   *
   * Bound on the root rather than the window, and gated on this screen being the
   * live one, so the cabinet's own keys (pause, back) are untouched everywhere
   * else. Arrows and WASD do the same thing on purpose — neither is more correct
   * and a player should not have to find out which one this cabinet chose.
   */
  function handleKey(event) {
    if (!active || !isPlacing()) return false;
    const nudged = {
      ArrowUp: "deeper", KeyW: "deeper",
      ArrowDown: "nearer", KeyS: "nearer",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      KeyQ: "lower", KeyE: "higher",
      PageDown: "lower", PageUp: "higher",
    }[event.code];
    if (nudged) {
      nudge(nudged);
      return true;
    }
    if (event.code === "Enter" || event.code === "Space") {
      confirmPlacement();
      return true;
    }
    return false;
  }

  function isPlacing() {
    return phase === PHASE_PLACING && isMyTurn() && !flight && !awaitingServer;
  }

  function canHumanShoot() {
    return phase === PHASE_AIMING && isMyTurn() && !flight && !awaitingServer && Boolean(activeSetup);
  }

  /** Is the shot on offer this device's to take? Online, that is a seat. */
  function isMyTurn() {
    return match?.status === "playing" && isHumanControlledTurn(match, seat);
  }

  /**
   * Move the working target to a canvas point.
   *
   * A BIN IS DRAGGED IN THE ROOM AND A HOOP IS DRAGGED ON THE GLASS, and that is
   * the difference in placement spaces showing through at the one place a player
   * can feel it. The bin's screen point has to be converted back to a world point
   * at the depth it is standing at, because moving it up the canvas at a fixed
   * depth means raising it. The hoop's placement IS a screen point — it hangs on
   * the wall at the one depth there is — so the pointer position is the answer
   * with no conversion at all, and none of the projection's rounding either.
   */
  function dragTargetTo(point) {
    if (workingTarget.kind === HOOP_TARGET) {
      setWorking({ cx: point.x, rimY: point.y });
      return;
    }
    const world = screenToWorldAtZ(point.x, point.y, workingTarget.placement.z);
    setWorking({ x: world.x, y: world.y });
  }

  /** The working target as the renderer and the hit tests see it, right now. */
  function placementTargetNow() {
    return horseTargetAt(workingTarget, turnClock);
  }

  function movePlacementPointer(point) {
    if (placingPointerMode === "target") {
      dragTargetTo(point);
      return;
    }
    // Bin only. `binDepthHandleAt` answers false for a hoop, which has no depth
    // to choose and therefore no second drag to separate from the first.
    if (placingPointerMode === "bin-depth") {
      const world = screenToWorldOnFloor(point.x - pieceDragOffset.x, point.y - pieceDragOffset.y);
      setWorking({ x: world.x, z: world.z });
      return;
    }
    const piece = workingPieces.find((candidate) => candidate.id === selectedPieceId);
    if (!piece) return;
    if (placingPointerMode === "piece-depth") {
      const world = screenToWorldOnFloor(point.x - pieceDragOffset.x, point.y - pieceDragOffset.y);
      replaceSelectedPiece({ x: world.x, z: world.z });
    } else if (placingPointerMode === "piece") {
      const world = screenToWorldAtZ(point.x - pieceDragOffset.x, point.y - pieceDragOffset.y, piece.z);
      replaceSelectedPiece({ x: world.x, y: world.y });
    }
    syncToolInspector();
    draw();
  }

  function uniquePieceId(type) {
    let id;
    do { id = `horse-${type}-${++pieceSerial}`; }
    while (workingPieces.some((piece) => piece.id === id));
    return id;
  }

  function addPiece(type) {
    if (!isPlacing() || workingPieces.length >= MAX_SANDBOX_PIECES) return false;
    const count = workingPieces.length;
    const piece = createSandboxPiece(type, {
      id: uniquePieceId(type),
      x: ((count % 5) - 2) * 0.26,
      y: type === CANNON_PIECE ? 0.3 : 0.6 + (count % 3) * 0.24,
      z: 0.28 + (count % 4) * 0.18,
      angle: type !== CANNON_PIECE ? -0.18 + (count % 3) * 0.18 : undefined,
    });
    if (!piece) return false;
    workingPieces = [...workingPieces, piece];
    selectedPieceId = piece.id;
    currentSavedShotId = "";
    syncPlacementPanel();
    draw();
    return true;
  }

  function replaceSelectedPiece(changes) {
    workingPieces = workingPieces.map((piece) => piece.id === selectedPieceId
      ? createSandboxPiece(piece.type, { ...piece, ...changes }, piece.id)
      : piece);
    currentSavedShotId = "";
  }

  function updateSelectedPiece(field, value) {
    if (!isPlacing() || !selectedPieceId) return;
    const piece = workingPieces.find((candidate) => candidate.id === selectedPieceId);
    if (!piece) return;
    if (field === "depth") replaceSelectedPiece({ z: value / 100 });
    else if (field === "direction") replaceSelectedPiece({ yaw: value * Math.PI / 180 });
    else if (field === "angle") replaceSelectedPiece(isPadPiece(piece)
      ? { angle: value * Math.PI / 180 }
      : { pitch: value * Math.PI / 180 });
    else if (field === "power") replaceSelectedPiece(isPadPiece(piece)
      ? (piece.type === BOARD_PIECE ? { restitution: value } : { speed: value })
      : { speed: value });
    else if (field === "delay") replaceSelectedPiece({ delay: value });
    syncToolInspector();
    draw();
  }

  function removeSelectedPiece() {
    if (!selectedPieceId) return false;
    const next = workingPieces.filter((piece) => piece.id !== selectedPieceId);
    if (next.length === workingPieces.length) return false;
    workingPieces = next;
    selectedPieceId = null;
    currentSavedShotId = "";
    syncToolInspector();
    draw();
    return true;
  }

  /**
   * The Lab layouts a HORSE setter may set.
   *
   * EVERY ONE OF THEM, NOW. This used to filter the bank down to bin layouts,
   * because a HORSE bin was the only target the mode had — a saved hoop layout
   * was silently missing from a list the player had authored it into, which is
   * the worst shape a filter can take. HORSE places both kinds, so it offers
   * both, and the bank is a bank rather than half of one.
   */
  function savedShots() {
    return store.list();
  }

  function useSavedShot(id) {
    if (!isPlacing()) return false;
    const saved = store.get(id);
    if (!saved) return false;
    adoptTarget(saved.target);
    workingPieces = normalizeSandboxPieces(saved.pieces);
    currentLocationId = saved.locationId;
    currentSavedShotId = saved.id;
    selectedPieceId = workingPieces[0]?.id || null;
    turnBalls[match.turn] = normalizeTurnBallId(saved.ballId);
    assets.backdrop(currentLocationId);
    assets.ballFrames(turnBalls[match.turn]);
    assets.ballSplats(turnBalls[match.turn]);
    turnClock = 0;
    syncPlacementPanel();
    syncBallPicker();
    draw();
    return true;
  }

  /**
   * One step of a key or an on-screen stepper.
   *
   * The six directions mean the same thing to a player whichever target is up,
   * and they land on different axes underneath: a bin moves through the room, a
   * hoop slides on the wall. DEPTH IS THE ONE THAT DOES NOT SURVIVE THE HOOP —
   * there is no depth to choose there, so it is refused here as well as put away
   * in the panel, since the keys are a second route to the same control and a
   * key that silently did nothing would read as a broken key.
   */
  function nudge(direction) {
    if (workingTarget.kind === HOOP_TARGET) {
      // Screen y grows downward, so `higher` is a NEGATIVE step. This is the one
      // place in the cabinet a player-facing direction and its axis disagree.
      const step = {
        left: { cx: -NUDGE_HOOP_X },
        right: { cx: NUDGE_HOOP_X },
        higher: { rimY: -NUDGE_HOOP_Y },
        lower: { rimY: NUDGE_HOOP_Y },
      }[direction];
      if (!step) return;
      setWorking({
        cx: workingTarget.placement.cx + (step.cx || 0),
        rimY: workingTarget.placement.rimY + (step.rimY || 0),
      });
      return;
    }
    const step = {
      deeper: { z: NUDGE_DEPTH },
      nearer: { z: -NUDGE_DEPTH },
      left: { x: -NUDGE_LATERAL },
      right: { x: NUDGE_LATERAL },
      higher: { y: NUDGE_HEIGHT },
      lower: { y: -NUDGE_HEIGHT },
    }[direction];
    if (!step) return;
    const { x, y, z } = workingTarget.placement;
    setWorking({ x: x + (step.x || 0), y: y + (step.y || 0), z: z + (step.z || 0) });
  }

  /**
   * Apply a change to the working target, re-clamped.
   *
   * EVERY route into the placement goes through here, so there is one place the
   * legal volume is enforced and no caller has to remember to clamp. Changing
   * the motion re-clamps the position too, because a motion's sweep is
   * subtracted from the volume — pick Left / Right while parked against the end
   * of the wall and the target steps in far enough for its whole run to fit.
   *
   * A `kind` in the change is a target SWAP and goes through `adoptTarget`, which
   * is the only thing that knows the two kinds remember separate answers. A
   * placement patch is otherwise merged onto the current kind's own placement, so
   * a caller passing `{ x }` while a hoop is up is passing a field the hoop's
   * clamp does not read — it keeps its position rather than being handed a
   * translation of somebody else's.
   */
  function setWorking(change = {}) {
    if (change.kind !== undefined && trickShotTargetKind(change.kind) !== workingTarget.kind) {
      adoptTarget({ ...change, kind: change.kind });
      return;
    }
    const { kind, motionId, placement, ...patch } = change;
    adoptTarget({
      kind: workingTarget.kind,
      motionId: motionId !== undefined ? motionId : workingTarget.motionId,
      placement: { ...workingTarget.placement, ...placement, ...patch },
    });
  }

  /**
   * Take a whole target record — a kind, a motion and a placement — and make it
   * the working one, remembering it per kind on the way through.
   *
   * A SWAP FALLS BACK TO WHAT THAT KIND WAS LAST SET TO, never to a translation
   * of the target being left behind: the two motion catalogs do not share ids and
   * the two placements do not share a shape, so there is nothing to carry across
   * and a guess would be worse than a memory.
   *
   * THE MOTION CLOCK RESTARTS HERE. A motion is an offset from where the target
   * was placed, so the preview has to run from the top or a player is deciding
   * whether they like a sweep by watching its middle. Same rule the Lab keeps
   * when it adopts a target, and the same one `beginTurn` keeps for a turn.
   */
  function adoptTarget(input) {
    const kind = trickShotTargetKind(input?.kind);
    workingTarget = normalizeTrickShotTarget({
      kind,
      motionId: input?.motionId ?? rememberedMotion[kind],
      placement: input?.placement || rememberedPlacement[kind],
    });
    rememberedMotion[kind] = workingTarget.motionId;
    rememberedPlacement[kind] = workingTarget.placement;
    currentSavedShotId = "";
    // Watching a motion you have just chosen is most of how you decide whether
    // you want it, so the preview runs on the same clock the shot will.
    turnClock = 0;
    // THE WHOLE PANEL, not just the placement half. Swapping the target changes
    // the court hint and the meter legend as well, because a hoop takes a
    // different gesture and is arranged with a different set of steppers — and
    // those two live in `syncPanels`. Syncing only the placement rows left the
    // court telling a player to drag a bin at a hoop they had just hung.
    syncPanels();
    draw();
  }

  /** Where a turn's arranging starts: the bin, on the floor, still. */
  function defaultWorkingTarget() {
    return normalizeTrickShotTarget({
      kind: BIN_TARGET,
      motionId: "still",
      placement: defaultTrickShotPlacement(BIN_TARGET),
    });
  }

  function confirmPlacement() {
    if (!isPlacing()) return;
    activePieces = normalizeSandboxPieces(workingPieces);
    activeSetup = {
      ...normalizeTrickShotTarget(workingTarget),
      pieces: activePieces,
      locationId: currentLocationId,
      savedShotId: currentSavedShotId,
    };
    resetTrickShotPhysics(piecePhysics);
    clearTrickShotImpacts(impacts);
    // The server clamps it again through this very function before anybody
    // shoots at it, so the two copies of the bin cannot disagree.
    if (mode === "online") onlineClient.submitPlacement(activeSetup);
    phase = PHASE_AIMING;
    turnClock = 0;
    syncPanels();
    syncStatus();
    draw();
  }

  function newMatch() {
    match = createHorseMatch({
      mode,
      word,
      startingPlayer: 0,
    });
    // ONLINE, NOTHING IS PLAYING UNTIL THE SERVER SAYS SO. The local object is a
    // placeholder for the letter board to draw; every field on it is replaced
    // wholesale by the first authoritative snapshot.
    if (mode === "online") match.status = "waiting";
    seat = 0;
    pendingState = null;
    appliedSequence = -1;
    seenSequence = -1;
    awaitingServer = false;
    turnBalls = [DEFAULT_BALL, DEFAULT_BALL];
    loserPopupRemaining = 0;
    loserPopupPlayed = false;
    hideLoserPopup();
    lastContactAt.clear();
    clearSplatField(splats);
    clearFlameTrail(trail);
    clearTrickShotImpacts(impacts);
    resetTrickShotPhysics(piecePhysics);
    workingTarget = defaultWorkingTarget();
    rememberedMotion[HOOP_TARGET] = defaultTrickShotMotion(HOOP_TARGET);
    rememberedMotion[BIN_TARGET] = "still";
    rememberedPlacement[HOOP_TARGET] = defaultHoopPlacement();
    rememberedPlacement[BIN_TARGET] = defaultPlacement();
    workingPieces = [];
    activePieces = [];
    selectedPieceId = null;
    currentLocationId = ROOM_ID;
    currentSavedShotId = "";
    activeSetup = null;
    flight = null;
    pull = null;
    resetBall(ball);
    setPower(0);
    hideResults();
    beginTurn();
    onShowLobby(mode === "online");
    renderOnlineLobby();
    if (el.modeLabel) {
      el.modeLabel.textContent = mode === "local"
        ? "Local Hotseat"
        : mode === "online" ? "Online Match" : `Vs CPU · ${horseDifficultyById(difficulty).label}`;
    }
    draw();
  }

  /**
   * Start whoever's turn it now is.
   *
   * The motion clock resets here and nowhere else. Both halves of a matched
   * shot therefore start from the same phase of the same path, which is what
   * makes "the same shot" a true statement about a moving bin rather than a
   * roughly similar one.
   */
  function beginTurn() {
    turnClock = 0;
    resetBall(ball);
    setPower(0);
    if (mode === "online") {
      beginOnlineTurn();
      return;
    }
    if (canPlaceBin(match)) {
      phase = PHASE_PLACING;
      activeSetup = null;
      activePieces = [];
    } else {
      // Through the rules' own seam, not by reading `standingShot` directly:
      // "what am I shooting at" is a rule, and the answer for a matcher is the
      // setter's bin whatever this player had arranged.
      phase = PHASE_AIMING;
      activeSetup = shotSetupFor(match, workingTarget);
      activePieces = normalizeSandboxPieces(activeSetup?.pieces);
      currentLocationId = activeSetup?.locationId || currentLocationId;
    }
    resetTrickShotPhysics(piecePhysics);
    clearTrickShotImpacts(impacts);
    cpuDelay = isHumanControlledTurn(match) ? 0 : 0.9;
    el.hint?.classList.toggle("is-hidden", !isHumanControlledTurn(match));
    syncPanels();
    syncStatus();
  }

  function currentTurnBallId() {
    return horseTurnBallId(match, turnBalls);
  }

  function canChooseBall() {
    return match?.phase === PHASE_SET && isMyTurn() && !flight && !awaitingServer && !pull;
  }

  function selectTurnBall(ballId) {
    if (!canChooseBall()) return;
    turnBalls[match.turn] = normalizeTurnBallId(ballId);
    assets.ballFrames(turnBalls[match.turn]);
    assets.ballSplats(turnBalls[match.turn]);
    audio.click();
    syncBallPicker();
    draw();
  }

  function syncBallPicker() {
    // THE BALL IS A PHASE-TWO DECISION. While the bin is still being arranged
    // the player is choosing a target, not a shot, and the picker is put away —
    // which is also what lets `--chrome` for `is-placing` be as small as it is.
    if (el.ballPanel) el.ballPanel.hidden = isPlacing();
    if (el.ballLabel) {
      el.ballLabel.textContent = match?.phase === PHASE_MATCH ? "MATCHING WITH SET BALL" : "BALL FOR SET SHOT";
    }
    ballPicker.render({ ballId: currentTurnBallId(), enabled: canChooseBall() });
  }

  /**
   * The same job online, where the other hand is on another machine.
   *
   * PLACING IS THE ONE PHASE THAT IS LOCAL. Only the player whose turn it is
   * arranges a bin, so the opponent has nothing to draw until their placement
   * arrives — `activeSetup` stays null and the court is honestly empty rather
   * than showing a bin nobody has chosen yet.
   */
  function beginOnlineTurn() {
    const mine = isMyTurn();
    if (canPlaceBin(match) && mine) {
      phase = PHASE_PLACING;
      activeSetup = null;
    } else {
      phase = PHASE_AIMING;
      activeSetup = match?.phase === PHASE_MATCH
        ? match.standingShot
        : (mine ? activeSetup : pendingOnlineSetup);
    }
    activePieces = normalizeSandboxPieces(activeSetup?.pieces);
    if (activeSetup?.locationId) currentLocationId = activeSetup.locationId;
    resetTrickShotPhysics(piecePhysics);
    cpuDelay = 0;
    el.hint?.classList.toggle("is-hidden", !mine);
    syncPanels();
    syncStatus();
  }

  function launchFromPull(released) {
    if (flight || !activeSetup) return;
    const selectedBallId = currentTurnBallId();
    // ONLINE, THE PULL GOES UP THE WIRE AND THE OUTCOME COMES BACK. This court
    // still plays the shot out — it is running the same sim the server replays
    // it through, so the two agree — but it does not rule on it.
    if (mode === "online") {
      awaitingServer = true;
      onlineClient.submitShot({
        power: released.power,
        aimX: released.aimX,
        loft: released.loft,
        // The phase of the bin's motion at release. Choosing it is the skill;
        // the server rules on the moment the player actually picked.
        motionSeconds: turnClock,
        expectedShots: match.shots,
        ballId: selectedBallId,
      });
    }
    const shot = createHorseShot(released, ball, activeSetup, { weight: ballFlight(selectedBallId).weight });
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(selectedBallId);
    // The pull, kept with the flight it started. A setter's make records it on
    // the standing shot, so a shot through an apparatus can be repeated by
    // whoever owes it — see `sim/horse-cpu.js`.
    flight = {
      ballId: selectedBallId,
      age: 0,
      resolved: false,
      resetIn: null,
      capturedBin: null,
      made: false,
      touched: [],
      pull: { power: released.power, aimX: released.aimX, loft: released.loft, motionSeconds: turnClock },
    };
    setPower(released.power);
    syncStatus();
    syncPanels();
  }

  /**
   * The CPU's turn.
   *
   * Its shot LEADS a moving bin rather than aiming at where the bin is now: it
   * solves once to learn the flight time, asks the motion where the bin will be
   * when the ball gets there, and aims at that. Without it the CPU would be
   * comically bad at exactly the setups it had just chosen for itself.
   */
  function startCpuShot() {
    const setup = activeSetup;
    if (!setup) return;
    // A SHOT WITH A DUTY IS REPEATED, NOT SOLVED. No lead finds a route off a
    // springboard and through a cannon, so the CPU takes the pull the setter
    // proved — at the same phase of the same sweep, which means waiting for it.
    // Asked before the difficulty roll, or the roll would be re-taken every tick
    // of that wait and the easy CPU would eventually roll a make.
    if (needsProvenPull(setup) && turnClock < provenPullPhase(setup)) return;
    const makes = cpuMakesHorseShot(difficulty, random);
    const stray = () => (random() < 0.5 ? -1 : 1);
    const proven = provenPullShot(setup, { makes, stray });
    if (proven) {
      launchFromPull(proven.pull);
      return;
    }
    if (setup.kind === HOOP_TARGET) {
      startCpuHoopShot(setup, makes, stray);
      return;
    }
    const rest = placedBinAt(setup, turnClock);
    const provisional = createHorseShot(
      { power: horsePowerForDepth(rest.z), aimX: projectPoint(rest).x, loft: 1 },
      ball,
      setup,
      { weight: ballFlight(currentTurnBallId()).weight },
    );
    const lead = placedBinAt(setup, turnClock + Math.max(0, provisional.launch.flightTime));
    const target = projectPoint({ x: lead.x, y: lead.topY, z: lead.z });
    launchFromPull({
      power: horsePowerForDepth(lead.z) + (makes ? 0 : stray() * 0.06),
      aimX: target.x + (makes ? 0 : stray() * 95),
      loft: 1,
    });
  }

  /**
   * The CPU shooting at a placed hoop.
   *
   * Its own function because the two targets take two different gestures, so a
   * CPU aiming at one is not the CPU aiming at the other with a field swapped:
   * strength here is POWER and the reference pull is the one that lands on the
   * reticle, where at a bin strength is depth and the launch is solved at the
   * reference regardless. What both share is the LEAD — it solves once to learn
   * the flight time, asks the motion where the rim will be when the ball gets
   * there, and aims at that. Without it the CPU is comically bad at exactly the
   * setups it has just chosen for itself.
   */
  function startCpuHoopShot(setup, makes, stray) {
    const weight = ballFlight(currentTurnBallId()).weight;
    const provisional = createHorseShot(
      { power: REFERENCE_POWER, aimX: placedHoopAt(setup, turnClock).cx, loft: 1 },
      ball,
      setup,
      { weight },
    );
    const lead = placedHoopAt(setup, turnClock + Math.max(0, provisional.launch.flightTime));
    launchFromPull({
      power: REFERENCE_POWER + (makes ? 0 : stray() * 0.09),
      aimX: lead.cx + (makes ? 0 : stray() * 70),
      loft: 1,
    });
  }

  /**
   * The CPU arranging a target of its own.
   *
   * FOUR DECISIONS, IN THE ORDER A PERSON MAKES THEM: which target, which
   * motion, where it stands, and which ball. The kind comes first because it
   * decides which catalog the motion is drawn from, and it is unlocked by
   * boldness exactly as the motions and the balls are — a timid CPU stays on the
   * bin a new player has been learning, and a braver one will hang the hoop.
   */
  function startCpuPlacement() {
    const kind = chooseCpuTargetKind(difficulty, random, [BIN_TARGET, HOOP_TARGET]);
    // The ball is the fourth thing a setter chooses, and it travels with the
    // shot — so the CPU has to make that choice too or every shot it ever sets is
    // a basketball. Picked here rather than at release, because it is part of the
    // setup and the picker has to be able to report it while the CPU lines up.
    selectCpuTurnBall();
    if (kind === HOOP_TARGET) {
      const choice = chooseCpuBinSetup(difficulty, random, HOOP_MODES.map(({ id }) => id));
      const motionId = hoopModeById(choice.motionId).id;
      workingTarget = normalizeTrickShotTarget({
        kind: HOOP_TARGET,
        motionId,
        placement: hoopPlacementFromFractions(
          { lateral: choice.lateral, height: choice.depth },
          motionId,
        ),
      });
    } else {
      const choice = chooseCpuBinSetup(difficulty, random, BIN_MOTIONS.map(({ id }) => id));
      const motionId = binMotionById(choice.motionId).id;
      workingTarget = normalizeTrickShotTarget({
        kind: BIN_TARGET,
        motionId,
        placement: placementFromFractions(choice, motionId),
      });
    }
    rememberedMotion[workingTarget.kind] = workingTarget.motionId;
    rememberedPlacement[workingTarget.kind] = workingTarget.placement;
    activeSetup = { ...workingTarget, pieces: [], locationId: currentLocationId };
    activePieces = [];
    phase = PHASE_AIMING;
    turnClock = 0;
    cpuDelay = 0.85;
    syncPanels();
    syncStatus();
  }

  /** The CPU's own ball choice, through the same per-seat slot a person uses. */
  function selectCpuTurnBall() {
    const ballId = normalizeTurnBallId(chooseCpuTurnBall(difficulty, random, BALLS.map(({ id }) => id)));
    turnBalls[match.turn] = ballId;
    // Warm the art before the shot rather than on the frame it launches.
    assets.ballFrames(ballId);
    assets.ballSplats(ballId);
  }

  function tick() {
    elapsed += TICK_SECONDS;
    tickLoserPopup();
    tickSplatField(splats, TICK_SECONDS);
    tickFlameTrail(trail, TICK_SECONDS, { random });
    tickTrickShotImpacts(impacts, TICK_SECONDS);
    // The bin's own clock runs whenever a shot is set, INCLUDING while the
    // player is still lining up their pull — so a moving bin can be watched
    // before anyone commits, exactly like the classic cabinet's moving rim.
    if (activeSetup || isPlacing()) turnClock += TICK_SECONDS;

    if (flight) {
      tickFlight();
      return;
    }
    // The opponent is a person on another machine; there is no CPU to run.
    if (mode === "online" || match.status !== "playing" || isHumanControlledTurn(match)) return;

    cpuDelay -= TICK_SECONDS;
    if (cpuDelay > 0) return;
    if (phase === PHASE_PLACING) startCpuPlacement();
    else startCpuShot();
  }

  function tickFlight() {
    flight.age += TICK_SECONDS;
    // Resolved ONCE per tick, like `worldFor` in the classic cabinet: within a
    // single tick the target is treated as moving at a constant velocity, which
    // is what keeps the substeps consistent with each other.
    const target = horseTargetAt(activeSetup, turnClock);
    const bin = target.bin;
    // EXACTLY ONE INTEGRATOR RUNS PER SUBSTEP. `stepBall` and
    // `stepBallAgainstBins` are both COMPLETE — each owns gravity, drag, the room
    // and its own target — so which one runs is the whole of what choosing a
    // target means down here. Running both would apply gravity twice.
    const world = target.hoop ? worldFor(target.hoop) : null;

    if (!flight.resolved) {
      const contacts = new Set();
      let splat = null;
      let scored = false;
      const substeps = Math.max(1, Math.ceil(TICK_SECONDS / PHYSICS_SUBSTEP_SECONDS));
      const dt = TICK_SECONDS / substeps;
      for (let index = 0; index < substeps; index++) {
        const previous = { x: ball.x, y: ball.y, z: ball.z };
        if (!piecePhysics.capture) {
          const result = world
            ? stepBall(ball, world, dt, { ballId: flight.ballId, alreadyScored: false })
            : stepBallAgainstBins(ball, [bin], dt, {
              ballId: flight.ballId,
              capturedBin: flight.capturedBin,
            });
          if (!world && result.capturedBin !== null) flight.capturedBin = result.capturedBin;
          if (world ? result.scored : result.scoredBin !== null) scored = true;
          if (result.splat) splat = result.splat;
          for (const contact of result.contacts) contacts.add(contact);
        }

        const pieceStep = ball.splat || flight.capturedBin !== null
          ? { contacts: [], impacts: [] }
          : stepTrickShotPieces(ball, previous, activePieces, piecePhysics, dt);
        for (const contact of pieceStep.contacts) contacts.add(contact);
        for (const impact of pieceStep.impacts || []) addTrickShotImpact(impacts, impact);
        // WHICH tools this shot used, and only up to the moment it scored. A
        // ball that has already dropped through can still clip a pad on the way
        // down, and crediting that would hand a matcher a tool they touched
        // after the shot was over. `sim/horse-replay.js` is gated the same way,
        // which is what keeps this court and the server's ruling on one answer.
        if (!scored) for (const id of pieceStep.touched || []) flight.touched.push(id);
      }
      emitFlameTrail(trail, { ...ball, dt: TICK_SECONDS, style: ballTrail(flight.ballId), random });
      ignite([...contacts], flight.ballId);
      if (splat) {
        addSplat(splats, { ...splat, ballId: flight.ballId, ...ballSplat(flight.ballId), random });
        audio.splat(splat.surface, { ballId: flight.ballId, speed: splat.speed });
      }
      announce([...contacts], splat);

      if (scored) {
        finishShot(true);
      } else if (flight.age > MAX_HORSE_SHOT_SECONDS
        || (!piecePhysics.capture && flight.age > 0.45 && isBallSettled(ball))) {
        finishShot(false);
      }
      return;
    }

    // THE BALL KEEPS FALLING AFTER THE RULING, and both kinds need saying. A bin
    // that has swallowed the ball goes on pushing it down its own axis so it
    // visibly sinks away; a hoop needs the room to carry on existing or a made
    // shot would hang in the net, frozen, for the whole of the hold. The hoop's
    // colliders are suppressed with `alreadyScored` — a ball dropping through is
    // past them, and letting the rim have another say would kick it back out.
    if (world) {
      stepBall(ball, world, TICK_SECONDS, { ballId: flight.ballId, alreadyScored: flight.made });
    } else if (flight.capturedBin !== null) {
      stepBallAgainstBins(ball, [bin], TICK_SECONDS, { ballId: flight.ballId, capturedBin: flight.capturedBin });
    }
    flight.resetIn -= TICK_SECONDS;
    if (flight.resetIn <= 0) {
      flight = null;
      if (mode === "online") applyServerState();
      else if (match.status === "playing") beginTurn();
      else {
        // The match is over. `beginTurn` is what normally empties the meter, and
        // there is no next turn — so a finished match kept the winning pull's
        // reading on the rail underneath its own results card.
        setPower(0);
        syncPanels();
      }
    }
  }

  /**
   * The ball has finished. Two different questions follow and they are kept
   * apart deliberately.
   *
   * `scored` is what the BALL did — it went through, or it did not — and the
   * animation belongs to it: a ball that dropped in needs the sink time and
   * needs `alreadyScored`, or the rim it is falling through gets another say
   * and kicks it back out. `judged` is what the RULES make of that, and a make
   * that skipped one of the setter's tools is not one.
   */
  function finishShot(scored) {
    const touched = [...new Set(flight.touched)];
    const judged = judgeHorseShot(match, { scored, touched });
    const made = judged.made;
    flight.resolved = true;
    flight.made = scored;
    flight.resetIn = scored ? 1.15 : 0.55;
    // A swish is a ball passing through a NET, and there is only one of those.
    // A bin has no net, so a made bin is the ball's own body at full weight with
    // the reward chime over it — `game-audio.js` owns which is which.
    // The REWARD chime answers the ruling, not the ball. A shot that went in
    // having skipped a tool has not scored, and a cheer over it would be the
    // court telling the player the opposite of what the status line says.
    if (made) {
      if (activeSetup?.kind === HOOP_TARGET) audio.scored(1);
      else audio.binScored(flight.ballId);
    } else audio.missed();

    // ONLINE THE RULES ARE THE SERVER'S. This court plays the ball out and says
    // what it saw; what it MEANT — the letter, the turn, the word — is read off
    // the authoritative snapshot when it lands.
    if (mode === "online") {
      const ruling = pendingState?.lastShot;
      if (ruling && pendingState) {
        if (pendingState.match?.status === "won") audio.celebrate();
        setStatus(narrate({ ...ruling, shooter: ruling.seat, accepted: true }, pendingState.match));
      } else {
        setStatus("Waiting for the ruling…");
      }
      return;
    }

    // The ball is part of a made setup. `resolveHorseShot` stores this object as
    // the standing shot, so the matcher inherits the bin, motion and ball in one
    // authoritative description.
    const outcome = resolveHorseShot(match, made, { ...activeSetup, ballId: flight.ballId }, {
      unmet: judged.unmet,
      touched,
      pull: flight.pull,
    });
    if (match.status === "won") audio.celebrate();
    setStatus(narrate(outcome));
    syncLetters();
  }

  /** What just happened, in one line. */
  function narrate(outcome, view = match) {
    if (!outcome?.accepted || !view) return "";
    const who = playerLabel(view, outcome.shooter).toUpperCase();
    if (view.status === "won") {
      return `${who} SPELLS ${view.word} · ${playerLabel(view, view.winner).toUpperCase()} WINS`;
    }
    if (outcome.kind === "set") return `${who} SETS THE SHOT · MATCH IT`;
    if (outcome.kind === "set-missed") return `${who} MISSED THEIR OWN SHOT · NO LETTER`;
    if (outcome.kind === "matched") return `${who} MATCHED IT · ${playerLabel(view, view.setter).toUpperCase()} SETS AGAIN`;
    const letter = view.word[view.players[outcome.shooter].letters - 1];
    // A ball that went cleanly in and still cost a letter reads as a bug unless
    // the line says which of the two misses it was.
    if (outcome.skipped) return `${who} SKIPPED THE TOOLS · LETTER ${letter}`;
    return `${who} MISSES · LETTER ${letter}`;
  }

  /** Turn this tick's contacts into sound. Debounced on the cabinet's own rule. */
  /**
   * Set alight whatever a burning ball just landed on.
   *
   * Beside `announce` rather than inside it, because the two answer different
   * questions on purpose: `announce` debounces, since a collider reports the
   * same contact every substep and the ear cannot take that. A fire is not
   * debounced on a clock at all — `addFire` refuses one that is already
   * burning where this one would go, which is a fact about the room rather than
   * about elapsed time, and is what lets a rolling ball leave a line of them.
   */
  function ignite(contacts, ballId) {
    const style = ballTrail(ballId);
    if (!style) return;
    for (const contact of new Set(contacts)) {
      if (addFire(trail, { ...ball, surface: contact, style, random })) audio.sizzle(ballId);
    }
  }

  function announce(contacts, splat = null) {
    for (const contact of contacts) {
      // The two made-basket announcements. Neither is a bump the room made, and
      // `finishShot` has already played the one that belongs to this target.
      if (contact === "bin-score" || contact === "score") continue;
      if (splat?.surface === contact) continue;
      if (contact !== "floor") {
        const last = lastContactAt.get(contact) ?? -Infinity;
        if (elapsed - last < CONTACT_DEBOUNCE_SECONDS) continue;
        lastContactAt.set(contact, elapsed);
      }
      if (contact === "sandbox-board" || contact === "sandbox-spring") {
        audio.contact("backboard", { ballId: flight?.ballId || currentTurnBallId(), speed: ball.vy });
      } else if (contact === "sandbox-cannon-catch") {
        audio.contact("rim", { ballId: flight?.ballId || currentTurnBallId(), speed: ball.vy });
      } else if (contact !== "sandbox-cannon-fire") {
        audio.contact(contact, { ballId: flight?.ballId || currentTurnBallId(), speed: ball.vy });
      }
    }
  }

  // ------------------------------------------------------------- the wire

  /**
   * A new word from the server.
   *
   * TWO THINGS ARRIVE HERE AND THEY ARE HANDLED DIFFERENTLY. A new `sequence` is
   * a shot that has been RULED ON: if this device did not take it, the shot is
   * replayed on this court from the setup and the release phase the server
   * recorded, so the player watches the ball that decided the letter rather than
   * being told about it. Anything else — a placement, a lobby change, a
   * reconnect — is applied straight away.
   *
   * Either way the state is HELD until the court is idle. A ruling applied
   * mid-flight would delete the ball out of the air.
   */
  function handleOnlineSnapshot(snapshot) {
    onlineSnapshot = snapshot;
    renderOnlineLobby();
    if (mode !== "online") return;
    const state = snapshot?.matchState;
    // No match is the lobby; a match is the court. Nothing is ever hidden in
    // place — same rule tic-tac-toe's two sections learned.
    onShowLobby(!state);
    if (!state) return;

    const index = (state.seats || []).findIndex(({ id }) => id === snapshot.clientId);
    if (index >= 0) seat = index;
    pendingState = state;
    pendingOnlineSetup = state.pendingSetup || null;

    const ruling = state.lastShot;
    const unseen = Boolean(ruling) && ruling.sequence > seenSequence;
    if (unseen && !flight && ruling.shooterId !== snapshot.clientId) {
      seenSequence = ruling.sequence;
      replayOpponentShot(ruling);
      return;
    }
    // Either this device took the shot and has already watched it, or the court
    // is busy and there is no room to replay it. Both take the state as read.
    if (unseen) seenSequence = ruling.sequence;
    if (!flight) applyServerState();
  }

  /** Take the held snapshot as the truth, and start whatever turn it describes. */
  function applyServerState() {
    const state = pendingState;
    // NOTHING TO APPLY MEANS STILL WAITING, not free to shoot again. Clearing
    // `awaitingServer` here would hand the court back between a shot leaving and
    // its ruling arriving, and the second shot would be refused by the server's
    // own duplicate guard while this court had already animated it.
    if (!state) {
      syncPanels();
      syncStatus();
      return;
    }
    pendingState = null;
    awaitingServer = false;
    // A shot was ruled on, or the turn itself moved: either way this is a new
    // turn and it starts from the top, with the motion clock back at zero.
    const advanced = state.sequence !== appliedSequence
      || match?.turn !== state.match.turn
      || match?.phase !== state.match.phase
      || match?.status !== state.match.status;
    appliedSequence = state.sequence;
    match = state.match;
    pendingOnlineSetup = state.pendingSetup || null;
    if (advanced) beginTurn();
    else {
      // A placement from the other side mid-turn: the bin appears, and its
      // motion starts running so it can be watched before anyone shoots.
      if (!isMyTurn() && pendingOnlineSetup) activeSetup = pendingOnlineSetup;
      activePieces = normalizeSandboxPieces(activeSetup?.pieces);
      if (activeSetup?.locationId) currentLocationId = activeSetup.locationId;
      syncPanels();
      syncStatus();
    }
    draw();
  }

  /**
   * Play the opponent's shot out on this court.
   *
   * It is the SERVER's record of the shot — their bin, their pull, and the phase
   * of the motion clock they released on — replayed through the same sim. So
   * both players watch the same ball do the same thing, and neither is watching
   * an animation invented to match a result.
   */
  function replayOpponentShot(ruling) {
    if (!ruling?.setup || !ruling.intent) return;
    const selectedBallId = normalizeTurnBallId(ruling.intent.ballId);
    if (ruling.seat === 0 || ruling.seat === 1) turnBalls[ruling.seat] = selectedBallId;
    activeSetup = ruling.setup;
    activePieces = normalizeSandboxPieces(activeSetup.pieces);
    currentLocationId = activeSetup.locationId || currentLocationId;
    resetTrickShotPhysics(piecePhysics);
    phase = PHASE_AIMING;
    turnClock = Math.max(0, Number(ruling.intent.motionSeconds) || 0);
    resetBall(ball);
    const shot = createHorseShot(ruling.intent, ball, activeSetup, { weight: ballFlight(selectedBallId).weight });
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(selectedBallId);
    flight = { ballId: selectedBallId, age: 0, resolved: false, resetIn: null, capturedBin: null, made: false, touched: [] };
    setPower(Number(ruling.intent.power) || 0);
    syncPanels();
    syncStatus();
  }

  function renderOnlineLobby() {
    if (!el.onlinePanel) return;
    const lobby = onlineSnapshot?.lobby;
    const identity = accountAccess.identity();
    const account = root.querySelector("#horseOnlineAccount");
    if (account) account.textContent = identity?.displayName || "Factory Player";
    const code = root.querySelector("#horseOnlineRoomCode");
    if (code) code.textContent = lobby?.roomCode || "-----";
    const wordOut = root.querySelector("#horseOnlineWord");
    if (wordOut) wordOut.textContent = normalizeWord(lobby?.word || word);
    if (onlineWordInput) {
      if (document.activeElement !== onlineWordInput) onlineWordInput.value = lobby?.word || word || "";
      onlineWordInput.disabled = Boolean(lobby);
    }
    const lobbyPanel = root.querySelector("#horseOnlineLobby");
    const pairing = root.querySelector("#horseOnlinePairing");
    if (lobbyPanel) lobbyPanel.hidden = !lobby;
    if (pairing) pairing.hidden = Boolean(lobby);

    const players = root.querySelector("#horseOnlinePlayers");
    if (players) {
      const rows = lobby?.players?.length ? lobby.players : [{ name: identity?.displayName || "You" }];
      players.replaceChildren(...[0, 1].map((index) => {
        const row = document.createElement("span");
        row.textContent = rows[index]?.name || "Open slot";
        return row;
      }));
    }

    const start = root.querySelector("#horseOnlineStart");
    const isOwner = Boolean(lobby && lobby.ownerId === onlineSnapshot.clientId);
    if (start) start.hidden = !isOwner || lobby?.playerCount < 2 || lobby?.status !== "open";
    const status = root.querySelector("#horseOnlineStatus");
    if (status) status.textContent = onlineSnapshot?.error?.message
      || (onlineSnapshot?.status === "searching" ? "Quick Search: finding an opponent…"
        : onlineSnapshot?.status === "creating" ? "Opening private room…"
          : onlineSnapshot?.status === "joining" ? "Joining private room…"
            : onlineSnapshot?.status === "started" ? "Match started. The host sets first."
              : onlineSnapshot?.status === "complete" ? "Match complete. Leave to play another."
                : lobby ? (lobby.playerCount >= 2 ? "Both players ready. The host can start." : "Waiting for Player 2…")
                  : "Choose Quick Search or open a private room.");
  }

  // ---------------------------------------------------------------- the HUD

  /**
   * The motion picker: LABELS ONLY, with the blurb on the title.
   *
   * The setup screen's chips can afford a line of description under each name
   * because that screen scrolls. This one cannot: it sits inside a court that is
   * locked to the viewport, and six chips with blurbs cost about 95px of the
   * height the court is trying to keep. The description is not lost — it is on
   * `title`, the same place the ball picker keeps its exact flight multipliers.
   */
  function buildMotionChips() {
    // Built from the catalog the CURRENT KIND reads, and rebuilt when that
    // changes — the two catalogs do not share ids, so one merged row of chips
    // would be offering a hoop mode to a bin. Same rule the Lab keeps.
    renderChips(el.motions, motionCatalog().map(({ id, label, blurb }) => ({ id, label, blurb })));
  }

  function buildTargetChips() {
    renderChips(el.targets, TRICK_SHOT_TARGETS.map(({ kind, label, blurb }) => ({
      id: kind, label, blurb,
    })));
  }

  function renderChips(container, entries) {
    if (!container) return;
    container.replaceChildren(...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip chip--bare";
      button.dataset.value = entry.id;
      button.title = entry.blurb;
      const strong = document.createElement("strong");
      strong.textContent = entry.label;
      button.append(strong);
      return button;
    }));
  }

  function motionCatalog() {
    return workingTarget.kind === HOOP_TARGET ? HOOP_MODES : BIN_MOTIONS;
  }

  function syncPanels() {
    syncResults();
    syncBallPicker();
    const placing = isPlacing();
    if (el.place) el.place.hidden = !placing;
    // `--chrome` is the height the court hands to the panel below it, and this
    // panel is two different heights: placing costs three extra rows, aiming
    // costs none. A single reservation big enough for both would shrink the
    // court for the whole of every shot to pay for a panel that is not on
    // screen. The class goes on the COURT, not the section — which screen is
    // showing belongs to `ui/screens.js` alone, and this is only about what is
    // inside one.
    el.court?.classList.toggle("is-placing", placing);
    // THE RESULTS CARD IS THE ONLY PLACE A REMATCH IS OFFERED. There used to be
    // a `New match` button in the HUD as well, shown exactly when the match was
    // over — which is now exactly when the card's scrim is over the top of it.
    // The legend is about the gesture, and the gesture is the target's — a hoop
    // takes the cabinet's classic pull where a bin spends strength on depth, so
    // saying one thing under both would be wrong half the time. Read off the
    // ACTIVE setup rather than the working one, since that is what is about to be
    // shot at; the working one is only the player's business while placing.
    if (el.legend) {
      const hoop = (placing ? workingTarget : activeSetup)?.kind === HOOP_TARGET;
      el.legend.textContent = placing
        ? (hoop
          ? "Drag the hoop along the wall · arrows or WASD for the lane · Q / E for height"
          : "Drag the bin · arrows or WASD for depth · Q / E for height")
        : (hoop
          ? "Pull angle aims and sets the arc · strength is power"
          : "Pull strength picks how far down the room the ball lands");
    }
    // The hint over the court is phase-specific too. It used to be set once in
    // the markup, so it went on telling a player to drag the bin while they were
    // standing over the ball with the bin already set.
    if (el.hint) {
      el.hint.textContent = placing
        ? (workingTarget.kind === HOOP_TARGET
          ? "Hang the hoop where you want it · then set the shot"
          : "Drag the bin where you want it · then set the shot")
        : match?.phase === PHASE_MATCH
          ? "Match it · pull the ball and release"
          : "Pull the ball · release to shoot";
    }
    syncPlacementPanel();
  }

  function syncPlacementPanel() {
    const hoop = workingTarget.kind === HOOP_TARGET;
    // The motion chips are a different LIST for each kind, not the same list with
    // a different one lit, so they are rebuilt before they are marked.
    buildMotionChips();
    markActiveChip(el.motions, workingTarget.motionId);
    markActiveChip(el.targets, workingTarget.kind);
    if (el.placeHead) el.placeHead.textContent = hoop ? "HANG THE HOOP" : "PLACE THE BIN";
    // A HOOP HAS NO DEPTH, so the pair of steppers that choose one is put away
    // rather than left there doing nothing. `[hidden]` alone would not do it —
    // the row is `display: flex` and the UA stylesheet loses to that — so the
    // stylesheet carries the matching rule, the same trap the online config rows
    // and the ball picker both fell into.
    if (el.depthNudges) el.depthNudges.hidden = hoop;
    syncSavedShotBank();
    syncToolInspector();
    if (!el.readouts) return;
    // Percentages of the legal volume rather than raw units, because neither a
    // world unit nor a canvas pixel is a thing a player has any feel for, and the
    // bounds move with the room and the motion anyway.
    el.readouts.textContent = (hoop ? hoopReadouts() : binReadouts()).join(" · ");
  }

  function hoopReadouts() {
    const { cx, rimY } = workingTarget.placement;
    const bounds = hoopPlacementBoundsFor(workingTarget.motionId);
    return [
      "ON THE WALL",
      // Screen y grows downward, so the percentage is read the other way up: a
      // player asking how HIGH the rim is wants 100% at the top of the band.
      `HEIGHT ${percent(bounds.maxRimY - (rimY - bounds.minRimY), bounds.minRimY, bounds.maxRimY)}`,
      `LANE ${percent(cx, bounds.minCx, bounds.maxCx)}`,
    ];
  }

  function binReadouts() {
    const { x, y, z } = workingTarget.placement;
    const envelope = motionEnvelope(workingTarget.motionId);
    const band = heightBoundsAt(z, envelope);
    const lateral = horizontalBoundsAt(z);
    return [
      `DEPTH ${percent(z, PLACEMENT_BOUNDS.minZ - envelope.minDz, PLACEMENT_BOUNDS.maxZ - envelope.maxDz)}`,
      `HEIGHT ${percent(y, band.minY, band.maxY)}`,
      `LANE ${percent(x, lateral.minX, lateral.maxX)}`,
    ];
  }

  function markActiveChip(container, value) {
    if (!container) return;
    for (const button of container.querySelectorAll("[data-value]")) {
      const on = button.dataset.value === value;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function syncSavedShotBank() {
    if (!el.savedShots) return;
    const shots = savedShots();
    const selected = shots.some(({ id }) => id === currentSavedShotId)
      ? currentSavedShotId
      : shots[0]?.id || "";
    el.savedShots.replaceChildren(...(shots.length ? shots : [{ id: "", name: "No saved trick shots" }]).map((shot) => {
      const option = document.createElement("option");
      option.value = shot.id;
      option.textContent = shot.name;
      return option;
    }));
    el.savedShots.value = selected;
    el.savedShots.disabled = !shots.length || !isPlacing();
    if (el.useSavedShot) el.useSavedShot.disabled = !shots.length || !isPlacing();
  }

  function syncToolInspector() {
    const piece = workingPieces.find((candidate) => candidate.id === selectedPieceId);
    if (el.toolInspector) el.toolInspector.hidden = !piece;
    if (!piece) return;
    if (el.toolTitle) {
      el.toolTitle.textContent = piece.type === BOARD_PIECE
        ? "Rebound Pad"
        : piece.type === SPRING_PIECE ? "Springboard" : "Ball Cannon";
    }
    if (el.toolDepth) el.toolDepth.value = String(Math.round(piece.z * 100));
    if (el.toolDirection) el.toolDirection.value = String(Math.round(piece.yaw * 180 / Math.PI));
    if (el.toolAngle) el.toolAngle.value = String(Math.round((isPadPiece(piece) ? piece.angle : piece.pitch) * 180 / Math.PI));
    if (el.toolAngleLabel) el.toolAngleLabel.textContent = isPadPiece(piece) ? "Face tilt" : "Launch angle";
    if (el.toolPower) {
      const rebound = piece.type === BOARD_PIECE;
      el.toolPower.min = rebound ? "0.45" : "2.5";
      el.toolPower.max = rebound ? "1.12" : "7.5";
      el.toolPower.step = rebound ? "0.01" : "0.1";
      el.toolPower.value = String(rebound ? piece.restitution : piece.speed);
    }
    if (el.toolPowerLabel) {
      el.toolPowerLabel.textContent = piece.type === BOARD_PIECE ? "Bounce energy" : "Launch power";
    }
    if (el.toolDelayRow) el.toolDelayRow.hidden = piece.type !== CANNON_PIECE;
    if (el.toolDelay) el.toolDelay.value = String(piece.delay || 0.5);
  }

  function percent(value, min, max) {
    const span = max - min;
    return `${span <= 0 ? 0 : Math.round(((value - min) / span) * 100)}%`;
  }

  function syncLetters() {
    if (!el.letters) return;
    el.letters.replaceChildren(...match.players.map((player, index) => {
      const row = document.createElement("div");
      row.className = "horse-letter-row";
      if (index === match.turn && match.status === "playing") row.classList.add("is-turn");
      const name = document.createElement("span");
      name.className = "horse-letter-name";
      name.textContent = player.name;
      const letters = document.createElement("span");
      letters.className = "horse-letter-word";
      for (const { letter, earned } of letterState(match, index)) {
        const span = document.createElement("span");
        span.className = earned ? "horse-letter is-earned" : "horse-letter";
        span.textContent = letter;
        letters.appendChild(span);
      }
      row.append(name, letters);
      return row;
    }));
  }

  function syncStatus() {
    syncLetters();
    if (match.status === "waiting") {
      setStatus("Set up an online match below");
      return;
    }
    if (match.status === "won") {
      setStatus(`${playerLabel(match, match.winner).toUpperCase()} WINS`);
      return;
    }
    if (awaitingServer) {
      setStatus("Waiting for the ruling…");
      return;
    }
    const who = playerLabel(match);
    const mine = isMyTurn();
    if (phase === PHASE_PLACING || (mode === "online" && match.phase !== PHASE_MATCH && !activeSetup && !mine)) {
      setStatus(mine ? `${who}: set up a shot` : `${who} is setting up…`);
      return;
    }
    if (match.phase === PHASE_MATCH) {
      // The tools are part of the shot being owed, so the line that names the
      // duty is the line that has to say how many. Without it the only way to
      // learn the rule is to lose a letter to it.
      const owed = requiredPieceIds(match.standingShot).length;
      const tools = owed > 0 ? ` · ${owed} TOOL${owed === 1 ? "" : "S"}` : "";
      setStatus(mine ? `${who}: MATCH IT${tools}` : `${who} must match it…${tools}`);
      return;
    }
    setStatus(mine ? `${who}: make it to set the shot` : `${who} is shooting…`);
  }

  /**
   * The match-over card.
   *
   * GATED ON THE BALL, like tic-tac-toe's. `syncPanels` runs the instant a shot
   * resolves, and the shot that spells the last letter is the one shot of the
   * match worth watching — a card thrown up over it would hide it. `tickFlight`
   * calls back through here when the ball is handed back.
   *
   * It replaces a status line. The word was spelled, the HUD said who had won,
   * and the court then sat there with nothing to do and no way on but MENU.
   */
  function syncResults() {
    if (!results.overlay) return;
    if (match?.status !== "won" || flight) {
      hideResults();
      return;
    }
    const online = mode === "online";
    const loser = match.winner === 0 ? 1 : 0;
    if (!loserPopupPlayed && shouldShowLoserPopup(loser)) showLoserPopup();
    if (loserPopupRemaining > 0) {
      hideResults();
      return;
    }
    const winner = playerLabel(match, match.winner);
    setResult(results.word, match.word);
    // "You Wins" is what taking the label straight gives you, and a seat's label
    // is genuinely "You" in every mode but hotseat — so the verb agrees with the
    // name rather than being bolted onto it.
    setResult(results.title, winner === "You" || (online && match.winner === seat) ? "You Win" : `${winner} Wins`);
    setResult(results.meta, `${playerLabel(match, loser).toUpperCase()} SPELLED ${match.word}`);

    if (results.letters) {
      results.letters.replaceChildren(...match.players.map((player, index) => {
        const row = document.createElement("div");
        row.className = index === match.winner ? "horse-result-row" : "horse-result-row is-loser";
        const name = document.createElement("span");
        name.className = "horse-result-name";
        name.textContent = player.name;
        const word = document.createElement("span");
        word.className = "horse-result-word";
        for (const { letter, earned } of letterState(match, index)) {
          const span = document.createElement("span");
          span.className = earned ? "is-earned" : "";
          span.textContent = letter;
          word.appendChild(span);
        }
        row.append(name, word);
        return row;
      }));
    }

    if (results.rematch) results.rematch.hidden = online;
    if (results.lobby) results.lobby.hidden = !online;
    results.overlay.classList.add("is-shown");
  }

  function hideResults() {
    results.overlay?.classList.remove("is-shown");
  }

  function shouldShowLoserPopup(loser) {
    if (mode === "local") return true;
    return loser === (mode === "online" ? seat : 0);
  }

  function showLoserPopup() {
    loserPopupPlayed = true;
    loserPopupRemaining = LOSER_POPUP_SECONDS;
    if (el.loserPopupText) el.loserPopupText.textContent = `YOU ARE A ${match.word}!`;
    el.loserPopup?.setAttribute("aria-hidden", "false");
    el.loserPopup?.classList.add("is-shown");
  }

  function hideLoserPopup() {
    el.loserPopup?.setAttribute("aria-hidden", "true");
    el.loserPopup?.classList.remove("is-shown");
  }

  function tickLoserPopup() {
    if (loserPopupRemaining <= 0) return;
    loserPopupRemaining = Math.max(0, loserPopupRemaining - TICK_SECONDS);
    if (loserPopupRemaining > 0) return;
    hideLoserPopup();
    syncPanels();
  }

  function setResult(node, value) {
    if (node) node.textContent = String(value);
  }

  function setStatus(text) { if (el.status) el.status.textContent = text; }

  function setPower(power) {
    const value = Math.round(power * 100);
    if (el.meter) el.meter.style.width = `${value}%`;
    if (el.readout) el.readout.textContent = `${value}%`;
  }

  function screenBallPosition() {
    const screen = projectPoint(ball);
    return { x: screen.x, y: screen.y, radius: ballScreenRadius(ball.z) };
  }

  // ------------------------------------------------------------- the drawing

  function draw() {
    if (!match) return;
    const setup = phase === PHASE_PLACING ? workingTarget : activeSetup;
    const target = setup
      ? horseTargetAt(setup, turnClock)
      : { kind: null, motionId: null, hoop: null, bin: null };
    const pieces = phase === PHASE_PLACING ? workingPieces : activePieces;
    const ballId = flight?.ballId || currentTurnBallId();
    let trajectory = null;
    let renderPull = pull;
    if (pull && activeSetup) {
      const preview = createHorseShot(pull, ball, activeSetup, { weight: ballFlight(currentTurnBallId()).weight });
      trajectory = pull.power > 0.03 ? trajectoryPoints(ball, preview.launch) : null;
      renderPull = { ...pull, aimX: preview.aim.x, aimY: preview.aim.y };
    }
    renderTrickShotFrame(ctx, {
      ball,
      target,
      binImage: art.bin,
      building: phase === PHASE_PLACING,
      capturedBin: flight?.capturedBin,
      backdrop: assets.backdrop(currentLocationId),
      locationId: currentLocationId,
      ballFrames: assets.ballFrames(ballId),
      ballId,
      pieceAssets: { cannonBase: art.cannonBase, cannonBarrel: art.cannonBarrel },
      pieces,
      selectedId: phase === PHASE_PLACING ? selectedPieceId : null,
      capture: piecePhysics.capture,
      pull: renderPull,
      trajectory,
      scored: Boolean(flight?.made),
      splats,
      splatImagesFor: assets.ballSplats,
      impacts,
    });
    // Fire is a HORSE-only ball effect. It deliberately sits above the shared
    // scene so bringing the Lab renderer in does not make a magma shot vanish.
    drawFlameFires(ctx, trail);
    drawFlameEmbers(ctx, trail);
  }

  function frame(now) {
    accumulator += Math.min(100, now - previousFrame) / 1000;
    previousFrame = now;
    while (accumulator >= TICK_SECONDS) { tick(); accumulator -= TICK_SECONDS; }
    draw();
    if (active) requestAnimationFrame(frame);
  }

  /**
   * Show this screen. The loop runs only while it is up — otherwise the CPU
   * plays out a whole match against a board nobody is looking at.
   */
  function enter({ mode: nextMode, difficulty: nextDifficulty, word: nextWord, action, room } = {}) {
    if (nextMode !== undefined) mode = horseModeId(nextMode);
    if (nextDifficulty !== undefined) difficulty = horseDifficultyById(nextDifficulty).id;
    if (nextWord !== undefined) word = nextWord;
    newMatch();
    // Signed-in only, like every other online surface in the cabinet. The gate
    // redirects rather than explaining, and the court sits behind the lobby.
    if (mode === "online" && accountAccess.requireAccount()) {
      if (action === "quick") onlineClient.findQuickMatch(word);
      else if (action === "create") onlineClient.createPrivateRoom(word);
      else if (action === "join" && room) onlineClient.joinPrivateRoom(room);
      else onlineClient.connect();
    }
    if (!active) {
      active = true;
      previousFrame = typeof performance === "undefined" ? 0 : performance.now();
      accumulator = 0;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(frame);
    }
  }

  function exit() {
    active = false;
    pull = null;
    pointerId = null;
    placingPointerId = null;
    if (mode === "online") onlineClient.leave();
  }

  newMatch();

  return {
    get match() { return match; },
    get phase() { return phase; },
    get setup() { return workingTarget; },
    get pieces() { return normalizeSandboxPieces(workingPieces); },
    get locationId() { return currentLocationId; },
    ball,
    newMatch,
    draw,
    enter,
    exit,
    handleKey,
    isActive: () => active,
    // The loop, exposed. A HORSE turn is a state machine that has to hand the
    // ball back and change hands, and that is exactly the class of thing a
    // browser cannot check: the failure is a loop that quietly stops, and
    // rendering keeps working. Same seam, same reason, as the practice court's.
    tick,
    isBusy: () => Boolean(flight),
    // The target as the court is drawing it RIGHT NOW — placed position plus
    // however far its motion has carried it, in the resolved `{ kind, hoop, bin }`
    // shape the renderer and the colliders both take. The only way to observe the
    // motion clock from outside, and the motion clock is what makes "the same
    // shot" a true statement about a moving target.
    targetNow: () => horseTargetAt(phase === PHASE_PLACING ? workingTarget : activeSetup, turnClock),
    placeTarget: setWorking,
    setShot: confirmPlacement,
    addPiece,
    removeSelectedPiece,
    savedShots,
    useSavedShot,
    currentBallId: currentTurnBallId,
  };
}
