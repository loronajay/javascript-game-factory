// Composition root: owns the canvas, the fixed-timestep loop, and the wiring
// between input, the pure sim, the stores and the views.
//
// Deliberately thin. Every rule lives in `scripts/sim/`, every persisted value in
// `scripts/store/`, every draw call in `scripts/render/`, every DOM binding in
// `scripts/ui/`, and every catalog in `scripts/assets/`. This file is where those
// meet — it should stay a place where behaviour is *connected*, not a place where
// behaviour accumulates.
//
// If you find yourself about to add a rule here, it belongs in a module. The one
// thing this file is genuinely allowed to own is ORDER: what happens per tick,
// and in what sequence.

import { ballFlight, ballSplat } from "./assets/ball-catalog.js";
import { createAssetLibrary } from "./assets/loader.js";
import { createGameAudio } from "./audio/game-audio.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import { createPracticeCourt } from "./practice-court.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, PULL_MIN, TICK_MS, TICK_SECONDS } from "./sim/constants.js";
import { hoopAt, hoopModeById } from "./sim/hoop.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { launchSpin, solveLaunch, trajectoryPoints } from "./sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "./sim/physics.js";
import {
  SHOT_FLIGHT,
  advanceShot,
  beginShot,
  createShot,
  madeAnnouncement,
} from "./sim/shot.js";
import {
  RUN_EXPIRED,
  RUN_RUNNING,
  createRun,
  formatClock,
  isRunComplete,
  motionSeconds,
  recordMade,
  recordMiss,
  recordShot,
  runSummary,
  startClock,
  tickClock,
} from "./sim/run.js";
import { createBoardsStore } from "./store/boards-store.js";
import { createPreferencesStore } from "./store/preferences.js";
import { ballScreenPosition, renderFrame } from "./render/frame.js";
import { prepareContext } from "./render/scene.js";
import { createHud } from "./ui/hud.js";
import { createPracticeView } from "./ui/practice-view.js";
import { createMenuView } from "./ui/menu-view.js";
import { createOverlays } from "./ui/overlays.js";
import { createBoardsView } from "./ui/boards-view.js";
import { createSetupView, describeSetup } from "./ui/setup-view.js";
import { createSoundToggle } from "./ui/sound-toggle.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import {
  SCREEN_BOARDS,
  SCREEN_GAME,
  SCREEN_HOWTO,
  SCREEN_MENU,
  SCREEN_SETUP,
  createScreenRouter,
} from "./ui/screens.js";

