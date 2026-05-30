// mp-controller.mjs — Multiplayer lifecycle for 1v1 Dodgeball.
// Owns the online client singleton and all MP state transitions.
// game.mjs routes MP_LOBBY / MP_COUNTDOWN / MP_FIGHTING / MP_RESULT here.
//
// Lobby phases (game.mp.lobbyPhase):
//   "main"       — entry: FIND MATCH / PRIVATE ROOM / JOIN BY CODE / BACK
//   "searching"  — public auto-matchmaking in progress, waiting for pair
//   "room_host"  — created a private room, displaying code, waiting for partner
//   "room_join"  — typing a room code to join a partner's private room
//   "error"      — connection/conflict error with back button
//
// Side assignment:
//   Public  — server auto-assigns; client randomly tries p1 or p2 and
//             retries the other on SIDE_CONFLICT (transparent to the user).
//   Private — creator always p1 (host), joiner always p2 (guest).

import { STATE, TUNING, MP_LOBBY_BTNS, MP_RESULT_BTNS } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { makeStars } from "../entities/stars.mjs";
import { createOnlineClient, hasCountdownStarted } from "./online.mjs";
import { startMenuMusic } from "./audio.mjs";

// ── Client singleton (one connection per match session) ───────────────────────

let _client = null;

// For public auto-matchmaking: track which side we tried so we can flip on conflict.
let _triedSide = null;

// Raw keydown handler for room-code entry (attached/detached with lobby phase).
let _roomCodeHandler = null;

// How many ms ahead of serverNow to schedule the fight start.
const MP_COUNTDOWN_LEAD_MS = 4000;

// ── Utilities ─────────────────────────────────────────────────────────────────

function getClient() {
  if (!_client) _client = createOnlineClient();
  return _client;
}

function _hit(click, btn) {
  return click.x >= btn.x && click.x < btn.x + btn.w &&
         click.y >= btn.y && click.y < btn.y + btn.h;
}

function _clearFlashes(game, input) {
  game.player.hurtFlash   = 0;
  game.player.muzzleFlash = 0;
  game.shake = 0;
  input.clearMenuPresses();
}

// ── Room-code keyboard capture (active only during room_join phase) ───────────

function _bindRoomCode(game) {
  _unbindRoomCode();
  game.mp.roomCodeInput = "";
  _roomCodeHandler = (e) => {
    if (e.key === "Backspace") {
      game.mp.roomCodeInput = game.mp.roomCodeInput.slice(0, -1);
    } else if (/^[A-Za-z0-9]$/.test(e.key) && game.mp.roomCodeInput.length < 4) {
      game.mp.roomCodeInput += e.key.toUpperCase();
    } else if (e.key === "Enter") {
      _submitRoomJoin(game);
    }
  };
  window.addEventListener("keydown", _roomCodeHandler);
}

function _unbindRoomCode() {
  if (_roomCodeHandler) {
    window.removeEventListener("keydown", _roomCodeHandler);
    _roomCodeHandler = null;
  }
}

// ── initMpLobby — called when player selects VS DUEL from main menu ───────────

