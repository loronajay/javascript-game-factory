// HORSE: a third composition root, on the cabinet's own page.
//
// A SCREEN, NOT A PAGE — the same rule floor tic-tac-toe learned the hard way. A
// navigation destroys the <audio> element the soundtrack streams through and
// nothing brings a stream back, so this takes the cabinet's `audio` and the
// cabinet's router rather than owning either.
//
// It is its own root because it owns a different loop and a different shape of
// turn. Tic-tac-toe's turn is one gesture; a HORSE turn is TWO phases —
// arranging a bin, then shooting at it — and the second half of that is only
// ever reached from the first.
//
// WHAT IT DELIBERATELY DOES NOT IMPORT: `sim/run.js`, and any store. HORSE has
// no clock and files to no leaderboard, for the reason a board key is
// `mode:duration` — a HORSE score is not comparable to anything, because the
// target was invented by one of the two players.

import { createAssetLibrary } from "./assets/loader.js";
import { ballFlight } from "./assets/ball-catalog.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, CONTACT_DEBOUNCE_SECONDS, TICK_SECONDS } from "./sim/constants.js";
import { stepBallAgainstBins } from "./sim/bin-physics.js";
import {
  BIN_MOTIONS,
  binMotionById,
  clampPlacement,
  motionEnvelope,
  defaultPlacement,
  heightBoundsAt,
  horizontalBoundsAt,
  normalizeBinSetup,
  placedBinAt,
  placementFromFractions,
  PLACEMENT_BOUNDS,
} from "./sim/bin-placement.js";
import { createHorseShot, horsePowerForDepth } from "./sim/horse-shot.js";
import {
  PHASE_MATCH,
  canPlaceBin,
  chooseCpuBinSetup,
  cpuMakesHorseShot,
  createHorseMatch,
  horseDifficultyById,
  horseModeId,
  isHumanControlledTurn,
  letterState,
  playerLabel,
  resolveHorseShot,
  shotSetupFor,
} from "./sim/horse.js";
import { createBall, isBallSettled, launchBall, resetBall } from "./sim/physics.js";
import { launchSpin, trajectoryPoints } from "./sim/launch.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { ballScreenRadius, projectPoint, screenToWorldAtZ } from "./sim/projection.js";
import { drawAim } from "./render/aim.js";
import { drawBall } from "./render/ball.js";
import { binMouthEllipse, drawBinBody, drawBinLip, drawBinShadow } from "./render/bin.js";
import { clearScene, depthGradeFilter, drawBallShadow, drawRoom, prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";

// The room and the ball, fixed the way tic-tac-toe fixes them and for the same
// reason: the mode is not a configurable run, and the thing the players are
// negotiating over is the BIN. A court picker would only add a second thing to
// agree about before anyone shoots.
const ROOM_ID = "warehouse";
const BALL_ID = "basketball";

// How far one nudge of a key or an on-screen stepper moves the bin.
const NUDGE_DEPTH = 0.035;
const NUDGE_LATERAL = 0.045;
const NUDGE_HEIGHT = 0.03;

// A turn's two phases. `placing` is only ever reached when the rules say this
// player owes nobody a shot.
const PHASE_PLACING = "placing";
const PHASE_AIMING = "aiming";

/** Silent stand-in so the root can be constructed in a test without a browser. */
const SILENT_AUDIO = Object.freeze({
  released() {}, contact() {}, binScored() {}, missed() {}, celebrate() {}, click() {},
});

export function bootHorse(root, options = {}) {
  const random = options.random || Math.random;
  const audio = options.audio || SILENT_AUDIO;
  const onLeave = options.onLeave || (() => {});

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
    room: assets.backdrop(ROOM_ID),
    bin: assets.image(BIN_PATH),
    ballFrames: assets.ballFrames(BALL_ID),
  };

  const ball = createBall();
  const lastContactAt = new Map();

  let mode = horseModeId(options.mode);
  let difficulty = options.difficulty || "medium";
  let word = options.word;
  let active = false;
  let match;
  let phase = PHASE_PLACING;
  // The bin the current shooter is arranging. Carried between turns on purpose:
  // a player who liked where they stood the bin last time starts from there
  // rather than from the middle of the room again.
  let workingSetup = { ...defaultPlacement(), motionId: "still" };
  // The bin the shot in progress is actually against — frozen at the moment the
  // shot was set, so the setter cannot keep fiddling once the ball is in the air.
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
  let flight = null;
  let cpuDelay = 0;
  let accumulator = 0;
  let previousFrame = 0;

  const el = {
    status: root.querySelector("#horseStatus"),
    modeLabel: root.querySelector("#horseModeLabel"),
    meter: root.querySelector("#horseMeterFill"),
    readout: root.querySelector("#horseMeterReadout"),
    legend: root.querySelector("#horseMeterLegend"),
    hint: root.querySelector("#horseHint"),
    letters: root.querySelector("#horseLetters"),
    place: root.querySelector("#horsePlacePanel"),
    motions: root.querySelector("#horseMotions"),
    confirm: root.querySelector("#horseConfirm"),
    readouts: root.querySelector("#horsePlaceReadout"),
    newMatch: root.querySelector("#horseNewMatch"),
    court: root.querySelector("#horseScreen .court"),
  };

  buildMotionChips();

  el.newMatch?.addEventListener("click", () => { audio.click(); newMatch(); });
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

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(canvas, event);
    if (isPlacing()) {
      // Drag the bin itself: across for the lane, up and down for the height.
      // Depth is the one axis a single drag cannot carry honestly, because up
      // the screen is BOTH higher and further away — so depth gets its own
      // control rather than being guessed at from the same gesture.
      placingPointerId = event.pointerId;
      canvas.setPointerCapture?.(placingPointerId);
      dragBinTo(point);
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
    canvas.setPointerCapture?.(pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (placingPointerId !== null && event.pointerId === placingPointerId) {
      dragBinTo(canvasPoint(canvas, event));
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
    event.preventDefault();
  });

  canvas.addEventListener("pointercancel", () => {
    pull = null;
    pointerId = null;
    placingPointerId = null;
    setPower(0);
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
    return phase === PHASE_PLACING && match?.status === "playing" && isHumanControlledTurn(match) && !flight;
  }

  function canHumanShoot() {
    return phase === PHASE_AIMING && match?.status === "playing" && isHumanControlledTurn(match) && !flight;
  }

  /** Move the working bin to a canvas point: across for the lane, up for the height. */
  function dragBinTo(point) {
    const { z } = workingSetup;
    const world = screenToWorldAtZ(point.x, point.y, z);
    setWorking({ x: world.x, y: world.y });
  }

  function nudge(direction) {
    const step = {
      deeper: { z: NUDGE_DEPTH },
      nearer: { z: -NUDGE_DEPTH },
      left: { x: -NUDGE_LATERAL },
      right: { x: NUDGE_LATERAL },
      higher: { y: NUDGE_HEIGHT },
      lower: { y: -NUDGE_HEIGHT },
    }[direction];
    if (!step) return;
    setWorking({
      x: workingSetup.x + (step.x || 0),
      y: workingSetup.y + (step.y || 0),
      z: workingSetup.z + (step.z || 0),
    });
  }

  /**
   * Apply a change to the working bin, re-clamped.
   *
   * EVERY route into the placement goes through here, so there is one place the
   * legal volume is enforced and no caller has to remember to clamp. Changing
   * the motion re-clamps the position too, because a motion's sweep is
   * subtracted from the volume — pick Left / Right while parked against the wall
   * and the bin steps in far enough for its whole run to fit.
   */
  function setWorking(change) {
    const next = { ...workingSetup, ...change };
    workingSetup = { ...clampPlacement(next, next.motionId), motionId: binMotionById(next.motionId).id };
    // Watching a motion you have just chosen is most of how you decide whether
    // you want it, so the preview runs on the same clock the shot will.
    turnClock = 0;
    syncPlacementPanel();
    draw();
  }

  function confirmPlacement() {
    if (!isPlacing()) return;
    activeSetup = normalizeBinSetup(workingSetup);
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
      startingPlayer: mode === "cpu" ? 0 : 0,
    });
    lastContactAt.clear();
    workingSetup = { ...defaultPlacement(), motionId: "still" };
    activeSetup = null;
    flight = null;
    pull = null;
    resetBall(ball);
    setPower(0);
    beginTurn();
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
    if (canPlaceBin(match)) {
      phase = PHASE_PLACING;
      activeSetup = null;
    } else {
      // Through the rules' own seam, not by reading `standingShot` directly:
      // "what am I shooting at" is a rule, and the answer for a matcher is the
      // setter's bin whatever this player had arranged.
      phase = PHASE_AIMING;
      activeSetup = shotSetupFor(match, workingSetup);
    }
    cpuDelay = isHumanControlledTurn(match) ? 0 : 0.9;
    el.hint?.classList.toggle("is-hidden", !isHumanControlledTurn(match));
    syncPanels();
    syncStatus();
  }

  function launchFromPull(released) {
    if (flight || !activeSetup) return;
    const shot = createHorseShot(released, ball, activeSetup, { weight: ballFlight(BALL_ID).weight });
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(BALL_ID);
    flight = { age: 0, resolved: false, resetIn: null, capturedBin: null, made: false };
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
    const makes = cpuMakesHorseShot(difficulty, random);
    const rest = placedBinAt(setup, turnClock);
    const provisional = createHorseShot(
      { power: horsePowerForDepth(rest.z), aimX: projectPoint(rest).x, loft: 1 },
      ball,
      setup,
      { weight: ballFlight(BALL_ID).weight },
    );
    const lead = placedBinAt(setup, turnClock + Math.max(0, provisional.launch.flightTime));
    const target = projectPoint({ x: lead.x, y: lead.topY, z: lead.z });
    launchFromPull({
      power: horsePowerForDepth(lead.z) + (makes ? 0 : (random() < 0.5 ? -0.06 : 0.06)),
      aimX: target.x + (makes ? 0 : (random() < 0.5 ? -95 : 95)),
      loft: 1,
    });
  }

  /** The CPU arranging a bin of its own. */
  function startCpuPlacement() {
    const choice = chooseCpuBinSetup(difficulty, random, BIN_MOTIONS.map(({ id }) => id));
    workingSetup = {
      ...placementFromFractions(choice, choice.motionId),
      motionId: binMotionById(choice.motionId).id,
    };
    activeSetup = normalizeBinSetup(workingSetup);
    phase = PHASE_AIMING;
    turnClock = 0;
    cpuDelay = 0.85;
    syncPanels();
    syncStatus();
  }

  function tick() {
    elapsed += TICK_SECONDS;
    // The bin's own clock runs whenever a shot is set, INCLUDING while the
    // player is still lining up their pull — so a moving bin can be watched
    // before anyone commits, exactly like the classic cabinet's moving rim.
    if (activeSetup || isPlacing()) turnClock += TICK_SECONDS;

    if (flight) {
      tickFlight();
      return;
    }
    if (match.status !== "playing" || isHumanControlledTurn(match)) return;

    cpuDelay -= TICK_SECONDS;
    if (cpuDelay > 0) return;
    if (phase === PHASE_PLACING) startCpuPlacement();
    else startCpuShot();
  }

  function tickFlight() {
    flight.age += TICK_SECONDS;
    const bin = placedBinAt(activeSetup, turnClock);

    if (!flight.resolved) {
      const result = stepBallAgainstBins(ball, [bin], TICK_SECONDS, {
        ballId: BALL_ID,
        capturedBin: flight.capturedBin,
      });
      announce(result.contacts);
      if (result.capturedBin !== null) flight.capturedBin = result.capturedBin;

      if (result.scoredBin !== null) {
        finishShot(true);
      } else if (flight.age > 3.4 || (flight.age > 0.45 && isBallSettled(ball))) {
        finishShot(false);
      }
      return;
    }

    if (flight.capturedBin !== null) {
      stepBallAgainstBins(ball, [bin], TICK_SECONDS, { ballId: BALL_ID, capturedBin: flight.capturedBin });
    }
    flight.resetIn -= TICK_SECONDS;
    if (flight.resetIn <= 0) {
      flight = null;
      if (match.status === "playing") beginTurn();
      else syncPanels();
    }
  }

  function finishShot(made) {
    const outcome = resolveHorseShot(match, made, activeSetup);
    flight.resolved = true;
    flight.made = made;
    flight.resetIn = made ? 1.15 : 0.55;
    if (made) audio.binScored(BALL_ID);
    else audio.missed();
    if (match.status === "won") audio.celebrate();
    setStatus(narrate(outcome));
    syncLetters();
  }

  /** What just happened, in one line. */
  function narrate(outcome) {
    if (!outcome?.accepted) return "";
    const who = playerLabel(match, outcome.shooter).toUpperCase();
    if (match.status === "won") {
      return `${who} SPELLS ${match.word} · ${playerLabel(match, match.winner).toUpperCase()} WINS`;
    }
    if (outcome.kind === "set") return `${who} SETS THE SHOT · MATCH IT`;
    if (outcome.kind === "set-missed") return `${who} MISSED THEIR OWN SHOT · NO LETTER`;
    if (outcome.kind === "matched") return `${who} MATCHED IT · THEY SET NEXT`;
    return `${who} MISSES · LETTER ${match.word[match.players[outcome.shooter].letters - 1]}`;
  }

  /** Turn this tick's contacts into sound. Debounced on the cabinet's own rule. */
  function announce(contacts) {
    for (const contact of contacts) {
      if (contact === "bin-score") continue;
      if (contact !== "floor") {
        const last = lastContactAt.get(contact) ?? -Infinity;
        if (elapsed - last < CONTACT_DEBOUNCE_SECONDS) continue;
        lastContactAt.set(contact, elapsed);
      }
      audio.contact(contact, { ballId: BALL_ID, speed: ball.vy });
    }
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
    if (!el.motions) return;
    el.motions.replaceChildren(...BIN_MOTIONS.map((motion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip chip--bare";
      button.dataset.value = motion.id;
      button.title = motion.blurb;
      const strong = document.createElement("strong");
      strong.textContent = motion.label;
      button.append(strong);
      return button;
    }));
  }

  function syncPanels() {
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
    if (el.newMatch) el.newMatch.hidden = match?.status === "playing";
    if (el.legend) {
      el.legend.textContent = placing
        ? "Drag the bin · arrows or WASD for depth · Q / E for height"
        : "Pull strength picks how far down the room the ball lands";
    }
    // The hint over the court is phase-specific too. It used to be set once in
    // the markup, so it went on telling a player to drag the bin while they were
    // standing over the ball with the bin already set.
    if (el.hint) {
      el.hint.textContent = placing
        ? "Drag the bin where you want it · then set the shot"
        : match?.phase === PHASE_MATCH
          ? "Match it · pull the ball and release"
          : "Pull the ball · release to shoot";
    }
    syncPlacementPanel();
  }

  function syncPlacementPanel() {
    if (el.motions) {
      for (const button of el.motions.querySelectorAll("[data-value]")) {
        const on = button.dataset.value === workingSetup.motionId;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    if (!el.readouts) return;
    // Percentages of the legal volume rather than world units, because a world
    // unit is not a thing a player has any feel for and the bounds move with the
    // room anyway.
    const envelope = motionEnvelope(workingSetup.motionId);
    const band = heightBoundsAt(workingSetup.z, envelope);
    const lateral = horizontalBoundsAt(workingSetup.z);
    el.readouts.textContent = [
      `DEPTH ${percent(workingSetup.z, PLACEMENT_BOUNDS.minZ - envelope.minDz, PLACEMENT_BOUNDS.maxZ - envelope.maxDz)}`,
      `HEIGHT ${percent(workingSetup.y, band.minY, band.maxY)}`,
      `LANE ${percent(workingSetup.x, lateral.minX, lateral.maxX)}`,
    ].join(" · ");
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
    if (match.status === "won") {
      setStatus(`${playerLabel(match, match.winner).toUpperCase()} WINS`);
      return;
    }
    const who = playerLabel(match);
    if (phase === PHASE_PLACING) {
      setStatus(isHumanControlledTurn(match) ? `${who}: set up a shot` : `${who} is setting up…`);
      return;
    }
    if (match.phase === PHASE_MATCH) {
      setStatus(isHumanControlledTurn(match) ? `${who}: MATCH IT` : `${who} must match it…`);
      return;
    }
    setStatus(isHumanControlledTurn(match) ? `${who}: make it to set the shot` : `${who} is shooting…`);
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
    clearScene(ctx);
    drawRoom(ctx, art.room, ROOM_ID);

    const setup = phase === PHASE_PLACING ? workingSetup : activeSetup;
    const bin = setup ? placedBinAt(setup, turnClock) : null;
    const captured = flight?.capturedBin !== null && flight?.capturedBin !== undefined;
    const loose = !captured;

    if (bin) drawPlacementFloorMark(bin);
    if (loose) drawBallShadow(ctx, ball);
    if (bin) drawBinShadow(ctx, bin);

    // The painter's pass: a ball nearer the camera than the bin goes in front
    // of it, and the bin's near lip goes in front of a ball dropping into it.
    let ballDrawn = false;
    if (bin && loose && ball.z > bin.z) { drawLooseBall(); ballDrawn = true; }
    if (bin) {
      drawBinBody(ctx, bin, art.bin);
      if (captured) drawSinkingBall(bin);
      drawBinLip(ctx, bin, art.bin);
    }
    if (loose && !ballDrawn) drawLooseBall();

    if (pull && activeSetup) {
      const preview = createHorseShot(pull, ball, activeSetup, { weight: ballFlight(BALL_ID).weight });
      drawAim(ctx, {
        pull: { ...pull, aimX: preview.aim.x, aimY: preview.aim.y },
        trajectory: pull.power > 0.03 ? trajectoryPoints(ball, preview.launch) : null,
        showReticle: false,
      });
    }
  }

  /**
   * A ring on the floor under the bin, while it is being placed.
   *
   * It is the only thing on screen that separates "the bin is further away" from
   * "the bin is higher up", which look identical on a still frame — the ring
   * stays on the floor at the bin's own depth while the bin climbs away from it.
   * The shadow says the same thing softly; this says it in a straight line, and
   * only while someone is actually choosing.
   */
  function drawPlacementFloorMark(bin) {
    if (phase !== PHASE_PLACING) return;
    const foot = projectPoint({ x: bin.x, y: 0.004, z: bin.z });
    const mouth = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
    const rings = binMouthEllipse(bin);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 45, 225, .8)";
    ctx.shadowColor = "#ff2ddd";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, rings.radiusX * 0.92, Math.max(4, rings.radiusX * 0.3), 0, 0, Math.PI * 2);
    ctx.stroke();
    // The tether. Without it a raised bin and a distant one read the same.
    if (bin.baseY > 0.02) {
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(mouth.x, mouth.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawLooseBall() {
    if (ball.splat) return;
    drawBall(ctx, {
      frames: art.ballFrames,
      ballId: BALL_ID,
      ...screenBallPosition(),
      rollPhase: ball.rollPhase,
      filter: depthGradeFilter(ball.z),
    });
  }

  function drawSinkingBall(bin) {
    const mouth = binMouthEllipse(bin);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mouth.cx, mouth.cy, mouth.radiusX, mouth.radiusY, 0, 0, Math.PI * 2);
    ctx.clip();
    drawBall(ctx, {
      frames: art.ballFrames,
      ballId: BALL_ID,
      ...screenBallPosition(),
      rollPhase: ball.rollPhase,
      filter: `${depthGradeFilter(bin.z)} brightness(0.62)`,
    });
    ctx.restore();
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
  function enter({ mode: nextMode, difficulty: nextDifficulty, word: nextWord } = {}) {
    if (nextMode !== undefined) mode = horseModeId(nextMode);
    if (nextDifficulty !== undefined) difficulty = horseDifficultyById(nextDifficulty).id;
    if (nextWord !== undefined) word = nextWord;
    newMatch();
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
  }

  newMatch();

  return {
    get match() { return match; },
    get phase() { return phase; },
    get setup() { return workingSetup; },
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
    // The bin as the court is drawing it RIGHT NOW — placed position plus
    // however far its motion has carried it. The only way to observe the motion
    // clock from outside, and the motion clock is what makes "the same shot"
    // true for a moving bin.
    binNow: () => placedBinAt(phase === PHASE_PLACING ? workingSetup : activeSetup, turnClock),
    placeBin: setWorking,
    setShot: confirmPlacement,
  };
}