export function boot(root) {
  const canvas = root.querySelector("#court");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  const preferences = createPreferencesStore();
  const boards = createBoardsStore();
  const assets = createAssetLibrary({ onLoad: () => requestRedraw() });
  const audio = createGameAudio({ muted: preferences.muted });

  const ball = createBall();
  let shot = createShot();
  let run = createRun(preferences.snapshot());

  // The live pull, or null when the player is not touching the ball.
  let pull = null;
  let pullPointerId = null;
  // Where on the ball the player actually grabbed, relative to its centre.
  // Subtracted from every later pointer position so the pull starts at zero
  // power wherever they touched — grabbing the ball's lower edge must not hand
  // them 8% power before they have moved a pixel.
  let grabOffset = { x: 0, y: 0 };

  let paused = false;
  let resultsShown = false;
  // Transient wobble on the net and rim. Presentation only — nothing reads these.
  const kicks = { net: 0, rim: 0 };
  // What the burst balls have left on the room. Presentation only, and wiped at
  // the top of every run — a board is a round, so the wall it was scored on is
  // clean when the clock starts.
  const splats = createSplatField();

  // Which board the leaderboard screen is looking at. Deliberately separate from
  // the play selection: browsing boards must not change what you are about to play.
  let boardFilter = { modeId: preferences.modeId, duration: preferences.duration };

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  const screens = createScreenRouter(
    {
      [SCREEN_MENU]: root.querySelector("#menuScreen"),
      [SCREEN_SETUP]: root.querySelector("#setupScreen"),
      [SCREEN_GAME]: root.querySelector("#gameScreen"),
      [SCREEN_BOARDS]: root.querySelector("#boardsScreen"),
      [SCREEN_HOWTO]: root.querySelector("#howToScreen"),
    },
    { onChange: (next) => onScreenChange(next) },
  );

  const hud = createHud(root);
  const menu = createMenuView(root, { onCommand: handleMenuCommand });
  const setup = createSetupView(root, { onSelect: handleSetupSelect });
  const boardsView = createBoardsView(root, {
    onFilter: (kind, value) => {
      boardFilter = kind === "mode" ? { ...boardFilter, modeId: value } : { ...boardFilter, duration: value };
      renderBoards();
    },
    onClear: () => {
      boards.clearBoard(boardFilter.modeId, boardFilter.duration);
      renderBoards();
      renderMenu();
    },
  });
  const overlays = createOverlays(root, { onIntent: handleIntent });
  const soundToggle = createSoundToggle(root);

  // The How to Play demo. It runs the same sim on its own canvas, so the only
  // thing this file owes it is a place in the tick order and the cosmetic
  // choices the player has already made.
  const practiceView = createPracticeView(root);
  const practice = createPracticeCourt(root.querySelector("#practiceCourt"), {
    assets,
    audio,
    onPower: (power) => practiceView.setPower(power),
    onSay: (text) => practiceView.say(text),
    onTally: (tally) => {
      practiceView.setTally(tally);
      practiceView.setHintVisible(tally.taken === 0);
    },
  });

  // ---------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------

  function selection() {
    const snapshot = preferences.snapshot();
    return { ...snapshot, summary: describeSetup(snapshot) };
  }

  function renderMenu() {
    const current = selection();
    menu.render({
      selection: current,
      bestScore: boards.bestScore(current.modeId, current.duration),
    });
    // The room the player is looking at is the one they are most likely to play,
    // so it is already warm by the time they press Play.
    assets.warm([...assets.ballFrames(current.ballId).map((image) => image.src)]);
  }

  function renderSetup() {
    setup.render(preferences.snapshot());
  }

  function renderBoards() {
    boardsView.render({
      ...boardFilter,
      entries: boards.readBoard(boardFilter.modeId, boardFilter.duration),
    });
  }

  // ---------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------

  function startRun() {
    run = createRun(preferences.snapshot());
    shot = createShot();
    resetBall(ball);
    pull = null;
    pullPointerId = null;
    paused = false;
    resultsShown = false;
    kicks.net = 0;
    kicks.rim = 0;
    clearSplatField(splats);

    overlays.hideAll();
    audio.runStarted();
    hud.setMode(hoopModeById(run.modeId).hudLabel);
    hud.setPower(0);
    hud.setHintVisible(true);
    hud.shout("");
    syncHud();
    screens.show(SCREEN_GAME);
  }

  function finishRun() {
    if (resultsShown) return;
    resultsShown = true;
    run.recorded = true;

    const summary = runSummary(run);
    const placement = boards.submitRun(summary);
    const isNewBest = summary.score > placement.previousBest && summary.score > 0;
    hud.shout(isNewBest ? "NEW BEST!" : "TIME!");
    // The one thing worth cheering in a solo cabinet is beating yourself. The
    // buzzer has already gone by here, which is the right order — horn, then room.
    if (isNewBest) audio.celebrate();
    overlays.showResults(summary, placement);

    boardFilter = { modeId: run.modeId, duration: run.duration };
    renderBoards();
    renderMenu();
  }

  function syncHud() {
    hud.setClock(formatClock(run));
    hud.setScore(run.score);
    hud.setShots(run.shots);
    hud.setStreak(run.streak);
    hud.setBest(boards.bestScore(run.modeId, run.duration));
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  function canPull() {
    return (
      screens.current() === SCREEN_GAME &&
      !paused &&
      !resultsShown &&
      shot.state !== SHOT_FLIGHT &&
      run.status !== RUN_EXPIRED
    );
  }

  // Sound is unlocked and every button is clicked from ONE place, in the capture
  // phase, so it happens before whatever the button actually does. Wiring a
  // click sound into each view would mean four files to touch and one to forget,
  // and browsers only allow an AudioContext to start from inside a gesture — so
  // the first press of the first button is both the click and the unlock.
  //
  // The two events are not interchangeable. `pointerdown` is the earliest a
  // gesture can start the context, so the unlock hangs off that; `click` is what
  // a keyboard press on a focused menu option produces, so the sound hangs off
  // that or the arrow-key navigation would be silent.
  root.addEventListener("pointerdown", () => audio.unlock(), true);
  root.addEventListener(
    "click",
    (event) => {
      audio.unlock();
      if (event.target.closest?.("button")) audio.click();
    },
    true,
  );

  canvas.addEventListener("pointerdown", (event) => {
    if (!canPull()) return;
    const point = canvasPoint(canvas, event);
    if (!isGrab(point, ballScreenPosition(ball))) return;

    event.preventDefault();
    pullPointerId = event.pointerId;
    const ballScreen = ballScreenPosition(ball);
    grabOffset = { x: point.x - ballScreen.x, y: point.y - ballScreen.y };
    pull = neutralPull(ballScreen);
    hud.setPower(0);
    hud.setHintVisible(false);
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pull || event.pointerId !== pullPointerId) return;
    event.preventDefault();
    updatePull(canvasPoint(canvas, event));
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!pull || event.pointerId !== pullPointerId) return;
    event.preventDefault();
    updatePull(canvasPoint(canvas, event));
    releasePull();
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pullPointerId) return;
    cancelPull();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function updatePull(point) {
    pull = resolvePull(
      { x: pull.anchorX, y: pull.anchorY },
      { x: point.x - grabOffset.x, y: point.y - grabOffset.y },
    );
    hud.setPower(pull.power);
    // The clock starts on the first pull that is actually a shot, so an
    // accidental brush of the ball costs nothing.
    if (pull.distance >= PULL_MIN) startClock(run);
  }

  function releasePull() {
    const released = pull;
    pull = null;
    pullPointerId = null;

    if (!released || !isShootablePull(released)) {
      hud.setPower(0);
      hud.setHintVisible(true);
      return;
    }

    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: { x: released.aimX, y: released.aimY },
      power: released.power,
      loft: released.loft,
      // The solver compensates for the ball's weight so the reference pull still
      // swishes whatever is in hand; its drag is deliberately not passed, and is
      // felt as the ball landing short. See `sim/launch.js`.
      weight: ballFlight(run.ballId).weight,
    });
    launchBall(ball, launch, launchSpin(launch));
    beginShot(shot);
    audio.released(run.ballId);
    recordShot(run);
    syncHud();
  }

  function cancelPull() {
    pull = null;
    pullPointerId = null;
    hud.setPower(0);
    hud.setHintVisible(true);
  }

  // ---------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------

  function handleMenuCommand(command) {
    if (command === "play") screens.show(SCREEN_SETUP);
    else if (command === "boards") screens.show(SCREEN_BOARDS);
    else if (command === "howto") screens.show(SCREEN_HOWTO);
  }

  function handleSetupSelect(kind, value) {
    if (kind === "mode") preferences.setMode(value);
    else if (kind === "duration") preferences.setDuration(Number(value));
    else if (kind === "location") preferences.setLocation(value);
    else if (kind === "ball") preferences.setBall(value);
    renderSetup();
    // Warm whatever they just picked, so pressing Start does not wait on art.
    const current = preferences.snapshot();
    assets.backdrop(current.locationId);
    assets.ballFrames(current.ballId);
    // A splat decal is only wanted the first time a shot dies, but it is wanted
    // instantly then — a splat that popped in a beat late would read as a bug.
    assets.ballSplats(current.ballId);
  }

  function handleIntent(intent) {
    switch (intent) {
      case "back":
        screens.back();
        break;
      case "start":
        startRun();
        break;
      case "pause":
        setPaused(true);
        break;
      case "resume":
        setPaused(false);
        break;
      case "restart":
        startRun();
        break;
      case "quit":
        overlays.hideAll();
        screens.show(SCREEN_MENU);
        break;
      case "change-setup":
        overlays.hideAll();
        screens.show(SCREEN_SETUP);
        break;
      case "view-boards":
        overlays.hideAll();
        screens.show(SCREEN_BOARDS);
        break;
      case "toggle-sound":
        setMuted(!audio.isMuted());
        break;
      default:
        break;
    }
  }

  function setPaused(next) {
    if (screens.current() !== SCREEN_GAME || resultsShown) return;
    paused = next;
    if (next) {
      cancelPull();
      // A frozen clock, hoop and ball with the countdown still beeping over the
      // top would be a lie. Resuming re-arms it at the right beat by itself.
      audio.silence();
      overlays.showPause();
    } else {
      overlays.hidePause();
    }
  }

  /** Mute, and remember it — the setting outlives the session, like every other preference. */
  function setMuted(next) {
    audio.setMuted(next);
    preferences.setMuted(next);
    soundToggle.render(next);
  }

  root.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      setMuted(!audio.isMuted());
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (screens.current() === SCREEN_GAME && !resultsShown) setPaused(!paused);
    else if (screens.current() !== SCREEN_MENU) screens.back();
  });

  function onScreenChange(next) {
    // Leaving the court cuts whatever it was still saying — a countdown that
    // followed the player back to the menu would be a bug you could hear.
    if (next !== SCREEN_GAME) audio.silence();
    if (next === SCREEN_MENU) {
      renderMenu();
      menu.focus();
    } else if (next === SCREEN_SETUP) {
      renderSetup();
    } else if (next === SCREEN_BOARDS) {
      renderBoards();
    } else if (next === SCREEN_HOWTO) {
      // Opening the demo always starts it clean, and dressed in whatever room
      // and ball the player has selected — both cosmetic by contract, so this
      // cannot change how the practice shot behaves.
      const current = preferences.snapshot();
      practice.setStyle({ ballId: current.ballId, locationId: current.locationId });
      practice.reset();
      practiceView.setPower(0);
      practiceView.setHintVisible(true);
    }
    practice.setActive(next === SCREEN_HOWTO);
    requestRedraw();
  }

  // ---------------------------------------------------------------------
  // The loop
  // ---------------------------------------------------------------------

  // Fixed timestep, per the repo rule: game logic runs at exactly 60 ticks/s
  // whatever the display does, so a 144Hz monitor plays the same game as a 60Hz
  // one. Rendering still happens once per frame, and reads state without
  // advancing anything.
  let lastTime = null;
  let accumulator = 0;
  let redrawRequested = true;

  function requestRedraw() {
    redrawRequested = true;
  }

  function tick() {
    if (screens.current() === SCREEN_HOWTO) {
      practice.tick();
      return;
    }
    if (screens.current() !== SCREEN_GAME || paused || resultsShown) return;

    const { expired } = tickClock(run, TICK_SECONDS);
    // Armed at three seconds and seeked to the beat, so the sample's beeps fall
    // on 3, 2 and 1 and the buzzer takes the place of its fourth. See
    // `audio/game-audio.js`.
    audio.clock(run.remaining, run.status === RUN_RUNNING);
    if (expired) audio.buzzer();

    const hoop = hoopAt(run.modeId, motionSeconds(run));

    if (shot.state === SHOT_FLIGHT) {
      const world = worldFor(hoop);
      const stepped = stepBall(ball, world, TICK_SECONDS, {
        ballId: run.ballId,
        alreadyScored: shot.scored,
      });

      if (stepped.scored) {
        kicks.net = 1;
        const streak = recordMade(run);
        hud.shout(madeAnnouncement(streak));
        audio.scored(streak);
      }
      if (stepped.contacts.includes("rim")) {
        kicks.rim = ball.x < world.hoopWorld.rimX ? -1 : 1;
      }
      if (stepped.splat) {
        // The catalog owns how it looks, the physics owns where and how hard.
        addSplat(splats, { ...stepped.splat, ...ballSplat(run.ballId) });
        audio.splat(stepped.splat.surface, { ballId: run.ballId, speed: stepped.splat.speed });
      }
      // `ball.vy` is read after the whole tick has resolved, which is exactly
      // what the floor needs: a bounce leaves the floor with speed, a roll
      // leaves it with none, and only the first one should be heard.
      for (const contact of new Set(stepped.contacts)) {
        // The contact the ball burst on has already been spoken for — see
        // `audio.splat`. Playing both is the wall thudding at a ball that is
        // still stuck to it.
        if (stepped.splat?.surface === contact) continue;
        audio.contact(contact, { ballId: run.ballId, speed: ball.vy });
      }

      const progress = advanceShot(
        shot,
        {
          ball,
          hoop,
          hoopWorld: world.hoopWorld,
          contacts: stepped.contacts,
          scored: shot.scored,
          settled: isBallSettled(ball),
        },
        TICK_SECONDS,
      );

      for (const announcement of progress.announcements) hud.shout(announcement);

      if (progress.finished) {
        if (!shot.scored) {
          recordMiss(run);
          audio.missed();
        }
        shot = createShot();
        resetBall(ball);
        hud.setPower(0);
      }
      syncHud();
    } else {
      hud.setClock(formatClock(run));
    }

    // Powder is advanced on the tick clock, not the frame clock, so it blows
    // away at the same rate on a 144Hz monitor as on a 60Hz one.
    tickSplatField(splats, TICK_SECONDS);

    // Wobble decays toward rest. Frame-rate independent by construction, since
    // this only ever runs inside a fixed tick.
    kicks.net *= Math.pow(0.055, TICK_SECONDS);
    kicks.rim *= Math.pow(0.018, TICK_SECONDS);
    if (Math.abs(kicks.net) < 0.002) kicks.net = 0;
    if (Math.abs(kicks.rim) < 0.002) kicks.rim = 0;

    if (isRunComplete(run, { shotInFlight: shot.state === SHOT_FLIGHT })) finishRun();
  }

  function draw() {
    const hoop = hoopAt(run.modeId, motionSeconds(run));
    const trajectory =
      pull && pull.power > 0.03
        ? trajectoryPoints(
            { x: ball.x, y: ball.y, z: ball.z },
            solveLaunch({
              origin: { x: ball.x, y: ball.y, z: ball.z },
              aim: { x: pull.aimX, y: pull.aimY },
              power: pull.power,
              loft: pull.loft,
              weight: ballFlight(run.ballId).weight,
            }),
          )
        : null;

    renderFrame(ctx, {
      ball,
      hoop,
      backdrop: assets.backdrop(run.locationId),
      ballFrames: assets.ballFrames(run.ballId),
      ballId: run.ballId,
      pull,
      trajectory,
      kicks,
      scored: shot.scored,
      splats,
      splatImages: assets.ballSplats(run.ballId),
    });
  }

  function loop(timestamp) {
    if (lastTime === null) lastTime = timestamp ?? performance.now();
    if (timestamp == null) {
      requestAnimationFrame(loop);
      return;
    }

    // Clamped so a backgrounded tab does not return and run a thousand ticks.
    accumulator += Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;

    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      tick();
    }

    // A court is only drawn while it is on screen, or once when something
    // off-screen changed (a late-loading image, a screen change).
    if (screens.current() === SCREEN_HOWTO) {
      redrawRequested = false;
      practice.draw();
    } else if (screens.current() === SCREEN_GAME || redrawRequested) {
      redrawRequested = false;
      draw();
    }

    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------

  renderMenu();
  renderSetup();
  renderBoards();
  soundToggle.render(audio.isMuted());
  hud.setMode(hoopModeById(run.modeId).hudLabel);
  syncHud();
  requestAnimationFrame(loop);

  // Exposed so a run can be driven and inspected from the console.
  return {
    state: () => ({ run, shot, ball, splats, screen: screens.current(), paused }),
    show: (name) => screens.show(name),
  };
}