export function initMpLobby(game, input) {
  const client = getClient();
  _triedSide = null;

  // Read factory identity (works even if anonymous)
  try {
    const id   = window.FactoryIdentity?.getPlayerId?.()    ?? "";
    const name = window.FactoryIdentity?.getProfileName?.() ?? "Pilot";
    client.setIdentity({ playerId: id, displayName: name });
  } catch (_) {}

  // ── Wire callbacks ────────────────────────────────────────────────────────

  client.cb.onConnected = () => {
    game.mp.connected = true;
  };

  client.cb.onQueueCounts = (counts) => {
    game.mp.queueCounts = counts;
  };

  client.cb.onSearching = () => {
    // Server confirmed we're in the queue.
    game.mp.lobbyPhase = "searching";
  };

  client.cb.onSearchCancelled = () => {
    game.mp.lobbyPhase = "main";
  };

  client.cb.onRoomCreated = (code) => {
    game.mp.roomCode   = code;
    game.mp.lobbyPhase = "room_host";
  };

  client.cb.onRemoteProfile = (profile) => {
    game.mp.opponentName = profile.displayName || "Pilot";
  };

  client.cb.onMatchReady = ({ serverNow }) => {
    // Both sides are in the room. Compute clock offset and schedule fight start.
    game.mp.clockOffsetMs = serverNow - Date.now();
    const startAt = serverNow + MP_COUNTDOWN_LEAD_MS;

    if (client.isHost()) {
      // p1 owns round_start: broadcast then apply locally.
      client.sendRoundStart(1, startAt);
    }
    // p2 receives round_start via onRoundStart callback below.
    // p1 applies it directly here.
    _enterCountdown(game, input, 1, startAt);
  };

  client.cb.onRoundStart = ({ round, startAt }) => {
    // p2 receives this; p1 never gets its own broadcast back.
    _enterCountdown(game, input, round, startAt);
  };

  client.cb.onSideConflict = () => {
    if (game.mp.lobbyPhase === "searching") {
      // Public auto-retry: flip to the other side and re-search.
      const otherSide = _triedSide === "p1" ? "p2" : "p1";
      _triedSide = otherSide;
      game.mp.side = otherSide;
      client.findMatch(otherSide, false);
      // Stay in "searching" phase — user sees no disruption.
    } else {
      // Private join: the code they entered is full or the side is taken.
      _unbindRoomCode();
      game.mp.lobbyPhase = "error";
      game.mp.errorMsg   = "ROOM FULL OR SIDE TAKEN — TRY AGAIN";
      input.clearMenuPresses();
    }
  };

  client.cb.onPartnerLeft = () => {
    _unbindRoomCode();
    if (game.state === STATE.MP_FIGHTING || game.state === STATE.MP_COUNTDOWN) {
      game.mp.matchWinner = game.mp.side;   // we win — they forfeited
      game.mp.disconnected = true;
      game.state = STATE.MP_RESULT;
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    } else {
      game.mp.lobbyPhase = "error";
      game.mp.errorMsg   = "OPPONENT LEFT";
      input.clearMenuPresses();
    }
  };

  client.cb.onError = (code) => {
    _unbindRoomCode();
    game.mp.lobbyPhase = "error";
    game.mp.errorMsg   = `CONNECTION ERROR (${code})`;
    input.clearMenuPresses();
  };

  client.cb.onMatchEnd = ({ winner }) => {
    game.mp.matchWinner = winner;
    game.state = STATE.MP_RESULT;
    game.menu.selectedButton = 0;
    _clearFlashes(game, input);
  };

  client.cb.onRematch = ({ ready }) => {
    game.mp.rematchOpponentReady = ready;
  };

  client.connect();

  // ── Reset mp slice ────────────────────────────────────────────────────────
  game.mp.lobbyPhase           = "main";
  game.mp.connected            = false;
  game.mp.side                 = null;
  game.mp.opponentName         = null;
  game.mp.queueCounts          = null;
  game.mp.clockOffsetMs        = 0;
  game.mp.round                = 0;
  game.mp.p1Rounds             = 0;
  game.mp.p2Rounds             = 0;
  game.mp.startAt              = null;
  game.mp.matchWinner          = null;
  game.mp.rematchReady         = false;
  game.mp.rematchOpponentReady = false;
  game.mp.disconnected         = false;
  game.mp.errorMsg             = null;
  game.mp.roomCode             = null;
  game.mp.roomCodeInput        = "";

  game.state = STATE.MP_LOBBY;
  game.menu.selectedButton = 0;
  game.stars = makeStars();
  _clearFlashes(game, input);
}

function _enterCountdown(game, input, round, startAt) {
  _unbindRoomCode();
  game.state      = STATE.MP_COUNTDOWN;
  game.mp.round   = round;
  game.mp.startAt = startAt;
  _clearFlashes(game, input);
}

// ── updateMpLobby ─────────────────────────────────────────────────────────────

