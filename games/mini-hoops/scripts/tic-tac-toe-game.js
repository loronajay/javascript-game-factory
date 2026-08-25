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
import { ballFlight } from "./assets/ball-catalog.js";
import { createMiniHoopsAccountAccess } from "./multiplayer/account-access.js";
import { normalizeRoomCode } from "./multiplayer/online-client.js";
import { createTicTacToeOnlineClient } from "./multiplayer/tic-tac-toe-online-client.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, CONTACT_DEBOUNCE_SECONDS, TICK_SECONDS } from "./sim/constants.js";
import { createBinTargets, stepBallAgainstBins } from "./sim/bin-physics.js";
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
import {
  binMouthEllipse,
  drawBinBody,
  drawBinColliders,
  drawBinLip,
  drawColliderLegend,
  drawFloorMark,
} from "./render/bin.js";
import { clearScene, depthGradeFilter, drawBallShadow, drawRoom, prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";

// One definition of what each side looks like. The floor glyph, the claimed
// cell's tint and the debug fallback all read it, so a colour cannot drift
// between the three places a player sees it.
export const MARK_COLOURS = Object.freeze({ x: "#ff4fd8", o: "#28d8ff" });

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";
const X_PATH = "assets/modes/floor-tic-tac-toe/neon-x.png";
const O_PATH = "assets/modes/floor-tic-tac-toe/neon-o.png";
// The room and the ball are fixed for this mode — the setup screen reads the
// same record to know which of its pickers to put away.
const { locationId: ROOM_ID, ballId: BALL_ID } = TIC_TAC_TOE_FIXED_SETUP;

/**
 * A silent stand-in, so the root can be constructed in a test without a browser.
 * Same pattern and same reason as `practice-court.js`.
 */
const SILENT_AUDIO = Object.freeze({
  released() {}, contact() {}, binScored() {}, missed() {}, celebrate() {}, click() {},
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
    ballFrames: assets.ballFrames(BALL_ID),
  };
  const bins = createBinTargets();
  const ball = createBall();
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

  const status = root.querySelector("#tttStatus");
  const assignment = root.querySelector("#tttAssignment");
  const meter = root.querySelector("#tttMeterFill");
  const readout = root.querySelector("#tttMeterReadout");
  const newMatchButton = root.querySelector("#newMatch");
  // The collider overlay. Off by default, toggled with C while the court is
  // up — a way to SEE where the physics is against where the art is, rather
  // than argue about it from a screenshot. See `render/bin.js`.
  let showColliders = false;
  const onlinePanel = root.querySelector("#tttOnlinePanel");
  const modeLabel = root.querySelector("#tttModeLabel");
  const hint = root.querySelector("#tttHint");

  onlineClient.subscribe(handleOnlineSnapshot);

  newMatchButton?.addEventListener("click", () => newMatch());
  window.addEventListener("keydown", (event) => {
    if (!active || event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
    showColliders = !showColliders;
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
    if (mode === "online") match.status = "waiting";
    scoredAt.clear();
    lastContactAt.clear();
    pull = null;
    flight = null;
    onlineAttemptPending = false;
    cpuDelay = mode === "cpu" ? 0.75 : 0;
    resetBall(ball);
    setPower(0);
    onShowLobby(mode === "online");
    if (newMatchButton) newMatchButton.hidden = mode === "online";
    if (modeLabel) modeLabel.textContent = mode === "local" ? "Local Hotseat" : mode === "online" ? "Online Match" : `Vs CPU · ${difficulty}`;
    syncAssignment();
    renderOnlineLobby();
    syncTurnStatus();
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

  function canHumanAct() {
    return isHumanControlledTurn(match) && !flight && !onlineAttemptPending;
  }

  function launchFromPull(released, attemptedCell = null) {
    if (flight) return;
    const shot = createTicTacToeShot(released, ball, { weight: ballFlight(BALL_ID).weight });
    const nearest = attemptedCell ?? nearestOpenCellForShot(
      { aimX: shot.aim.x, targetZ: shot.targetZ },
      bins,
      match.board,
    );
    if (nearest === null) return;
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    audio.released(BALL_ID);
    flight = {
      attemptedCell: nearest,
      targetZ: shot.targetZ,
      age: 0,
      resolved: false,
      resetIn: null,
      capturedBin: null,
    };
    setPower(released.power);
    setStatus(`${playerLabel(match)} (${match.turn.toUpperCase()}) shoots…`);
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
  }

  function tickFlight() {
    flight.age += TICK_SECONDS;
    if (!flight.resolved) {
      const activeBins = bins.filter((bin) => !match.board[bin.index]);
      const result = stepBallAgainstBins(ball, activeBins, TICK_SECONDS, {
        ballId: BALL_ID,
        capturedBin: flight.capturedBin,
      });
      announce(result.contacts);
      if (result.capturedBin !== null) flight.capturedBin = result.capturedBin;
      if (result.scoredBin !== null && !match.board[result.scoredBin]) {
        const scoringMark = match.turn;
        if (match.mode === "online") submitOnlineAttempt(result.scoredBin, true);
        else {
          resolveAttempt(match, result.scoredBin, true);
          scoredAt.set(result.scoredBin, elapsed);
        }
        flight.resolved = true;
        flight.resetIn = 1.05;
        audio.binScored(BALL_ID);
        setStatus(`${scoringMark.toUpperCase()} scores!`);
      } else if (flight.age > 3.15 || (flight.age > 0.45 && isBallSettled(ball))) {
        if (match.mode === "online") submitOnlineAttempt(flight.attemptedCell, false);
        else resolveAttempt(match, flight.attemptedCell, false);
        flight.resolved = true;
        flight.resetIn = 0.45;
        audio.missed();
        setStatus("Miss · turn changes");
      }
    } else {
      // Physics continues briefly so turn timing stays deterministic. Rendering
      // ends at the mouth plane: once captured, the bin has swallowed the ball.
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

  function submitOnlineAttempt(cell, made) {
    onlineAttemptPending = onlineClient.submitAttempt({
      cell,
      made,
      expectedAttempt: match.attempts,
    });
  }

  function handleOnlineSnapshot(snapshot) {
    onlineSnapshot = snapshot;
    renderOnlineLobby();
    if (mode !== "online" || !snapshot.matchState) return;

    const previousBoard = match?.mode === "online" ? [...match.board] : Array(9).fill(null);
    const previousAttempts = match?.mode === "online" ? match.attempts : -1;
    match = snapshot.matchState;
    if (match.attempts > previousAttempts) onlineAttemptPending = false;
    for (let cell = 0; cell < match.board.length; cell++) {
      if (!previousBoard[cell] && match.board[cell]) scoredAt.set(cell, elapsed);
    }
    // The lobby and the court are two screens now: a match that is still
    // waiting belongs in the lobby, and one that has started belongs on the
    // court. Nothing is hidden in place.
    onShowLobby(snapshot.matchState.status === "waiting");
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
    const xEdges = [-0.75, -0.25, 0.25, 0.75];
    const zEdges = [0.195, 0.465, 0.735, 1.005];
    const at = (x, z) => projectPoint({ x, y: 0.004, z });

    ctx.save();
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        // A CLAIMED CELL GLOWS IN ITS OWNER'S COLOUR, and that is not decoration.
        // The glyph lies flat on the concrete, and from this camera a bin
        // standing in the row in FRONT of it covers that floor completely — at
        // every bin height, down to 12cm; the geometry was measured, and there is
        // no size that fixes it. The cell's own near edge is always visible in
        // front of the bin, so tinting the panel is what keeps the board readable
        // without moving the glyph off the floor.
        const claimed = match.board[row * 3 + column];
        ctx.fillStyle = claimed
          ? (claimed === "o" ? "rgba(40,216,255,.30)" : "rgba(255,79,216,.30)")
          : "rgba(24,6,32,.26)";
        ctx.beginPath();
        const corners = [
          at(xEdges[column], zEdges[row]),
          at(xEdges[column + 1], zEdges[row]),
          at(xEdges[column + 1], zEdges[row + 1]),
          at(xEdges[column], zEdges[row + 1]),
        ];
        ctx.moveTo(corners[0].x, corners[0].y);
        for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
        ctx.closePath();
        ctx.fill();
      }
    }

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
      frames: art.ballFrames,
      ballId: BALL_ID,
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
        drawFloorMark(ctx, bin, art[mark], mark, { glow });
        continue;
      }
      drawBinBody(ctx, bin, art.bin);
      if (captured === bin.index) drawSinkingBall(bin);
      drawBinLip(ctx, bin, art.bin);
    }
    if (loose && !ballDrawn) drawLooseBall();

    // Over everything, so a collider behind a nearer bin is still readable —
    // this is an instrument, not part of the scene.
    if (showColliders) {
      for (const bin of order) if (!match.board[bin.index]) drawBinColliders(ctx, bin);
      // Below the HUD's own stat block, which owns the top-left corner.
      drawColliderLegend(ctx, 28, 230);
    }

    if (pull) {
      const preview = createTicTacToeShot(pull, ball, { weight: ballFlight(BALL_ID).weight });
      const trajectory = pull.power > 0.03 ? trajectoryPoints(ball, preview.launch) : null;
      drawAim(ctx, {
        pull: { ...pull, aimX: preview.aim.x, aimY: preview.aim.y },
        trajectory,
        showReticle: false,
      });
    }
  }

  function drawLooseBall() {
    drawBall(ctx, {
      frames: art.ballFrames,
      ballId: BALL_ID,
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
