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

import { DEFAULT_BALL, ballFlight, ballSplat, ballTrail } from "./assets/ball-catalog.js";
import { createAssetLibrary } from "./assets/loader.js";
import { createGameAudio } from "./audio/game-audio.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import { addFire, clearFlameTrail, createFlameTrail, emitFlameTrail, tickFlameTrail } from "./effects/flame-trail.js";
import { createPracticeCourt } from "./practice-court.js";
import { bootTicTacToe } from "./tic-tac-toe-game.js";
import { bootHorse } from "./horse-game.js";
import { bootTrickShot } from "./trick-shot-game.js";
import { DEFAULT_WORD } from "./sim/horse.js";
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
  onFireLevel,
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
import { BIN_GAME_TYPES, createSetupView, describeSetup } from "./ui/setup-view.js";
import { createSoundToggle } from "./ui/sound-toggle.js";
import { createHandToggle } from "./ui/hand-toggle.js";
import { createThemeView } from "./ui/theme.js";
import { createOnlineView } from "./ui/online-view.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import { createMiniHoopsAccountAccess } from "./multiplayer/account-access.js";
import { createMiniHoopsOnlineClient } from "./multiplayer/online-client.js";
import { createHotseatDuel, completeHotseatTurn, resumeHotseatDuel } from "./multiplayer/hotseat-duel.js";
import { normalizeMatchConfig } from "./multiplayer/match-config.js";
import { createPlatformApiClient } from "../../../js/platform/api/platform-api.mjs";
import {
  SCREEN_BOARDS,
  SCREEN_CUSTOMIZE,
  SCREEN_GAME,
  SCREEN_HOWTO,
  SCREEN_MENU,
  COURT_SCREENS,
  SCREEN_ONLINE,
  SCREEN_TIC_TAC_TOE,
  SCREEN_HORSE,
  SCREEN_TRICK_SHOT,
  SCREEN_SETUP,
  createScreenRouter,
  matchSetupScreen,
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
  let playMode = "solo";
  let hotseat = null;
  let setupGameType = "classic";
  // The HORSE word. Held here rather than in the preferences store, which
  // validates every value it keeps against a catalog — a free-text word has no
  // catalog to be resolved through, so it would be the one field in that file
  // that could come back as anything. `sim/horse.js` sanitises it on the way in.
  let setupWord = DEFAULT_WORD;
  let onlineSnapshot = null;
  let onlineRating = null;
  let onlineMatchKey = "";
  let onlineStartsLocal = 0;
  let onlineEndsLocal = 0;
  let onlineResultShown = false;
  let reportedOnlineSession = "";

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
  // The magma ball burns, and what it leaves in the air and on the floor is a
  // second transient field beside the splats. Same layer, same tick clock, and
  // the same guarantee: it cannot touch a score. See `effects/flame-trail.js`.
  const trail = createFlameTrail();

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
      [SCREEN_ONLINE]: root.querySelector("#onlineScreen"),
      [SCREEN_GAME]: root.querySelector("#gameScreen"),
      [SCREEN_TIC_TAC_TOE]: root.querySelector("#ticTacToeScreen"),
      [SCREEN_HORSE]: root.querySelector("#horseScreen"),
      [SCREEN_TRICK_SHOT]: root.querySelector("#trickShotScreen"),
      [SCREEN_BOARDS]: root.querySelector("#boardsScreen"),
      [SCREEN_HOWTO]: root.querySelector("#howToScreen"),
      [SCREEN_CUSTOMIZE]: root.querySelector("#customizeScreen"),
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
  const handToggle = createHandToggle(root);
  // How the cabinet is dressed. It paints the page from the theme catalog and
  // keeps every copy of the picker in step — the gallery on the Customize
  // screen and the compact strip filling the setup screen's empty column.
  const themeView = createThemeView(root, { onSelect: (themeId) => setTheme(themeId) });
  const accountAccess = createMiniHoopsAccountAccess();
  const platformApi = createPlatformApiClient();
  const onlineClient = createMiniHoopsOnlineClient({ resolveIdentity: () => accountAccess.identity() });
  const onlineView = createOnlineView(root, {
    onQuick: (config) => onlineClient.findQuickMatch(config),
    onCreate: (config) => onlineClient.createPrivateRoom(config),
    onJoin: (code) => code && onlineClient.joinPrivateRoom(code),
    onTicTacToe: ({ action, roomCode }) => {
      openTicTacToe({ mode: "online", action, room: roomCode });
    },
    onHorse: ({ action, roomCode, word }) => {
      setupWord = word || setupWord;
      openHorse({ mode: "online", action, room: roomCode, word: setupWord });
    },
    onConfig: (config) => {
      if (onlineSnapshot?.lobby?.ownerId === onlineSnapshot.clientId) onlineClient.updateConfig(config);
    },
    onStart: () => onlineClient.startMatch(),
    onLeave: () => {
      leaveOnlineSession();
      screens.show(SCREEN_MENU);
    },
  });
  onlineClient.subscribe(handleOnlineSnapshot);
  if (accountAccess.isEligible()) onlineClient.resumeSavedSession();

  // Floor Tic-Tac-Toe. Its own root and its own loop — like the practice court —
  // but the cabinet's audio, so the soundtrack does not stop and the ball is
  // audible. It used to be a separate HTML page, which is what silenced both.
  //
  // It owns two sections: the court, which the router knows about, and its
  // lobby, which is shown alongside. `onShowLobby` is how it asks for the swap
  // without being handed the router.
  const ticTacToeLobby = root.querySelector("#ticTacToeOnlineScreen");
  const ticTacToeCourt = root.querySelector("#ticTacToeScreen");
  const ticTacToe = bootTicTacToe(root, {
    audio,
    accountAccess,
    onShowLobby: (showLobby) => {
      // THE ROUTER OWNS WHICH SCREEN IS UP; this only swaps between the court
      // and its lobby once tic-tac-toe is already the screen. Without the
      // guard, the boot-time render called this with `false` and switched the
      // court ON — so the tic-tac-toe game view sat over the title screen from
      // the moment the cabinet loaded, before anybody had chosen anything.
      if (screens.current() !== SCREEN_TIC_TAC_TOE) return;
      if (ticTacToeLobby) ticTacToeLobby.classList.toggle("is-active", showLobby);
      ticTacToeCourt?.classList.toggle("is-active", !showLobby);
    },
    onLeave: () => {
      ticTacToe.exit();
      if (ticTacToeLobby) ticTacToeLobby.classList.remove("is-active");
      screens.show(SCREEN_MENU);
    },
  });

  // HORSE owns two sections the same way tic-tac-toe does: the court, which the
  // router knows about, and its online lobby, which is swapped in alongside.
  const horseLobby = root.querySelector("#horseOnlineScreen");
  const horseCourt = root.querySelector("#horseScreen");
  const horse = bootHorse(root, {
    audio,
    accountAccess,
    onShowLobby: (showLobby) => {
      // Same guard, same reason as tic-tac-toe's: the router owns which screen
      // is up, and the boot-time render of this callback must not switch a court
      // on over the title screen.
      if (screens.current() !== SCREEN_HORSE) return;
      if (horseLobby) horseLobby.classList.toggle("is-active", showLobby);
      horseCourt?.classList.toggle("is-active", !showLobby);
    },
    onLeave: () => {
      horse.exit();
      if (horseLobby) horseLobby.classList.remove("is-active");
      screens.show(SCREEN_MENU);
    },
  });

  // Trick Shot Lab is a fourth court root. Its named bank belongs only to the
  // lab; the sandbox piece catalog beneath it is the seam HORSE can reuse later.
  const trickShot = bootTrickShot(root, {
    audio,
    onLeave: () => {
      trickShot.exit();
      screens.show(SCREEN_MENU);
    },
  });

  function openTrickShot() {
    overlays.hideAll();
    screens.show(SCREEN_TRICK_SHOT);
    trickShot.enter(preferences.snapshot());
  }

  /** Enter HORSE in a given mode. The one door into that screen. */
  function openHorse(options) {
    overlays.hideAll();
    screens.show(SCREEN_HORSE);
    horse.enter({ word: setupWord, ...options });
  }

  /** Enter floor tic-tac-toe in a given mode. The one door into that screen. */
  function openTicTacToe(options) {
    overlays.hideAll();
    screens.show(SCREEN_TIC_TAC_TOE);
    ticTacToe.enter(options);
  }

  // The How to Play demo. It runs the same sim on its own canvas, so the only
  // thing this file owes it is a place in the tick order and the cosmetic
  // choices the player has already made.
  // The demo's own ball. It starts as whatever the player has selected for a
  // run and can be swapped freely here without touching that selection: this
  // screen is a sandbox, and a ball picked while learning the pull is not a
  // decision about the next run.
  let practiceBallId = DEFAULT_BALL;

  const practiceView = createPracticeView(root, {
    onBallSelect: (ballId) => {
      if (practice.isBusy()) return;
      practiceBallId = ballId;
      practice.setStyle({ ballId });
      practiceView.setBallChoice({ ballId, enabled: true });
      requestRedraw();
    },
  });
  const practice = createPracticeCourt(root.querySelector("#practiceCourt"), {
    assets,
    audio,
    onPower: (power) => practiceView.setPower(power),
    onSay: (text) => practiceView.say(text),
    onTally: (tally) => {
      practiceView.setTally(tally);
      practiceView.setHintVisible(tally.taken === 0);
    },
    onBusy: (busy) => practiceView.setBallChoice({ ballId: practiceBallId, enabled: !busy }),
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
    setup.render({ ...preferences.snapshot(), gameType: setupGameType, playMode, word: setupWord });
    const title = root.querySelector("#setupTitle");
    const intro = root.querySelector("#setupIntro");
    const start = root.querySelector("#setupStartButton");
    if (title) title.textContent = playMode === "hotseat" ? "Set Up Hotseat" : "Set Up the Run";
    // Tic-tac-toe is a game TYPE picked on this screen, in both solo and
    // hotseat. It used to be a sixth command on the title marquee, which put a
    // whole second game on the front door beside the four ways into the first
    // one — and left solo tic-tac-toe as the only mode in the cabinet you could
    // not reach from a setup screen.
    const ticTacToe = playMode !== "online" && setupGameType === "tic-tac-toe";
    const horseMode = playMode !== "online" && setupGameType === "horse";
    const opponent = playMode === "hotseat" ? "Two players" : "You and the CPU";
    if (intro) {
      intro.textContent = horseMode
        ? `${opponent} take turns. Place a bin anywhere in the room, make the shot, and the other player has to match it — miss and you take a letter.`
        : ticTacToe
          ? `${opponent} alternate shots at the nine bins. Three in a row wins — there is no clock.`
          : playMode === "hotseat"
            ? "Player 1 takes a full timed turn, then passes the court to Player 2."
            : "The clock starts on your first real pull, not before.";
    }
    if (start) {
      start.textContent = horseMode
        ? "Start HORSE"
        : ticTacToe ? "Start Tic-Tac-Toe" : playMode === "hotseat" ? "Start Player 1" : "Start Run";
    }
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

  function startRun(config = preferences.snapshot()) {
    run = createRun(normalizeMatchConfig(config));
    shot = createShot();
    resetBall(ball);
    pull = null;
    pullPointerId = null;
    paused = false;
    resultsShown = false;
    kicks.net = 0;
    kicks.rim = 0;
    clearSplatField(splats);
    clearFlameTrail(trail);

    if (playMode === "online") {
      run.status = RUN_RUNNING;
      run.remaining = run.duration;
    }

    overlays.hideAll();
    audio.runStarted();
    hud.setMode(hoopModeById(run.modeId).hudLabel);
    hud.setPower(0);
    hud.setHintVisible(true);
    hud.shout("");
    syncHud();
    screens.show(SCREEN_GAME);
    syncMatchStrip();
  }

  function finishRun() {
    if (resultsShown) return;
    resultsShown = true;
    const summary = runSummary(run);
    run.recorded = true;
    if (playMode === "hotseat") {
      completeHotseatTurn(hotseat, summary);
      if (hotseat.phase === "pass") {
        hud.shout("PASS THE COURT");
        overlays.showHotseatPass(summary, hotseat.players[0].name);
      } else {
        const draw = hotseat.winnerIndexes.length > 1;
        const winner = hotseat.players[hotseat.winnerIndexes[0]];
        hud.shout(draw ? "DRAW!" : `${winner.name.toUpperCase()} WINS!`);
        overlays.showDuelResults(summary, {
          title: draw ? `Draw · ${winner.score} each` : `${winner.name} wins ${winner.score}–${hotseat.players[1 - hotseat.winnerIndexes[0]].score}`,
        });
      }
      syncMatchStrip();
      return;
    }

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
    // The shout that says ON FIRE! lasts 650ms; this is the part that stays lit
    // for as long as the streak does, so a player glancing at the card mid-run
    // can see they are still on it. Same question, one answer — `onFireLevel`.
    hud.setOnFire(onFireLevel(run.streak));
    hud.setBest(boards.bestScore(run.modeId, run.duration));
    syncMatchStrip();
  }

  function syncMatchStrip() {
    const strip = root.querySelector("#matchScoreStrip");
    if (!strip) return;
    strip.hidden = playMode === "solo";
    if (playMode === "hotseat" && hotseat) {
      root.querySelector("#matchLocalName").textContent = hotseat.players[0].name;
      root.querySelector("#matchRemoteName").textContent = hotseat.players[1].name;
      root.querySelector("#matchLocalScore").textContent = hotseat.activePlayerIndex === 0 ? run.score : hotseat.players[0].score;
      root.querySelector("#matchRemoteScore").textContent = hotseat.activePlayerIndex === 1 ? run.score : hotseat.players[1].score;
      return;
    }
    if (playMode === "online" && onlineSnapshot?.matchState) {
      const state = onlineSnapshot.matchState;
      const me = state.players?.find(({ id }) => id === onlineSnapshot.clientId);
      const opponent = state.players?.find(({ id }) => id !== onlineSnapshot.clientId);
      root.querySelector("#matchLocalName").textContent = me?.name || "You";
      root.querySelector("#matchRemoteName").textContent = opponent?.name || "Opponent";
      root.querySelector("#matchLocalScore").textContent = me?.score || 0;
      root.querySelector("#matchRemoteScore").textContent = opponent?.score || 0;
    }
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
      && (playMode !== "online" || Date.now() >= onlineStartsLocal)
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
    if (pull.distance >= PULL_MIN && playMode !== "online") startClock(run);
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
    if (playMode === "online") {
      const me = onlineSnapshot?.matchState?.players?.find(({ id }) => id === onlineSnapshot.clientId);
      onlineClient.submitShot({
        power: released.power,
        aimX: released.aimX,
        aimY: released.aimY,
        loft: released.loft,
        expectedShotNumber: me?.shots || 0,
      });
    } else {
      recordShot(run);
    }
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
    if (command === "solo") {
      playMode = "solo";
      hotseat = null;
      screens.show(SCREEN_SETUP);
    }
    else if (command === "hotseat") {
      playMode = "hotseat";
      hotseat = createHotseatDuel(preferences.snapshot());
      screens.show(SCREEN_SETUP);
    }
    else if (command === "online") openOnline();
    else if (command === "trickshot") openTrickShot();
    else if (command === "boards") screens.show(SCREEN_BOARDS);
    else if (command === "howto") screens.show(SCREEN_HOWTO);
    else if (command === "customize") screens.show(SCREEN_CUSTOMIZE);
  }

  async function openOnline() {
    if (!accountAccess.requireAccount()) return;
    playMode = "online";
    screens.show(SCREEN_ONLINE);
    onlineClient.connect();
    const identity = accountAccess.identity();
    onlineRating = await platformApi.getGameRating("mini-hoops", identity.playerId).catch(() => null);
    renderOnline();
  }

  function renderOnline() {
    onlineView.render({
      snapshot: onlineSnapshot || onlineClient.getSnapshot(),
      config: preferences.snapshot(),
      identity: accountAccess.identity(),
      rating: onlineRating,
    });
  }

  function handleOnlineSnapshot(snapshot) {
    onlineSnapshot = snapshot;
    renderOnline();
    if (!snapshot.matchState) return;
    playMode = "online";
    const state = snapshot.matchState;
    const key = `${state.roomCode}:${state.startAt}`;
    if (onlineMatchKey !== key) {
      onlineMatchKey = key;
      onlineResultShown = false;
      const offset = Date.now() - Number(state.serverNow || Date.now());
      onlineStartsLocal = Number(state.startAt) + offset;
      onlineEndsLocal = Number(state.endsAt) + offset;
      startRun(state.config);
    }
    syncAuthoritativeOnlineState(state);
    if (state.phase === "complete") finishOnlineMatch(state);
  }

  /** Clear every piece of per-lobby client state before another match is opened. */
  function leaveOnlineSession() {
    onlineClient.leave();
    onlineSnapshot = null;
    onlineMatchKey = "";
    onlineStartsLocal = 0;
    onlineEndsLocal = 0;
    onlineResultShown = false;
  }

  function syncAuthoritativeOnlineState(state) {
    const me = state.players?.find(({ id }) => id === onlineSnapshot.clientId);
    if (me) {
      run.score = me.score;
      run.shots = me.shots;
      run.made = me.made;
      run.streak = me.streak;
      run.bestStreak = me.bestStreak;
    }
    syncHud();
  }

  function finishOnlineMatch(state) {
    if (onlineResultShown) return;
    onlineResultShown = true;
    resultsShown = true;
    const me = state.players.find(({ id }) => id === onlineSnapshot.clientId);
    const opponent = state.players.find(({ id }) => id !== onlineSnapshot.clientId);
    const winners = state.result?.winnerIds || [];
    const draw = winners.length > 1;
    const won = winners.includes(me?.id);
    const title = draw ? `Draw · ${me?.score || 0} each` : won
      ? `You win ${me?.score || 0}–${opponent?.score || 0}`
      : `${opponent?.name || "Opponent"} wins ${opponent?.score || 0}–${me?.score || 0}`;
    overlays.showDuelResults(runSummary(run), {
      title,
      record: onlineRating ? `${onlineRating.wins}W–${onlineRating.losses}L` : "Saving…",
      recordLabel: "Factory Record",
      replayable: false,
    });
    reportOnlineResult(state, me, opponent, draw ? "draw" : won ? "win" : "loss");
  }

  async function reportOnlineResult(state, me, opponent, outcome) {
    const sessionId = `${state.roomCode}:${state.startAt}`;
    if (!me?.accountPlayerId || !opponent?.accountPlayerId || reportedOnlineSession === sessionId) return;
    reportedOnlineSession = sessionId;
    await platformApi.updateGameRating("mini-hoops", {
      opponentPlayerId: opponent.accountPlayerId,
      outcome,
      sessionId,
    }).catch(() => null);
    onlineRating = await platformApi.getGameRating("mini-hoops", me.accountPlayerId).catch(() => onlineRating);
    if (onlineRating) root.querySelector("#resultRank").textContent = `${onlineRating.wins}W–${onlineRating.losses}L`;
  }

  function handleSetupSelect(kind, value) {
    if (kind === "game") setupGameType = BIN_GAME_TYPES.has(value) ? value : "classic";
    else if (kind === "word") setupWord = value;
    else if (kind === "mode") preferences.setMode(value);
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
        if (playMode !== "online" && setupGameType === "tic-tac-toe") {
          openTicTacToe({ mode: playMode === "hotseat" ? "local" : "cpu" });
          break;
        }
        if (playMode !== "online" && setupGameType === "horse") {
          openHorse({ mode: playMode === "hotseat" ? "local" : "cpu", word: setupWord });
          break;
        }
        if (playMode === "hotseat") hotseat = createHotseatDuel(preferences.snapshot());
        startRun(hotseat?.config || preferences.snapshot());
        break;
      case "next-hotseat":
        resumeHotseatDuel(hotseat);
        startRun(hotseat.config);
        break;
      case "pause":
        setPaused(true);
        break;
      case "resume":
        setPaused(false);
        break;
      case "restart":
        if (playMode === "hotseat") hotseat = createHotseatDuel(hotseat?.config || preferences.snapshot());
        startRun(hotseat?.config || preferences.snapshot());
        break;
      case "quit":
        overlays.hideAll();
        if (playMode === "online") leaveOnlineSession();
        screens.show(SCREEN_MENU);
        break;
      case "change-setup":
        overlays.hideAll();
        if (playMode === "online") leaveOnlineSession();
        screens.show(matchSetupScreen(playMode));
        break;
      case "view-boards":
        overlays.hideAll();
        screens.show(SCREEN_BOARDS);
        break;
      case "toggle-sound":
        setMuted(!audio.isMuted());
        break;
      case "toggle-hand":
        setHand(preferences.hand === "left" ? "right" : "left");
        break;
      case "toggle-motion":
        setMotion(preferences.motion === "calm" ? "full" : "calm");
        break;
      case "leave-horse":
      case "horse-rematch":
      case "horse-lobby":
        // Handled by the HORSE root's own listeners; named here so the
        // markup-coherence test can see every intent is accounted for. The
        // match, its word and its lobby all belong to that root — routing a
        // rematch through the cabinet would give two owners to one match.
        break;
      case "leave-tic-tac-toe":
      case "tic-tac-toe-rematch":
      case "tic-tac-toe-lobby":
        // Handled by the tic-tac-toe root's own listeners, for the same reason.
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

  /**
   * Which side of a sideways screen the court sits on.
   *
   * Nothing but the stylesheet is told: the canvas is drawn identically either
   * way, so there is no run to restart and no sim to inform. That is what makes
   * this safe to flip mid-match from the pause card.
   */
  function setHand(next) {
    handToggle.render(preferences.setHand(next));
  }

  /**
   * How the cabinet is dressed, and how much it moves on its own.
   *
   * Both are CHROME. Nothing under `sim/` is told, the canvas is drawn
   * identically under every theme, and neither appears in
   * `preferences.snapshot()` — a run set in Arcade is the same run as one set
   * in Hardwood, which is what keeps one board meaning one thing. That is also
   * why this is safe to change from a pause card mid-run.
   *
   * Rendered together because they are one view: `ui/theme.js` writes both onto
   * the root element in the same pass, and splitting them would mean two calls
   * that have to stay in the right order.
   */
  function renderCabinet() {
    themeView.render({ themeId: preferences.themeId, motion: preferences.motion });
  }

  function setTheme(next) {
    preferences.setTheme(next);
    renderCabinet();
  }

  function setMotion(next) {
    preferences.setMotion(next);
    renderCabinet();
  }

  root.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    // HORSE is the one screen that reads arrow keys, and it only does so while
    // a bin is being placed. It gets first refusal and reports whether it used
    // the key, so nothing else in the cabinet has to know it exists.
    if (screens.current() === SCREEN_HORSE && horse.handleKey(event)) {
      event.preventDefault();
      return;
    }
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
    // Leaving a court cuts whatever it was still saying — a countdown that
    // followed the player back to the menu would be a bug you could hear.
    // BOTH courts count: `silence()` here on the way into tic-tac-toe would kill
    // the bounce of the shot the player is watching. It never touches the
    // soundtrack either way; music is the room, not the game.
    if (!COURT_SCREENS.includes(next)) audio.silence();
    // The loop is stopped on the way out rather than left spinning behind the
    // menu, where the CPU would go on taking turns unobserved.
    if (next !== SCREEN_TIC_TAC_TOE && ticTacToe.isActive()) ticTacToe.exit();
    if (next !== SCREEN_HORSE && horse.isActive()) horse.exit();
    if (next !== SCREEN_TRICK_SHOT && trickShot.isActive()) trickShot.exit();
    if (next !== SCREEN_TIC_TAC_TOE && ticTacToeLobby) ticTacToeLobby.classList.remove("is-active");
    if (next === SCREEN_MENU) {
      accountAccess.syncButton(root.querySelector("#onlineMenuButton"));
      renderMenu();
      menu.focus();
    } else if (next === SCREEN_SETUP) {
      renderSetup();
    } else if (next === SCREEN_ONLINE) {
      renderOnline();
    } else if (next === SCREEN_BOARDS) {
      renderBoards();
    } else if (next === SCREEN_HOWTO) {
      // Opening the demo always starts it clean, and dressed in whatever room
      // and ball the player has selected. The room cannot change how the
      // practice shot behaves; the BALL can, and should — the demo exists to
      // teach the pull, and the pull is different in a bowling ball's hands.
      const current = preferences.snapshot();
      practiceBallId = current.ballId;
      practice.setStyle({ ballId: current.ballId, locationId: current.locationId });
      practice.reset();
      practiceView.setBallChoice({ ballId: practiceBallId, enabled: true });
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

    const { expired } = playMode === "online" ? tickOnlineClock() : tickClock(run, TICK_SECONDS);
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
      // Shed from where the ball ACTUALLY ended the tick, after every collider
      // has had its say — so a ball that just came off the rim trails from the
      // rim rather than from where it would have been had nothing stopped it.
      emitFlameTrail(trail, { ...ball, dt: TICK_SECONDS, style: ballTrail(run.ballId) });

      if (stepped.scored) {
        kicks.net = 1;
        const streak = playMode === "online" ? run.streak : recordMade(run);
        hud.shout(madeAnnouncement(streak));
        audio.scored(streak);
      }
      if (stepped.contacts.includes("rim")) {
        kicks.rim = ball.x < world.hoopWorld.rimX ? -1 : 1;
      }
      if (stepped.splat) {
        // The catalog owns how it looks, the physics owns where and how hard.
        addSplat(splats, { ...stepped.splat, ballId: run.ballId, ...ballSplat(run.ballId) });
        audio.splat(stepped.splat.surface, { ballId: run.ballId, speed: stepped.splat.speed });
      }
      // `ball.vy` is read after the whole tick has resolved, which is exactly
      // what the floor needs: a bounce leaves the floor with speed, a roll
      // leaves it with none, and only the first one should be heard.
      for (const contact of new Set(stepped.contacts)) {
        // A burning ball lights what it lands on. `addFire` is what knows
        // whether this contact started a fire or fell inside one already
        // burning, so the sizzle follows ITS answer rather than the collider's
        // report — which arrives once per 8ms substep for as long as the ball
        // rolls. A ball with no trail block hands in null and nothing happens.
        if (addFire(trail, { ...ball, surface: contact, style: ballTrail(run.ballId) })) audio.sizzle(run.ballId);
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
        if (!shot.scored && playMode !== "online") {
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
    tickFlameTrail(trail, TICK_SECONDS);

    // Wobble decays toward rest. Frame-rate independent by construction, since
    // this only ever runs inside a fixed tick.
    kicks.net *= Math.pow(0.055, TICK_SECONDS);
    kicks.rim *= Math.pow(0.018, TICK_SECONDS);
    if (Math.abs(kicks.net) < 0.002) kicks.net = 0;
    if (Math.abs(kicks.rim) < 0.002) kicks.rim = 0;

    if (playMode !== "online" && isRunComplete(run, { shotInFlight: shot.state === SHOT_FLIGHT })) finishRun();
  }

  function tickOnlineClock() {
    const now = Date.now();
    run.elapsed = Math.max(0, (now - onlineStartsLocal) / 1000);
    run.played = Math.max(0, Math.min(run.duration, run.elapsed));
    run.remaining = Math.max(0, (onlineEndsLocal - now) / 1000);
    const expired = run.status !== RUN_EXPIRED && run.remaining <= 0;
    if (expired) run.status = RUN_EXPIRED;
    return { expired };
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
      locationId: run.locationId,
      ballFrames: assets.ballFrames(run.ballId),
      ballId: run.ballId,
      pull,
      trajectory,
      kicks,
      scored: shot.scored,
      splats,
      splatImagesFor: assets.ballSplats,
      trail,
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
  handToggle.render(preferences.hand);
  // Before the first frame: the theme is fourteen custom properties on the root
  // element, and the stylesheet's own defaults are the Midnight ones — so a
  // cabinet opened in any other theme would otherwise paint one frame in the
  // wrong colours on every boot.
  renderCabinet();
  accountAccess.syncButton(root.querySelector("#onlineMenuButton"));
  hud.setMode(hoopModeById(run.modeId).hudLabel);
  syncHud();
  requestAnimationFrame(loop);

  // Exposed so a run can be driven and inspected from the console.
  return {
    state: () => ({ run, shot, ball, splats, screen: screens.current(), paused }),
    show: (name) => screens.show(name),
  };
}