export function updateMpLobby(game, input) {
  const client = getClient();
  const phase  = game.mp.lobbyPhase;

  // ─ main phase ─
  if (phase === "main") {
    const click = input.consumeClick();

    if (click) {
      if (_hit(click, MP_LOBBY_BTNS.findMatch) && game.mp.connected) {
        // Public auto-matchmaking: pick a random side; retry on SIDE_CONFLICT.
        const side = Math.random() < 0.5 ? "p1" : "p2";
        _triedSide = side;
        game.mp.side = side;
        client.findMatch(side, false);
        // onSearching callback will advance phase to "searching"
        input.clearMenuPresses();
      }

      if (_hit(click, MP_LOBBY_BTNS.privateRoom) && game.mp.connected) {
        // Create a private room — creator is always host (p1).
        game.mp.side = "p1";
        client.createRoom("p1");
        // onRoomCreated callback will advance phase to "room_host"
        input.clearMenuPresses();
      }

      if (_hit(click, MP_LOBBY_BTNS.joinByCode) && game.mp.connected) {
        // Join by code — joiner is always guest (p2).
        game.mp.side = "p2";
        game.mp.lobbyPhase = "room_join";
        _bindRoomCode(game);
        input.clearMenuPresses();
      }

      if (_hit(click, MP_LOBBY_BTNS.back)) {
        teardownMp(game, input);
        return;
      }
    }

    if (input.consumeBack()) {
      teardownMp(game, input);
    }

    return;
  }

  // ─ searching phase ─
  if (phase === "searching") {
    const click = input.consumeClick();

    if ((click && _hit(click, MP_LOBBY_BTNS.cancel)) || input.consumeBack()) {
      client.cancelSearch();
      client.cancelRoom();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ room_host phase (private, created room, waiting for joiner) ─
  if (phase === "room_host") {
    const click = input.consumeClick();

    if ((click && _hit(click, MP_LOBBY_BTNS.cancel)) || input.consumeBack()) {
      client.cancelRoom();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      game.mp.roomCode = null;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ room_join phase (private, entering a code) ─
  if (phase === "room_join") {
    // Typing is handled by _roomCodeHandler (raw keydown).
    const click = input.consumeClick();

    if (click && _hit(click, MP_LOBBY_BTNS.joinSubmit)) {
      _submitRoomJoin(game);
    }

    if ((click && _hit(click, MP_LOBBY_BTNS.joinBack)) || input.consumeBack()) {
      _unbindRoomCode();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ error phase ─
  if (phase === "error") {
    const click = input.consumeClick();
    const dismissed =
      input.consumeBack() ||
      input.consumeConfirm() ||
      (click && _hit(click, MP_LOBBY_BTNS.back));

    if (dismissed) {
      teardownMp(game, input);
    }
    return;
  }
}

function _submitRoomJoin(game) {
  const code = game.mp.roomCodeInput.trim();
  if (code.length < 4) return;
  const client = getClient();
  client.joinRoom("p2", code);
  // Transition to searching phase while we wait for the room
  _unbindRoomCode();
  game.mp.lobbyPhase = "searching";
}

// ── updateMpCountdown ─────────────────────────────────────────────────────────

export function updateMpCountdown(game, input) {
  if (hasCountdownStarted(game.mp.startAt, game.mp.clockOffsetMs)) {
    _enterFighting(game, input);
    return;
  }

  if (input.consumeBack()) {
    teardownMp(game, input);
  }
}

function _enterFighting(game, input) {
  const client = getClient();
  // Start at opposite rail ends: host left, guest right.
  game.player.x     = client.isHost() ? -TUNING.playerMaxX * 0.85 : TUNING.playerMaxX * 0.85;
  game.player.speed = 0;
  game.player.fireCooldown = 0;
  game.player.muzzleFlash  = 0;
  game.player.hurtFlash    = 0;
  game.shake = 0;
  game.state = STATE.MP_FIGHTING;
  client.startPinging();
  input.clearMenuPresses();
}

// ── updateMpFighting (Phase 1 stub) ──────────────────────────────────────────
// Phase 1: local player moves, cockpit renders, ESC exits.
// Phase 2 adds host sim, bidirectional bullets, HP, and round end.

export function updateMpFighting(game, input, dt) {
  _updateLocalPlayer(game, input, dt);

  if (input.consumeBack()) {
    teardownMp(game, input);
  }
}

function _updateLocalPlayer(game, input, dt) {
  const player = game.player;
  const left   = input.isLeft();
  const right  = input.isRight();

  if (left  && !right) player.speed -= TUNING.playerAccel * (dt / 16.666);
  if (right && !left)  player.speed += TUNING.playerAccel * (dt / 16.666);
  if (!left && !right) player.speed *= Math.pow(TUNING.playerFriction, dt / 16.666);
  else                 player.speed *= Math.pow(0.965, dt / 16.666);

  player.speed  = clamp(player.speed, -TUNING.playerMaxSpeed, TUNING.playerMaxSpeed);
  player.x     += player.speed * (dt / 16.666);
  player.x      = clamp(player.x, -TUNING.playerMaxX, TUNING.playerMaxX);

  if ((player.x <= -TUNING.playerMaxX && player.speed < 0) ||
      (player.x >=  TUNING.playerMaxX && player.speed > 0)) {
    player.speed *= -0.16;
  }

  player.fireCooldown  = Math.max(0, player.fireCooldown - dt);
  player.muzzleFlash   = Math.max(0, player.muzzleFlash  - dt);
  player.hurtFlash     = Math.max(0, player.hurtFlash    - dt);
  game.shake *= Math.pow(TUNING.cockpitShakeDecay, dt / 16.666);
}

// ── updateMpResult ────────────────────────────────────────────────────────────

export function updateMpResult(game, input) {
  const btns = MP_RESULT_BTNS;

  const mp = input.getMousePos();
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = i;
    }
  }

  let activated = -1;
  const click = input.consumeClick();
  if (click) {
    for (let i = 0; i < btns.length; i++) {
      if (_hit(click, btns[i])) activated = i;
    }
  }
  if (input.consumeConfirm()) activated = game.menu.selectedButton;
  if (input.consumeBack())    { teardownMp(game, input); return; }

  if (activated === 0) {
    // Rematch: re-enter lobby (full rematch handshake is Phase 3).
    teardownMp(game, input);
    initMpLobby(game, input);
  } else if (activated === 1) {
    teardownMp(game, input);
  }
}

// ── teardownMp — disconnect + return to MENU ──────────────────────────────────

export function teardownMp(game, input) {
  _unbindRoomCode();

  if (_client) {
    _client.stopPinging();
    _client.disconnect();
    _client = null;
  }
  _triedSide = null;

  game.state = STATE.MENU;
  game.menu.selectedButton = 0;
  _clearFlashes(game, input);
  startMenuMusic();
}
