// Standalone composition root for the first playable floor Tic-Tac-Toe mode.

import { createAssetLibrary } from "./assets/loader.js";
import { ballFlight } from "./assets/ball-catalog.js";
import { createMiniHoopsAccountAccess } from "./multiplayer/account-access.js";
import { normalizeRoomCode } from "./multiplayer/online-client.js";
import { createTicTacToeOnlineClient } from "./multiplayer/tic-tac-toe-online-client.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, PROJECTION_Y_SCALE, TICK_SECONDS } from "./sim/constants.js";
import { createBinTargets, stepBallAgainstBins } from "./sim/bin-physics.js";
import { createBall, isBallSettled, launchBall, resetBall } from "./sim/physics.js";
import { launchSpin, trajectoryPoints } from "./sim/launch.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { ballScreenRadius, depthScaleAt, projectPoint, worldToScreenLength } from "./sim/projection.js";
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
import { clearScene, depthGradeFilter, drawBallShadow, drawRoom, prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";

const BIN_PATH = "assets/modes/floor-tic-tac-toe/open-bin.png";
const X_PATH = "assets/modes/floor-tic-tac-toe/neon-x.png";
const O_PATH = "assets/modes/floor-tic-tac-toe/neon-o.png";
// The room and the ball are fixed for this mode — the setup screen reads the
// same record to know which of its pickers to put away.
const { locationId: ROOM_ID, ballId: BALL_ID } = TIC_TAC_TOE_FIXED_SETUP;
const BIN_VISIBLE_HEIGHT_RATIO = 1244 / 1326;
const BIN_FOOT_Y_RATIO = 1288 / 1326;

export function capturedBinForDraw(flight) {
  return Number.isInteger(flight?.capturedBin) ? flight.capturedBin : null;
}

export function isTicTacToeBallVisible(flight) {
  return capturedBinForDraw(flight) === null;
}

export function ticTacToeMode(value) {
  return value === "local" || value === "online" ? value : "cpu";
}

export function bootTicTacToe(root, options = {}) {
  const random = options.random || Math.random;
  const accountAccess = options.accountAccess || createMiniHoopsAccountAccess();
  const onlineClient = options.onlineClient || createTicTacToeOnlineClient({
    resolveIdentity: () => accountAccess.identity(),
  });
  const canvas = root.querySelector("#stageCourt");
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

  const params = new URLSearchParams(options.search ?? globalThis.location?.search ?? "");
  const mode = ticTacToeMode(options.mode || params.get("mode"));
  const difficulty = DIFFICULTIES.some(({ id }) => id === (options.difficulty || params.get("difficulty")))
    ? (options.difficulty || params.get("difficulty"))
    : "medium";
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
  const onlinePanel = root.querySelector("#tttOnlinePanel");
  const gameArea = root.querySelector("#tttGameArea");
  const modeLabel = root.querySelector("#tttModeLabel");
  const hint = root.querySelector("#tttHint");

  onlineClient.subscribe(handleOnlineSnapshot);

  newMatchButton?.addEventListener("click", newMatch);
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
    pull = null;
    flight = null;
    onlineAttemptPending = false;
    cpuDelay = mode === "cpu" ? 0.75 : 0;
    resetBall(ball);
    setPower(0);
    if (onlinePanel) onlinePanel.hidden = mode !== "online";
    if (gameArea) gameArea.hidden = mode === "online";
    if (newMatchButton) newMatchButton.hidden = mode === "online";
    if (modeLabel) modeLabel.textContent = mode === "local" ? "Local Hotseat" : mode === "online" ? "Online Match" : `Vs CPU · ${difficulty}`;
    syncAssignment();
    renderOnlineLobby();
    syncTurnStatus();
    draw();
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
        setStatus(`${scoringMark.toUpperCase()} scores!`);
      } else if (flight.age > 3.15 || (flight.age > 0.45 && isBallSettled(ball))) {
        if (match.mode === "online") submitOnlineAttempt(flight.attemptedCell, false);
        else resolveAttempt(match, flight.attemptedCell, false);
        flight.resolved = true;
        flight.resetIn = 0.45;
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
    if (gameArea) gameArea.hidden = snapshot.matchState.status === "waiting";
    if (onlinePanel) onlinePanel.hidden = snapshot.matchState.status !== "waiting";
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

  function draw() {
    if (!match) return;
    clearScene(ctx);
    drawRoom(ctx, art.room, ROOM_ID);
    drawGrid(ctx);

    const occupants = [];
    for (const bin of bins) {
      const mark = markForCell(match.board, scoredAt, bin.index, elapsed);
      if (mark) occupants.push({ type: "mark", z: bin.z, bin, mark });
      else occupants.push({ type: "bin", z: bin.z, bin });
    }
    if (!ball.splat && isTicTacToeBallVisible(flight)) occupants.push({ type: "ball", z: ball.z });
    occupants.sort((a, b) => b.z - a.z);

    if (isTicTacToeBallVisible(flight)) drawBallShadow(ctx, ball);
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

  function frame(now) {
    accumulator += Math.min(100, now - previousFrame) / 1000;
    previousFrame = now;
    while (accumulator >= TICK_SECONDS) { tick(); accumulator -= TICK_SECONDS; }
    draw();
    requestAnimationFrame(frame);
  }

  newMatch();
  if (mode === "online" && accountAccess.requireAccount()) {
    const action = params.get("action");
    if (action === "quick") onlineClient.findQuickMatch();
    else if (action === "create") onlineClient.createPrivateRoom();
    else if (action === "join" && params.get("room")) onlineClient.joinPrivateRoom(params.get("room"));
    else onlineClient.connect();
  }
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

function drawMark(ctx, bin, image) {
  const centre = projectPoint({ x: bin.x, y: 0.012, z: bin.z });
  const width = worldToScreenLength(0.38, bin.z);
  const height = width * ((image.naturalHeight || 1) / (image.naturalWidth || 1));
  ctx.save(); ctx.globalAlpha = 0.95; ctx.shadowColor = "#fff"; ctx.shadowBlur = 12;
  ctx.drawImage(image, centre.x - width / 2, centre.y - height / 2, width, height); ctx.restore();
}
