// Floor Tic-Tac-Toe: a second composition root, on the cabinet's own page.
//
// IT IS A SCREEN, NOT A PAGE. It used to be `tic-tac-toe-stage.html`, and every
// cost of that landed somewhere visible: navigating to a new document destroys
// the <audio> element the soundtrack streams through, and a stream cannot be
// picked back up across a navigation — so entering a match cut the music dead,
// every time. Its sound effects never existed at all, because `createGameAudio`
// lives in the cabinet this page had left. And a second stylesheet spent most of
// its length undoing `game.css` for a DOM those rules were not written for.
//
// So it takes the cabinet's `audio` rather than making its own, and `screens.js`
// routes to it. There is exactly one <audio> element in the cabinet and it never
// stops.
//
// It is still its OWN ROOT — like the practice court — because it owns a
// different loop, a different board and a different set of colliders. Sharing a
// page is not sharing a controller.

import { createAssetLibrary } from "./assets/loader.js";
import { DEFAULT_BALL, ballFlight, ballSplat, ballTrail } from "./assets/ball-catalog.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import { addFire, clearFlameTrail, createFlameTrail, emitFlameTrail, tickFlameTrail } from "./effects/flame-trail.js";
import { createMiniHoopsAccountAccess } from "./multiplayer/account-access.js";
import { normalizeRoomCode } from "./multiplayer/online-client.js";
import { createTicTacToeOnlineClient } from "./multiplayer/tic-tac-toe-online-client.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, CONTACT_DEBOUNCE_SECONDS, TICK_SECONDS } from "./sim/constants.js";
import { binGridCells, createBinTargets, stepBallAgainstBins } from "./sim/bin-physics.js";
import { createBall, isBallSettled, launchBall, resetBall } from "./sim/physics.js";
import { launchSpin, trajectoryPoints } from "./sim/launch.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { ballScreenRadius, projectPoint } from "./sim/projection.js";
import {
  createTicTacToeShot,
  nearestOpenCellForShot,
  ticTacToePowerForDepth,
} from "./sim/tic-tac-toe-shot.js";
import {
  DIFFICULTIES,
  chooseCpuCell,
  cpuMakesShot,
  createTicTacToeMatch,
  isHumanControlledTurn,
  markForCell,
  playerLabel,
  resolveAttempt,
  TIC_TAC_TOE_FIXED_SETUP,
} from "./sim/tic-tac-toe.js";
import { drawBall } from "./render/ball.js";
import { drawAim } from "./render/aim.js";
import { binMouthEllipse, drawBinBody, drawBinLip, drawFloorMark } from "./render/bin.js";
import { clearScene, depthGradeFilter, drawBallShadow, drawRoom, prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";
import { createTurnBallPicker, normalizeTurnBallId } from "./ui/turn-ball-picker.js";
import { drawSplatDecals, drawSplatParticles } from "./render/splats.js";
import { drawFlameEmbers, drawFlameFires } from "./render/flames.js";

// One definition of what each side looks like. The floor glyph, the claimed
// cell's tint and the no-art fallback all read it, so a colour cannot drift
// between the three places a player sees it.
export const MARK_COLOURS = Object.freeze({ x: "#ff4fd8", o: "#28d8ff" });

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";
const X_PATH = "assets/modes/floor-tic-tac-toe/neon-x.png";
const O_PATH = "assets/modes/floor-tic-tac-toe/neon-o.png";
// The room is fixed and the ball id is the per-turn default — the setup screen
// reads the same record to know which of its pre-match pickers to put away.
const { locationId: ROOM_ID } = TIC_TAC_TOE_FIXED_SETUP;

/**
 * A silent stand-in, so the root can be constructed in a test without a browser.
 * Same pattern and same reason as `practice-court.js`.
 */
const SILENT_AUDIO = Object.freeze({
  released() {}, contact() {}, binScored() {}, missed() {}, celebrate() {}, click() {}, splat() {},
});

export function capturedBinForDraw(flight) {
  return Number.isInteger(flight?.capturedBin) ? flight.capturedBin : null;
}

/**
 * Is the ball loose in the room, rather than dropping into a bin?
 *
 * A captured ball is still DRAWN — clipped into its bin's mouth, so it visibly
 * sinks out of sight instead of blinking out of existence at the mouth plane,
 * which is what it used to do. This is the flag for which of the two ways it is
 * drawn, not for whether it is drawn at all.
 */
export function isBallLooseInRoom(flight) {
  return capturedBinForDraw(flight) === null;
}

export function ticTacToeMode(value) {
  return value === "local" || value === "online" ? value : "cpu";
}

export function bootTicTacToe(root, options = {}) {
  const random = options.random || Math.random;
  // The cabinet's audio, not a second one. See the note at the top of the file.
  const audio = options.audio || SILENT_AUDIO;
  // How this root asks the cabinet to change screens. It owns a court and a
  // lobby; it does not own the router.
  const onShowLobby = options.onShowLobby || (() => {});
  const onLeave = options.onLeave || (() => {});
  const accountAccess = options.accountAccess || createMiniHoopsAccountAccess();
  const onlineClient = options.onlineClient || createTicTacToeOnlineClient({
    resolveIdentity: () => accountAccess.identity(),
  });
  const canvas = root.querySelector("#ticTacToeCourt");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  const assets = createAssetLibrary({ onLoad: () => draw() });
  const art = {
    room: assets.backdrop(ROOM_ID),
    bin: assets.image(BIN_PATH),
    x: assets.image(X_PATH),
    o: assets.image(O_PATH),
  };
  const bins = createBinTargets();
  const cells = binGridCells();
  const ball = createBall();
  const splats = createSplatField();
  // The magma ball burns, and what it leaves in the air and on the floor is a
  // second transient field beside the splats. Same layer, same tick clock, and
  // the same guarantee: it cannot touch a score. See `effects/flame-trail.js`.
  const trail = createFlameTrail();
  const scoredAt = new Map();
  // When each kind of contact last sounded, for the debounce in `announce`.
  const lastContactAt = new Map();

  // Mode and difficulty are settable rather than read once, because the screen
  // is entered repeatedly now — from the menu as CPU, from hotseat setup as
  // local, from the online lobby as online — and a root that latched them at
  // construction would serve whichever one was asked for first, forever.
  let mode = ticTacToeMode(options.mode);
  let difficulty = normalizeDifficulty(options.difficulty);
  let active = false;
  let match;
  let pull = null;
  let pointerId = null;
  let grabOffset = { x: 0, y: 0 };
  let flight = null;
  let cpuDelay = 0;
  let elapsed = 0;
  let accumulator = 0;
  let previousFrame = performance.now();
  let onlineSnapshot = onlineClient.getSnapshot();
  let onlineAttemptPending = false;
  // How many shots each side has taken and how many dropped. The match rules do
  // not track this — `attempts` is a match-wide counter — and a results card
  // that could only say who won would be a status line in a bigger font.
  let tally = { x: { shots: 0, made: 0 }, o: { shots: 0, made: 0 } };
  // ONLINE, THE OPPONENT'S BALL IS WATCHED RATHER THAN REPORTED. The board is
  // held here until their shot has been played out on this court — applied the
  // moment it arrives, the mark would appear before the ball had left the floor,
  // and the bin it was about to drop into would already be gone.
  let pendingMatch = null;
  let seenAttempt = -1;
  // Each side remembers its own last choice. In hotseat that keeps Player 2
  // from inheriting Player 1's ball; online, the opponent's choice is filled in
  // by the shot intent that is replayed on this court.
  let turnBalls = { x: DEFAULT_BALL, o: DEFAULT_BALL };

  const status = root.querySelector("#tttStatus");
  const assignment = root.querySelector("#tttAssignment");
  const meter = root.querySelector("#tttMeterFill");
  const readout = root.querySelector("#tttMeterReadout");
  const newMatchButton = root.querySelector("#newMatch");
  const onlinePanel = root.querySelector("#tttOnlinePanel");
  const modeLabel = root.querySelector("#tttModeLabel");
  const hint = root.querySelector("#tttHint");
  const results = {
    overlay: root.querySelector("#tttResultsOverlay"),
    glyph: root.querySelector("#tttResultGlyph"),
    title: root.querySelector("#tttResultTitle"),
    meta: root.querySelector("#tttResultMeta"),
    cells: root.querySelector("#tttResultCells"),
    cellsLabel: root.querySelector("#tttResultCellsLabel"),
    shots: root.querySelector("#tttResultShots"),
    accuracy: root.querySelector("#tttResultAccuracy"),
    rematch: root.querySelector("#tttResultRematch"),
    lobby: root.querySelector("#tttResultLobby"),
  };
  const mini = {
    grid: root.querySelector("#tttMiniGrid"),
    turn: root.querySelector("#tttMiniTurn"),
  };
  const ballPicker = createTurnBallPicker(root.querySelector("#tttBallChoices"), {
    onSelect: selectTurnBall,
  });

  onlineClient.subscribe(handleOnlineSnapshot);

  newMatchButton?.addEventListener("click", () => { audio.click(); newMatch(); });
  results.rematch?.addEventListener("click", () => { audio.click(); newMatch(); });
  // Online, a rematch is a LOBBY decision — the other player has to agree to it,
  // and the pairing they agreed to last time is a room that has finished. So the
  // card's primary button hands them back to the lobby rather than dealing a
  // second board this device alone believes in.
  results.lobby?.addEventListener("click", () => {
    audio.click();
    onlineClient.leave();
    newMatch();
  });
  for (const button of root.querySelectorAll('[data-intent="leave-tic-tac-toe"]')) {
    button.addEventListener("click", () => onLeave());
  }
  root.querySelector("#tttOnlineQuick")?.addEventListener("click", () => onlineClient.findQuickMatch());
  root.querySelector("#tttOnlineCreate")?.addEventListener("click", () => onlineClient.createPrivateRoom());
  root.querySelector("#tttOnlineJoin")?.addEventListener("click", () => {
    onlineClient.joinPrivateRoom(root.querySelector("#tttOnlineRoomInput")?.value);
  });
  root.querySelector("#tttOnlineStart")?.addEventListener("click", () => onlineClient.startMatch());
  root.querySelector("#tttOnlineLeave")?.addEventListener("click", () => onlineClient.leave());
  root.querySelector("#tttOnlineRoomInput")?.addEventListener("input", (event) => {
    event.target.value = normalizeRoomCode(event.target.value);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!canHumanAct()) return;
    const point = canvasPoint(canvas, event);
    const screenBall = screenBallPosition();
    if (!isGrab(point, screenBall)) return;
    pointerId = event.pointerId;
    grabOffset = { x: point.x - screenBall.x, y: point.y - screenBall.y };
    pull = neutralPull(screenBall);
    // The pill parks over the ball's rest position, which is the one thing the
    // player has to grab. It has done its job the moment they grab it.
    hint?.classList.add("is-hidden");
    syncBallPicker();
    canvas.setPointerCapture?.(pointerId);
    setStatus("Aim with the line · release to shoot");
    event.preventDefault();
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
    if (isShootablePull(released)) launchFromPull(released);
    else setPower(0);
    syncBallPicker();
    event.preventDefault();
  });
  canvas.addEventListener("pointercancel", () => { pull = null; pointerId = null; setPower(0); syncBallPicker(); });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function newMatch() {
    match = createTicTacToeMatch({
      mode,
      humanMark: mode === "cpu" ? (random() < 0.5 ? "x" : "o") : "x",
      difficulty,
    });
    if (mode === "online") match.status = "waiting";
    scoredAt.clear();
    lastContactAt.clear();
    clearSplatField(splats);
    clearFlameTrail(trail);
    pull = null;
    flight = null;
    onlineAttemptPending = false;
    tally = { x: { shots: 0, made: 0 }, o: { shots: 0, made: 0 } };
    pendingMatch = null;
    seenAttempt = -1;
    turnBalls = { x: DEFAULT_BALL, o: DEFAULT_BALL };
    hideResults();
    cpuDelay = mode === "cpu" ? 0.75 : 0;
    resetBall(ball);
    setPower(0);
    onShowLobby(mode === "online");
    if (newMatchButton) newMatchButton.hidden = mode === "online";
    if (modeLabel) modeLabel.textContent = mode === "local" ? "Local Hotseat" : mode === "online" ? "Online Match" : `Vs CPU · ${difficulty}`;
    syncAssignment();
    renderOnlineLobby();
    syncTurnStatus();
    hint?.classList.remove("is-hidden");
    draw();
  }

  /**
   * Turn this tick's contacts into sound.
   *
   * Debounced on the SAME rule the classic court uses: the colliders report once
   * per substep, so a ball scraping a bin wall reports a contact every 8ms, and
   * played straight that is a machine-gun rather than a knock. Two contacts of
   * the same kind closer together than CONTACT_DEBOUNCE_SECONDS are one
   * collision. The floor is exempt because `audio.contact` already judges a
   * floor hit by its speed, which is what separates a bounce from a roll.
   */
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

  function announce(contacts, ballId, splat = null) {
    for (const contact of contacts) {
      if (contact === "bin-score") continue;
      if (splat?.surface === contact) continue;
      if (contact !== "floor") {
        const last = lastContactAt.get(contact) ?? -Infinity;
        if (elapsed - last < CONTACT_DEBOUNCE_SECONDS) continue;
        lastContactAt.set(contact, elapsed);
      }
      audio.contact(contact, { ballId, speed: ball.vy });
    }
  }

  function canHumanAct() {
    return isHumanControlledTurn(match) && !flight && !onlineAttemptPending;
  }

  function currentTurnBallId() {
    return normalizeTurnBallId(turnBalls[match?.turn]);
  }

  function selectTurnBall(ballId) {
    if (!canHumanAct() || pull) return;
    turnBalls[match.turn] = normalizeTurnBallId(ballId);
    // Start loading the chosen art while the player lines up the pull.
    assets.ballFrames(turnBalls[match.turn]);
    assets.ballSplats(turnBalls[match.turn]);
    audio.click();
    syncBallPicker();
    draw();
  }

  function syncBallPicker() {
    ballPicker.render({ ballId: currentTurnBallId(), enabled: canHumanAct() && !pull });
  }

  function launchFromPull(released, attemptedCell = null) {
    if (flight) return;
    const selectedBallId = currentTurnBallId();
    const shot = createTicTacToeShot(released, ball, { weight: ballFlight(selectedBallId).weight });
    const nearest = attemptedCell ?? nearestOpenCellForShot(
      { aimX: shot.aim.x, targetZ: shot.targetZ },
      bins,
      match.board,
    );
    if (nearest === null) return;
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(selectedBallId);
    flight = {
      ballId: selectedBallId,
      attemptedCell: nearest,
      targetZ: shot.targetZ,
      age: 0,
      resolved: false,
      resetIn: null,
      capturedBin: null,
      mark: match.turn,
      // The gesture itself, kept so it can go up the wire. It is the whole of
      // what the other client needs to draw this ball: their court runs the same
      // sim, so a pull replayed there does what it did here.
      intent: { power: released.power, aimX: released.aimX, loft: released.loft, ballId: selectedBallId },
      replay: false,
    };
    syncBallPicker();
    setPower(released.power);
    setStatus(`${playerLabel(match)} (${match.turn.toUpperCase()}) shoots…`);
  }

  /**
   * Play the OPPONENT'S shot out on this court.
   *
   * The pull they made, replayed through the same sim, against the board as it
   * stood before they took it — which is why `pendingMatch` is held rather than
   * applied. HORSE has done this since it shipped and tic-tac-toe did not: a
   * letter arrives there with a ball attached, while here a cell simply changed
   * colour and the player was told about it afterwards.
   */
  function replayOpponentShot(attempt) {
    if (!attempt?.intent) return false;
    const selectedBallId = normalizeTurnBallId(attempt.intent.ballId);
    if (attempt.mark) turnBalls[attempt.mark] = selectedBallId;
    resetBall(ball);
    const shot = createTicTacToeShot(attempt.intent, ball, { weight: ballFlight(selectedBallId).weight });
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(selectedBallId);
    flight = {
      ballId: selectedBallId,
      attemptedCell: attempt.cell,
      targetZ: shot.targetZ,
      age: 0,
      resolved: false,
      resetIn: null,
      capturedBin: null,
      mark: attempt.mark,
      intent: attempt.intent,
      replay: true,
    };
    setPower(Number(attempt.intent.power) || 0);
    setStatus(`${onlineOpponentName()} shoots…`);
    return true;
  }

  function startCpuShot() {
    const cell = chooseCpuCell(match.board, match.cpuMark, match.difficulty, random);
    if (cell === null) return;
    const made = cpuMakesShot(match.difficulty, random);
    const bin = bins[cell];
    const target = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
    // CPU misses remain real throws. They are offset from the intended mouth;
    // if the mistake happens to fall through another open bin, that cell counts.
    launchFromPull({
      power: ticTacToePowerForDepth(bin.z) + (made ? 0 : -0.055),
      aimX: target.x + (made ? 0 : (bin.column === 2 ? -92 : 92)),
      loft: 1,
    }, cell);
  }

  function tick() {
    elapsed += TICK_SECONDS;
    if (flight) tickFlight();
    else if (match.mode === "cpu" && match.status === "playing" && match.turn === match.cpuMark) {
      cpuDelay -= TICK_SECONDS;
      if (cpuDelay <= 0) startCpuShot();
    }
    tickSplatField(splats, TICK_SECONDS);
    tickFlameTrail(trail, TICK_SECONDS, { random });
  }

  function tickFlight() {
    flight.age += TICK_SECONDS;
    if (!flight.resolved) {
      const activeBins = bins.filter((bin) => !match.board[bin.index]);
      const result = stepBallAgainstBins(ball, activeBins, TICK_SECONDS, {
        ballId: flight.ballId,
        capturedBin: flight.capturedBin,
      });
      emitFlameTrail(trail, { ...ball, dt: TICK_SECONDS, style: ballTrail(flight.ballId), random });
      ignite(result.contacts, flight.ballId);
      if (result.splat) {
        addSplat(splats, { ...result.splat, ballId: flight.ballId, ...ballSplat(flight.ballId), random });
        audio.splat(result.splat.surface, { ballId: flight.ballId, speed: result.splat.speed });
      }
      announce(result.contacts, flight.ballId, result.splat);
      if (result.capturedBin !== null) flight.capturedBin = result.capturedBin;
      if (result.scoredBin !== null && !match.board[result.scoredBin]) {
        resolveFlight(true, result.scoredBin);
      } else if (flight.age > 3.15 || (flight.age > 0.45 && isBallSettled(ball))) {
        resolveFlight(false, flight.attemptedCell);
      }
    } else {
      // Physics continues briefly so turn timing stays deterministic. Rendering
      // ends at the mouth plane: once captured, the bin has swallowed the ball.
      if (flight.capturedBin !== null) {
        stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: flight.ballId, capturedBin: flight.capturedBin });
      }
      flight.resetIn -= TICK_SECONDS;
      if (flight.resetIn <= 0) {
        resetBall(ball);
        flight = null;
        setPower(0);
        cpuDelay = 0.7;
        // A ruling that landed while the ball was still in the air is applied
        // now, and not one tick sooner.
        if (pendingMatch) applyOnlineMatch(pendingMatch);
        syncTurnStatus();
      }
    }
  }

  /**
   * What this shot meant.
   *
   * A REPLAY RULES ON NOTHING. It is the opponent's ball, already adjudicated by
   * both clients when the attempt was relayed; this court is watching it, and
   * the board it changes is the one held in `pendingMatch`.
   */
  function resolveFlight(made, cell) {
    const side = tally[flight.mark];
    if (side) {
      side.shots += 1;
      if (made) side.made += 1;
    }
    if (!flight.replay) {
      if (match.mode === "online") submitOnlineAttempt(cell, made);
      else {
        resolveAttempt(match, cell, made);
        if (made) scoredAt.set(cell, elapsed);
      }
    }
    flight.resolved = true;
    flight.resetIn = made ? 1.05 : 0.45;
    if (made) {
      audio.binScored(flight.ballId);
      setStatus(`${flight.mark.toUpperCase()} scores!`);
    } else {
      audio.missed();
      setStatus("Miss · turn changes");
    }
  }

  function submitOnlineAttempt(cell, made) {
    onlineAttemptPending = onlineClient.submitAttempt({
      cell,
      made,
      expectedAttempt: match.attempts,
      intent: flight?.intent,
    });
  }

  /**
   * A new word from the relay.
   *
   * TWO THINGS ARRIVE HERE AND THEY ARE HANDLED DIFFERENTLY, the way HORSE's
   * snapshots are. An attempt this device did not take is REPLAYED — the ball is
   * thrown on this court from the pull the other player made — and the board it
   * produced is held until that ball lands. Anything else is taken as read.
   */
  function handleOnlineSnapshot(snapshot) {
    onlineSnapshot = snapshot;
    renderOnlineLobby();
    if (mode !== "online" || !snapshot.matchState) return;

    const attempt = snapshot.lastAttempt;
    const unseen = Boolean(attempt) && attempt.sequence > seenAttempt;
    if (unseen) seenAttempt = attempt.sequence;
    if (unseen && !flight && attempt.shooterId !== snapshot.clientId) {
      pendingMatch = snapshot.matchState;
      if (replayOpponentShot(attempt)) {
        draw();
        return;
      }
    }
    // Either this device took the shot and has already watched it, or the court
    // is busy. A busy court takes the state when its ball comes down.
    if (flight) pendingMatch = snapshot.matchState;
    else applyOnlineMatch(snapshot.matchState);
  }

  /** Take the relay's board as the truth, and show whatever turn it describes. */
  function applyOnlineMatch(state) {
    pendingMatch = null;
    const previousBoard = match?.mode === "online" ? [...match.board] : Array(9).fill(null);
    const previousAttempts = match?.mode === "online" ? match.attempts : -1;
    match = state;
    if (match.attempts > previousAttempts) onlineAttemptPending = false;
    for (let cell = 0; cell < match.board.length; cell++) {
      if (!previousBoard[cell] && match.board[cell]) scoredAt.set(cell, elapsed);
    }
    // The lobby and the court are two screens now: a match that is still
    // waiting belongs in the lobby, and one that has started belongs on the
    // court. Nothing is hidden in place.
    onShowLobby(match.status === "waiting");
    syncAssignment();
    syncTurnStatus();
    draw();
  }

  function syncAssignment() {
    if (!assignment) return;
    if (mode === "local") {
      assignment.textContent = "PLAYER 1: X · PLAYER 2: O";
      return;
    }
    if (mode === "online") {
      const opponentMark = match?.humanMark === "x" ? "o" : "x";
      const opponentName = match?.players?.[opponentMark]?.name || "OPPONENT";
      assignment.textContent = match?.status === "waiting"
        ? "ONLINE · WAITING FOR MATCH"
        : `YOU: ${match.humanMark.toUpperCase()} · ${opponentName.toUpperCase()}: ${opponentMark.toUpperCase()}`;
      return;
    }
    assignment.textContent = `YOU: ${match.humanMark.toUpperCase()} · CPU: ${match.cpuMark.toUpperCase()}`;
  }

  function renderOnlineLobby() {
    if (!onlinePanel) return;
    const lobby = onlineSnapshot?.lobby;
    const identity = accountAccess.identity();
    const account = root.querySelector("#tttOnlineAccount");
    if (account) account.textContent = identity?.displayName || "Factory Player";
    const code = root.querySelector("#tttOnlineRoomCode");
    if (code) code.textContent = lobby?.roomCode || "-----";
    const lobbyPanel = root.querySelector("#tttOnlineLobby");
    const pairing = root.querySelector("#tttOnlinePairing");
    if (lobbyPanel) lobbyPanel.hidden = !lobby;
    if (pairing) pairing.hidden = Boolean(lobby);

    const players = root.querySelector("#tttOnlinePlayers");
    if (players) {
      const rows = lobby?.players?.length ? lobby.players : [{ name: identity?.displayName || "You" }];
      players.replaceChildren(...[0, 1].map((index) => {
        const row = document.createElement("span");
        row.textContent = rows[index]?.name || "Open slot";
        return row;
      }));
    }

    const start = root.querySelector("#tttOnlineStart");
    const isOwner = Boolean(lobby && lobby.ownerId === onlineSnapshot.clientId);
    if (start) start.hidden = !isOwner || lobby?.playerCount < 2 || lobby?.status !== "open";
    const onlineStatus = root.querySelector("#tttOnlineStatus");
    if (onlineStatus) onlineStatus.textContent = onlineSnapshot?.error?.message
      || (onlineSnapshot?.status === "searching" ? "Quick Search: finding an opponent…"
        : onlineSnapshot?.status === "creating" ? "Opening private room…"
          : onlineSnapshot?.status === "joining" ? "Joining private room…"
            : onlineSnapshot?.status === "started" ? "Match started. X shoots first."
              : onlineSnapshot?.status === "complete" ? "Match complete. Leave to start another online match."
              : lobby ? (lobby.playerCount >= 2 ? "Both players ready. The host can start." : "Waiting for Player 2…")
                : "Choose Quick Search or open a private room.");
  }

  function syncTurnStatus() {
    syncMiniBoard();
    syncResults();
    syncBallPicker();
    if (match.status === "won" && match.mode === "local") setStatus(`${playerLabel(match, match.winner).toUpperCase()} WINS!`);
    else if (match.status === "won" && match.mode === "online") setStatus(match.winner === match.humanMark ? "YOU WIN!" : `${onlineOpponentName().toUpperCase()} WINS`);
    else if (match.status === "won") setStatus(match.winner === match.humanMark ? "YOU WIN!" : "CPU WINS");
    else if (match.status === "draw") setStatus("DRAW GAME");
    else if (match.status === "abandoned") setStatus("OPPONENT LEFT · LEAVE THE LOBBY TO PLAY AGAIN");
    else if (match.status === "waiting") setStatus("Set up an online match below");
    else if (match.mode === "online" && onlineAttemptPending) setStatus("Sending shot result…");
    else if (match.mode === "online" && match.turn === match.humanMark) setStatus("Your turn · pull the ball to shoot");
    else if (match.mode === "online") setStatus(`${onlineOpponentName()} is shooting…`);
    else if (match.mode === "local") setStatus(`${playerLabel(match)} (${match.turn.toUpperCase()}) turn · pull the ball to shoot`);
    else if (match.turn === match.humanMark) setStatus("Your turn · pull the ball to shoot");
    else setStatus("CPU is choosing a shot…");
  }

  /**
   * Is the match over, and does the court know it?
   *
   * DELIBERATELY GATED ON THE BALL. `syncTurnStatus` runs the moment a shot
   * resolves, and a card thrown up over the ball still dropping through the bin
   * that won the match would hide the only interesting shot of it. Every caller
   * that matters runs again when the ball is handed back.
   */
  function syncResults() {
    if (!results.overlay) return;
    const over = match.status === "won" || match.status === "draw" || match.status === "abandoned";
    if (!over || flight) {
      hideResults();
      return;
    }

    const online = match.mode === "online";
    const drawn = match.status === "draw";
    const abandoned = match.status === "abandoned";
    // Whose card this is. In hotseat there is no "you", so it names the player.
    const glyph = drawn || abandoned ? "—" : match.winner.toUpperCase();
    const title = abandoned
      ? "Opponent Left"
      : drawn
        ? "Draw Game"
        : match.mode === "local"
          ? `${playerLabel(match, match.winner)} Wins`
          : match.winner === match.humanMark ? "You Win" : `${online ? onlineOpponentName() : "CPU"} Wins`;

    setResult(results.glyph, glyph);
    // Through MARK_COLOURS, the one definition of what each side looks like —
    // the plate says X or O and it should be the same X or O that is lit on the
    // floor, not the cabinet's brass.
    if (results.glyph) results.glyph.style.color = drawn || abandoned ? "" : MARK_COLOURS[match.winner];
    setResult(results.title, title);
    setResult(results.meta, modeLabel?.textContent || "");

    // The numbers are THIS DEVICE'S player, not the match: an accuracy that
    // averaged both hands would say nothing about either. Hotseat is the one
    // place there is no single "you", so it reports the winner's shooting.
    const mine = match.mode === "local"
      ? (drawn || abandoned ? "x" : match.winner)
      : match.humanMark;
    const side = tally[mine] || { shots: 0, made: 0 };
    setResult(results.cellsLabel, match.mode === "local" ? `${playerLabel(match, mine)} cells` : "Your cells");
    setResult(results.cells, match.board.filter((mark) => mark === mine).length);
    setResult(results.shots, side.shots);
    setResult(results.accuracy, `${side.shots ? Math.round((side.made / side.shots) * 100) : 0}%`);

    // Online, a rematch is the lobby's to arrange; offline it is one button.
    if (results.rematch) results.rematch.hidden = online;
    if (results.lobby) results.lobby.hidden = !online;
    results.overlay.classList.add("is-shown");
  }

  function hideResults() {
    results.overlay?.classList.remove("is-shown");
  }

  function setResult(node, value) {
    if (node) node.textContent = String(value);
  }

  /**
   * The board as a board, in the gutter beside the court.
   *
   * ROW 0 IS THE FAR ROW, exactly as `bin.index` has it, so the top of this grid
   * is the row against the wall. It exists because the court cannot always show
   * a claimed cell: from this camera a bin standing in the row in front covers
   * that cell's floor completely at every bin height, so the glyph on the
   * concrete is hidden by the very object the mode is played with.
   */
  function syncMiniBoard() {
    if (!mini.grid) return;
    const winning = new Set(match.winningCells || []);
    mini.grid.replaceChildren(...match.board.map((mark, cell) => {
      const node = document.createElement("div");
      node.className = winning.has(cell) ? "mini-board-cell is-winning" : "mini-board-cell";
      if (mark) node.dataset.mark = mark;
      // The glyph is its own element so it can be sized off the cell — see
      // `.mini-board-cell span` in game.css.
      const glyph = document.createElement("span");
      glyph.textContent = mark ? mark.toUpperCase() : "·";
      node.appendChild(glyph);
      return node;
    }));
    if (mini.turn) {
      mini.turn.textContent = match.status === "playing"
        ? `${playerLabel(match).toUpperCase()} · ${match.turn.toUpperCase()}`
        : match.status === "won" ? `${match.winner.toUpperCase()} WINS`
          : match.status === "draw" ? "DRAW"
            : match.status === "abandoned" ? "ABANDONED" : "WAITING";
    }
  }

  function onlineOpponentName() {
    const mark = match?.humanMark === "x" ? "o" : "x";
    return match?.players?.[mark]?.name || "Opponent";
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

  /**
   * The floor grid, drawn on the same camera as everything standing on it.
   *
   * Filled as well as stroked now. Nine bare magenta outlines on a photographed
   * concrete floor read as a decal laid over the picture; a faint dark wash
   * inside each cell is what makes them read as marked-out ground, and it gives
   * the neon something to sit against.
   */
  function drawGrid() {
    // THE PANELS ARE THE BOARD'S OWN LAYOUT, read from `sim/bin-physics.js`
    // rather than restated here. As two independent sets of numbers they
    // disagreed twice over: the rows ran the other way, so a claimed cell lit up
    // mirrored north/south and three rows from its own mark; and the cells were
    // centred on the bins' axes, which put every drum's visible base flush on
    // its cell's front line and read as the bins spilling out towards the
    // camera. `binGridCell` answers both, and it is indexed exactly as
    // `bin.index` is.
    const at = (x, z) => projectPoint({ x, y: 0.004, z });

    ctx.save();
    for (const cell of cells) {
      // A CLAIMED CELL GLOWS IN ITS OWNER'S COLOUR, and that is not decoration.
      // The glyph lies flat on the concrete, and from this camera a bin
      // standing in the row in FRONT of it covers that floor completely — at
      // every bin height, down to 12cm; the geometry was measured, and there is
      // no size that fixes it. The cell's own near edge is always visible in
      // front of the bin, so tinting the panel is what keeps the board readable
      // without moving the glyph off the floor.
      const claimed = match.board[cell.index];
      ctx.fillStyle = claimed
        ? (claimed === "o" ? "rgba(40,216,255,.30)" : "rgba(255,79,216,.30)")
        : "rgba(24,6,32,.26)";
      ctx.beginPath();
      const corners = [
        at(cell.minX, cell.minZ),
        at(cell.maxX, cell.minZ),
        at(cell.maxX, cell.maxZ),
        at(cell.minX, cell.maxZ),
      ];
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
      ctx.closePath();
      ctx.fill();
    }

    // The four lines each way, taken off the same cells — adjacent cells share
    // an edge, so stroking each quad in turn would double every interior line
    // and its glow with it.
    const xEdges = [cells[0].minX, cells[0].maxX, cells[1].maxX, cells[2].maxX];
    const zEdges = [cells[0].maxZ, cells[0].minZ, cells[3].minZ, cells[6].minZ];

    ctx.strokeStyle = "rgba(255, 45, 225, .88)";
    ctx.shadowColor = "#ff2ddd";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 5;
    for (const x of xEdges) line(at(x, zEdges[0]), at(x, zEdges[3]));
    for (const z of zEdges) line(at(xEdges[0], z), at(xEdges[3], z));
    ctx.restore();
  }

  function line(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /**
   * The ball, drawn into the bin that has it.
   *
   * Clipped to the mouth opening, so as it falls it slides out from under the
   * near lip and is gone — which is what dropping into a bin looks like. It used
   * to be cut dead at the mouth plane instead, so the ball reached the rim and
   * simply stopped existing, one frame, mid-shot.
   */
  function drawSinkingBall(bin) {
    const mouth = binMouthEllipse(bin);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mouth.cx, mouth.cy, mouth.radiusX, mouth.radiusY, 0, 0, Math.PI * 2);
    ctx.clip();
    drawBall(ctx, {
      frames: assets.ballFrames(flight.ballId),
      ballId: flight.ballId,
      ...screenBallPosition(),
      rollPhase: ball.rollPhase,
      // Dimmer than the room, because it is inside a dark drum by now.
      filter: `${depthGradeFilter(bin.z)} brightness(0.62)`,
    });
    ctx.restore();
  }

  function draw() {
    if (!match) return;
    clearScene(ctx);
    drawRoom(ctx, art.room, ROOM_ID);
    drawSplatDecals(ctx, splats, { imagesFor: assets.ballSplats });
    drawSplatParticles(ctx, splats);
    drawFlameFires(ctx, trail);
    drawFlameEmbers(ctx, trail);
    drawGrid();

    const captured = capturedBinForDraw(flight);
    const loose = isBallLooseInRoom(flight) && !ball.splat;
    const winning = new Set(match.winningCells || []);

    // Back to front, the painter's pass. Each bin draws its body, then anything
    // sitting inside it, then its near lip — so the lip is in front of the ball
    // and the ball is in front of the bin behind it.
    const order = [...bins].sort((a, b) => b.z - a.z);
    if (loose) drawBallShadow(ctx, ball);

    let ballDrawn = false;
    for (const bin of order) {
      // A loose ball nearer the camera than this bin belongs in front of it.
      if (loose && !ballDrawn && ball.z > bin.z) {
        drawLooseBall();
        ballDrawn = true;
      }
      const mark = markForCell(match.board, scoredAt, bin.index, elapsed);
      if (mark) {
        // A CLAIMED CELL HAS NO BIN. The mark replaces it, lying flat on the
        // floor where it stood — which is the mode's own rule, and also the
        // honest picture: `tick` steps the ball against the OPEN bins only, so a
        // bin left standing on a claimed cell would be a solid-looking target
        // the ball passes straight through.
        //
        // A winning cell pulses; the rest sit at rest. `elapsed` is tick time,
        // so the pulse is deterministic and a replay looks identical.
        const glow = winning.has(bin.index) ? 1.35 + Math.sin(elapsed * 6) * 0.45 : 1;
        drawFloorMark(ctx, bin, art[mark], mark, { glow, cell: cells[bin.index] });
        continue;
      }
      drawBinBody(ctx, bin, art.bin);
      if (captured === bin.index) drawSinkingBall(bin);
      drawBinLip(ctx, bin, art.bin);
    }
    if (loose && !ballDrawn) drawLooseBall();

    if (pull) {
      const preview = createTicTacToeShot(pull, ball, { weight: ballFlight(currentTurnBallId()).weight });
      const trajectory = pull.power > 0.03 ? trajectoryPoints(ball, preview.launch) : null;
      drawAim(ctx, {
        pull: { ...pull, aimX: preview.aim.x, aimY: preview.aim.y },
        trajectory,
        showReticle: false,
      });
    }
  }

  function drawLooseBall() {
    const ballId = flight?.ballId || currentTurnBallId();
    drawBall(ctx, {
      frames: assets.ballFrames(ballId),
      ballId,
      ...screenBallPosition(),
      rollPhase: ball.rollPhase,
      filter: depthGradeFilter(ball.z),
    });
  }

  function frame(now) {
    accumulator += Math.min(100, now - previousFrame) / 1000;
    previousFrame = now;
    while (accumulator >= TICK_SECONDS) { tick(); accumulator -= TICK_SECONDS; }
    draw();
    if (active) requestAnimationFrame(frame);
  }

  /**
   * Show this screen, in the mode it is being entered for.
   *
   * The loop only runs while the screen is up. That is not a saving — it is what
   * stops the CPU from taking its turn against a board nobody is looking at while
   * the player reads the leaderboard.
   */
  function enter({ mode: nextMode, difficulty: nextDifficulty, action, room } = {}) {
    if (nextMode !== undefined) mode = ticTacToeMode(nextMode);
    if (nextDifficulty !== undefined) difficulty = normalizeDifficulty(nextDifficulty);
    newMatch();
    if (mode === "online" && accountAccess.requireAccount()) {
      if (action === "quick") onlineClient.findQuickMatch();
      else if (action === "create") onlineClient.createPrivateRoom();
      else if (action === "join" && room) onlineClient.joinPrivateRoom(room);
      else onlineClient.connect();
    }
    if (!active) {
      active = true;
      previousFrame = performance.now();
      accumulator = 0;
      requestAnimationFrame(frame);
    }
  }

  /** Leave the screen: stop the loop, drop the pull, and let go of any lobby. */
  function exit() {
    active = false;
    pull = null;
    pointerId = null;
    if (mode === "online") onlineClient.leave();
  }

  newMatch();
  return { get match() { return match; }, bins, ball, newMatch, draw, enter, exit, isActive: () => active };
}

/** Resolve a difficulty id, defaulting rather than throwing. */
function normalizeDifficulty(id) {
  return DIFFICULTIES.some((difficulty) => difficulty.id === id) ? id : "medium";
}
