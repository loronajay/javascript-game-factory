// mp-controller.mjs — Multiplayer lifecycle for 1v1 Dodgeball.
// Owns the online client singleton and all MP state transitions.
//
// Lobby phases (game.mp.lobbyPhase):
//   "main"       — entry: FIND MATCH / PRIVATE ROOM / JOIN BY CODE / BACK
//   "searching"  — public auto-matchmaking in progress, waiting for pair
//   "room_host"  — created a private room, displaying code, waiting for partner
//   "room_join"  — typing a room code to join a partner's private room
//   "error"      — connection/conflict error with back button
//
// Architecture (Phase 2):
//   p1 (host)  — runs the authoritative sim for both ships; broadcasts state every tick
//   p2 (guest) — sends input each frame; receives state and reconciles position

import { STATE, TUNING, MP_TUNING, MP_LOBBY_BTNS, MP_RESULT_BTNS } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { makeStars } from "../entities/stars.mjs";
import { createOnlineClient, hasCountdownStarted } from "./online.mjs";
import { startMenuMusic, startGameMusic, sfxShoot, sfxPowerup, sfxPlayerHurt } from "./audio.mjs";

// ── Client singleton ──────────────────────────────────────────────────────────

let _client    = null;
let _triedSide = null;
let _roomCodeHandler = null;
let _roomCodeInput   = null;   // hidden <input> for mobile keyboard
let _bulletId  = 0;

const MP_COUNTDOWN_LEAD_MS = 4000;

// z-axis for the duel corridor: Z_NEAR = local player end, Z_FAR = opponent end
const Z_NEAR = 1.0;
const Z_FAR  = 7.0;

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

  // Hidden <input> triggers the virtual keyboard on mobile when focused.
  const el = document.createElement("input");
  el.type = "text";
  el.autocomplete = "off";
  el.setAttribute("autocapitalize", "characters");
  el.setAttribute("autocorrect", "off");
  el.setAttribute("spellcheck", "false");
  el.maxLength = 5;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none;top:0;left:0;width:1px;height:1px;";
  document.body.appendChild(el);
  _roomCodeInput = el;

  el.addEventListener("input", () => {
    const v = el.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
    el.value = v;
    game.mp.roomCodeInput = v;
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); _submitRoomJoin(game); }
  });

  // Fallback window handler for desktop physical keyboard when focus drifts.
  _roomCodeHandler = (e) => {
    if (e.target === el) return;
    if (e.key === "Backspace") {
      game.mp.roomCodeInput = game.mp.roomCodeInput.slice(0, -1);
      el.value = game.mp.roomCodeInput;
    } else if (/^[A-Za-z0-9]$/.test(e.key) && game.mp.roomCodeInput.length < 5) {
      game.mp.roomCodeInput += e.key.toUpperCase();
      el.value = game.mp.roomCodeInput;
    } else if (e.key === "Enter") {
      _submitRoomJoin(game);
    }
  };
  window.addEventListener("keydown", _roomCodeHandler);

  setTimeout(() => el.focus(), 80);
}

function _unbindRoomCode() {
  if (_roomCodeHandler) {
    window.removeEventListener("keydown", _roomCodeHandler);
    _roomCodeHandler = null;
  }
  if (_roomCodeInput) {
    _roomCodeInput.remove();
    _roomCodeInput = null;
  }
}

// ── Phase 2: combat helpers ───────────────────────────────────────────────────

function _resetRound(game, client) {
  const isHost = client.isHost();
  const mp = game.mp;

  game.player.x = isHost ? -TUNING.playerMaxX * 0.85 : TUNING.playerMaxX * 0.85;
  game.player.speed = 0;
  game.player.fireCooldown = 0;

  mp.opponentX     = isHost ? TUNING.playerMaxX * 0.85 : -TUNING.playerMaxX * 0.85;
  mp.opponentSpeed = 0;
  mp.p1hp          = MP_TUNING.hp;
  mp.p2hp          = MP_TUNING.hp;
  mp.p1heat        = 0;
  mp.p2heat        = 0;
  mp.p1burn        = false;
  mp.p2burn        = false;
  mp.mpBullets     = [];
  mp.mpTick        = 0;
  mp.mpTimerMs     = MP_TUNING.roundTimerMs;
  mp.suddenDeath   = false;
  mp.remoteInput   = null;
  mp.p1LobCd       = 0;
  mp.p2FireCd      = 0;
  mp.p2LobCd       = 0;
  mp.roundEndTimer     = 0;
  mp.roundEnded        = false;
  mp.roundEndWinner    = null;
  mp.opponentHitFlash  = 0;
}

function _decayHeat(mp, dt) {
  const decay = MP_TUNING.heatDecayPerMs * dt;
  mp.p1heat = Math.max(0, mp.p1heat - decay);
  mp.p2heat = Math.max(0, mp.p2heat - decay);

  if (!mp.p1burn && mp.p1heat >= MP_TUNING.burnoutThreshold)    mp.p1burn = true;
  if (mp.p1burn  && mp.p1heat <= MP_TUNING.burnoutResetThreshold) mp.p1burn = false;
  if (!mp.p2burn && mp.p2heat >= MP_TUNING.burnoutThreshold)    mp.p2burn = true;
  if (mp.p2burn  && mp.p2heat <= MP_TUNING.burnoutResetThreshold) mp.p2burn = false;
}

function _tryFireP1(game, input) {
  const mp = game.mp;
  if (mp.p1burn) return;

  if (!mp.suddenDeath && input.consumeFirePress() && game.player.fireCooldown <= 0) {
    mp.mpBullets.push({ id: _bulletId++, owner: "p1", x: game.player.x, z: Z_NEAR + 0.15, kind: "laser" });
    game.player.fireCooldown = MP_TUNING.fireCooldownMs;
    game.player.muzzleFlash  = 80;
    mp.p1heat = Math.min(MP_TUNING.burnoutThreshold, mp.p1heat + MP_TUNING.laserHeat);
    sfxShoot();
  }

  if (input.consumeLobPress && input.consumeLobPress() && mp.p1LobCd <= 0) {
    mp.mpBullets.push({ id: _bulletId++, owner: "p1", x: game.player.x, z: Z_NEAR + 0.15, kind: "lob" });
    mp.p1LobCd = MP_TUNING.lobCooldownMs;
    game.player.muzzleFlash = 140;
    mp.p1heat = Math.min(MP_TUNING.burnoutThreshold, mp.p1heat + MP_TUNING.lobHeat);
    sfxPowerup();
  }
}

function _tryFireP2(game, ri) {
  const mp = game.mp;
  if (!ri || mp.p2burn) return;

  if (!mp.suddenDeath && ri.laser && mp.p2FireCd <= 0) {
    mp.mpBullets.push({ id: _bulletId++, owner: "p2", x: mp.opponentX, z: Z_FAR - 0.15, kind: "laser" });
    mp.p2FireCd = MP_TUNING.fireCooldownMs;
    mp.p2heat   = Math.min(MP_TUNING.burnoutThreshold, mp.p2heat + MP_TUNING.laserHeat);
  }

  if (ri.lob && mp.p2LobCd <= 0) {
    mp.mpBullets.push({ id: _bulletId++, owner: "p2", x: mp.opponentX, z: Z_FAR - 0.15, kind: "lob" });
    mp.p2LobCd = MP_TUNING.lobCooldownMs;
    mp.p2heat  = Math.min(MP_TUNING.burnoutThreshold, mp.p2heat + MP_TUNING.lobHeat);
  }
}

function _advanceBullets(mp, dt) {
  for (const b of mp.mpBullets) {
    const speed = b.kind === "lob" ? MP_TUNING.lobSpeedZ : MP_TUNING.laserSpeedZ;
    b.z += (b.owner === "p1" ? speed : -speed) * dt;
  }
}

function _applyRoundWin(mp, winner) {
  if (winner === "p1") mp.p1Rounds++;
  else if (winner === "p2") mp.p2Rounds++;
}

function _endRound(game, input, winner, client) {
  if (game.mp.roundEnded) return;
  game.mp.roundEnded    = true;
  game.mp.roundEndWinner = winner;
  game.mp.mpBullets     = [];

  client.sendRoundEnd(winner);
  _applyRoundWin(game.mp, winner);

  const matchOver = game.mp.p1Rounds >= MP_TUNING.roundsToWin ||
                    game.mp.p2Rounds >= MP_TUNING.roundsToWin;
  if (matchOver) {
    const matchWinner = game.mp.p1Rounds >= MP_TUNING.roundsToWin ? "p1" : "p2";
    // Give a moment for the round-end overlay to show before transitioning.
    setTimeout(() => {
      if (!_client) return;
      _client.sendMatchEnd(matchWinner);
      game.mp.matchWinner = matchWinner;
      game.state = STATE.MP_RESULT;
      game.menu.selectedButton = 0;
      _clearFlashes(game, input);
    }, 2200);
  } else {
    game.mp.roundEndTimer = 2200;
  }
}

function _startNextRound(game, input, client) {
  const nextRound = game.mp.round + 1;
  const serverNow = Date.now() + game.mp.clockOffsetMs;
  const startAt   = serverNow + MP_COUNTDOWN_LEAD_MS;
  client.sendRoundStart(nextRound, startAt);
  _enterCountdown(game, input, nextRound, startAt);
}

function _checkHits(game, input, client) {
  const mp  = game.mp;
  const p1x = game.player.x;
  const p2x = mp.opponentX;
  const surviving = [];

  for (const b of mp.mpBullets) {
    let keep = true;

    if (b.owner === "p1" && b.z >= Z_FAR - 0.5) {
      keep = false;
      if (Math.abs(b.x - p2x) <= MP_TUNING.hitWindowX) {
        const inSD = mp.suddenDeath && b.kind === "lob";
        const dmg  = inSD ? 9999 : (b.kind === "lob" ? MP_TUNING.lobDmg : MP_TUNING.laserDmg);
        mp.p2hp = Math.max(0, mp.p2hp - dmg);
        mp.opponentHitFlash = 240;
        if (mp.p2hp <= 0) _endRound(game, input, "p1", client);
      }
    } else if (b.owner === "p2" && b.z <= Z_NEAR + 0.5) {
      keep = false;
      if (Math.abs(b.x - p1x) <= MP_TUNING.hitWindowX) {
        const inSD = mp.suddenDeath && b.kind === "lob";
        const dmg  = inSD ? 9999 : (b.kind === "lob" ? MP_TUNING.lobDmg : MP_TUNING.laserDmg);
        mp.p1hp = Math.max(0, mp.p1hp - dmg);
        game.shake = 6;
        game.player.hurtFlash = 220;
        sfxPlayerHurt();
        if (mp.p1hp <= 0) _endRound(game, input, "p2", client);
      }
    } else if (b.z > Z_FAR || b.z < Z_NEAR) {
      keep = false; // missed
    }

    if (keep) surviving.push(b);
  }

  mp.mpBullets = surviving;
}

function _applyRemoteState(game, snap) {
  const mp = game.mp;
  const prevP1hp = mp.p1hp;
  const prevP2hp = mp.p2hp;

  mp.opponentX   = snap.p1x;
  mp.p1hp        = snap.p1hp;
  mp.p2hp        = snap.p2hp;
  mp.p1heat      = snap.p1heat;
  mp.p2heat      = snap.p2heat;
  mp.p1burn      = snap.p1burn;
  mp.p2burn      = snap.p2burn;
  mp.mpBullets   = snap.bullets.map(b => ({ ...b }));
  mp.mpTimerMs   = snap.timeMs;
  mp.suddenDeath = snap.sd;

  // Guest: apply hurt feedback when the authoritative state confirms a hit.
  if (snap.p2hp < prevP2hp) {
    game.player.hurtFlash = 220;
    game.shake = 6;
    sfxPlayerHurt();
  }

  // Guest: trigger opponent hit flash when the authoritative state confirms p1 took damage.
  if (snap.p1hp < prevP1hp) {
    mp.opponentHitFlash = 240;
  }

  // Snap own position if drift is significant
  if (Math.abs(snap.p2x - game.player.x) > 18) {
    game.player.x = snap.p2x;
  }
}

// ── Host tick (p1 owns the sim) ───────────────────────────────────────────────

function _hostTick(game, input, dt) {
  const client = getClient();
  const mp     = game.mp;

  // During round-end delay, count down then start next round.
  if (mp.roundEnded && mp.roundEndTimer > 0) {
    mp.roundEndTimer -= dt;
    if (mp.roundEndTimer <= 0) _startNextRound(game, input, client);
    return;
  }
  if (mp.roundEnded) return; // match-end path handles transition via setTimeout

  mp.mpTick++;

  // Tick cooldowns (game.player.fireCooldown already ticked by _updateLocalPlayer)
  mp.p1LobCd  = Math.max(0, mp.p1LobCd  - dt);
  mp.p2FireCd = Math.max(0, mp.p2FireCd - dt);
  mp.p2LobCd  = Math.max(0, mp.p2LobCd  - dt);

  // P2 movement from remote input
  const ri = mp.remoteInput;
  if (ri) {
    const rail = clamp(ri.railIntent || 0, -1, 1);
    if (rail < 0)      mp.opponentSpeed -= TUNING.playerAccel * (dt / 16.666);
    else if (rail > 0) mp.opponentSpeed += TUNING.playerAccel * (dt / 16.666);
    else               mp.opponentSpeed *= Math.pow(TUNING.playerFriction, dt / 16.666);
    if (rail !== 0)    mp.opponentSpeed *= Math.pow(0.965, dt / 16.666);

    mp.opponentSpeed = clamp(mp.opponentSpeed, -TUNING.playerMaxSpeed, TUNING.playerMaxSpeed);
    mp.opponentX    += mp.opponentSpeed * (dt / 16.666);
    mp.opponentX     = clamp(mp.opponentX, -TUNING.playerMaxX, TUNING.playerMaxX);

    if ((mp.opponentX <= -TUNING.playerMaxX && mp.opponentSpeed < 0) ||
        (mp.opponentX >=  TUNING.playerMaxX && mp.opponentSpeed > 0)) {
      mp.opponentSpeed *= -0.16;
    }
  }

  _tryFireP1(game, input);
  _tryFireP2(game, ri);
  mp.remoteInput = null;

  _advanceBullets(mp, dt);
  _checkHits(game, input, client);
  _decayHeat(mp, dt);

  // Timer
  if (!mp.suddenDeath) {
    mp.mpTimerMs -= dt;
    if (mp.mpTimerMs <= 0) { mp.mpTimerMs = 0; mp.suddenDeath = true; }
  }

  // Broadcast authoritative state to guest
  client.sendState({
    tick:    mp.mpTick,
    p1x:     game.player.x,
    p2x:     mp.opponentX,
    p1hp:    mp.p1hp,
    p2hp:    mp.p2hp,
    p1heat:  mp.p1heat,
    p2heat:  mp.p2heat,
    p1burn:  mp.p1burn,
    p2burn:  mp.p2burn,
    bullets: mp.mpBullets,
    events:  [],
    round:   mp.round,
    timeMs:  mp.mpTimerMs,
    sd:      mp.suddenDeath,
  });
}

// ── Guest tick (p2 sends input and reconciles) ────────────────────────────────

function _guestTick(game, input, dt) {
  const client = getClient();
  const mp     = game.mp;
  if (mp.roundEnded) return;

  mp.p2LobCd = Math.max(0, mp.p2LobCd - dt);

  const wantLaser = input.consumeFirePress();
  const wantLob   = input.consumeLobPress ? input.consumeLobPress() : false;

  const railIntent = (input.isRight() ? 1 : 0) - (input.isLeft() ? 1 : 0);
  // Suppress laser intent during sudden death; host would ignore it anyway
  client.sendInput(mp.mpTick, { railIntent, laser: wantLaser && !mp.suddenDeath, lob: wantLob });

  // Optimistic visual feedback (cooldowns mirror what host will apply)
  if (wantLaser && !mp.p2burn && !mp.suddenDeath && game.player.fireCooldown <= 0) {
    game.player.fireCooldown = MP_TUNING.fireCooldownMs;
    game.player.muzzleFlash  = 80;
    sfxShoot();
  }
  if (wantLob && !mp.p2burn && mp.p2LobCd <= 0) {
    mp.p2LobCd = MP_TUNING.lobCooldownMs;
    game.player.muzzleFlash = 140;
    sfxPowerup();
  }
}

// ── initMpLobby ───────────────────────────────────────────────────────────────

export function initMpLobby(game, input) {
  const client = getClient();
  _triedSide = null;

  try {
    const id   = window.FactoryIdentity?.getPlayerId?.()    ?? "";
    const name = window.FactoryIdentity?.getProfileName?.() ?? "Pilot";
    client.setIdentity({ playerId: id, displayName: name });
  } catch (_) {}

  client.cb.onConnected = () => { game.mp.connected = true; };

  client.cb.onQueueCounts = (counts) => { game.mp.queueCounts = counts; };

  client.cb.onSearching = () => {
    game.mp.lobbyPhase = "searching";
    game.menu.selectedButton = 0;
  };

  client.cb.onSearchCancelled = () => {
    game.mp.lobbyPhase = "main";
    game.menu.selectedButton = 0;
  };

  client.cb.onRoomCreated = (code) => {
    game.mp.roomCode   = code;
    game.mp.lobbyPhase = "room_host";
    game.menu.selectedButton = 0;
  };

  client.cb.onRemoteProfile = (profile) => {
    game.mp.opponentName = profile.displayName || "Pilot";
  };

  client.cb.onMatchReady = ({ serverNow, remoteSide }) => {
    if (remoteSide) game.mp.side = remoteSide === "p1" ? "p2" : "p1";
    game.mp.clockOffsetMs = serverNow - Date.now();
    const startAt = serverNow + MP_COUNTDOWN_LEAD_MS;
    if (client.isHost()) client.sendRoundStart(1, startAt);
    _enterCountdown(game, input, 1, startAt);
  };

  client.cb.onRoundStart = ({ round, startAt }) => {
    _enterCountdown(game, input, round, startAt);
  };

  // Phase 2 callbacks
  client.cb.onRemoteInput = (msg) => {
    game.mp.remoteInput = msg;
  };

  client.cb.onRemoteState = (snap) => {
    if (game.state === STATE.MP_FIGHTING) _applyRemoteState(game, snap);
  };

  client.cb.onRemoteRoundEnd = ({ winner }) => {
    _applyRoundWin(game.mp, winner);
    game.mp.roundEnded     = true;
    game.mp.roundEndWinner = winner;
    game.mp.mpBullets      = [];
  };

  client.cb.onSideConflict = () => {
    // Only private room joins can produce SIDE_CONFLICT.
    // Public matchmaking never fires this — the server auto-balances cockpit-swarm sides.
    _unbindRoomCode();
    game.mp.lobbyPhase = "error";
    game.mp.errorMsg   = "ROOM FULL OR SIDE TAKEN — TRY AGAIN";
    game.menu.selectedButton = 0;
    input.clearMenuPresses();
  };

  client.cb.onPartnerLeft = () => {
    _unbindRoomCode();
    if (game.state === STATE.MP_FIGHTING || game.state === STATE.MP_COUNTDOWN) {
      game.mp.matchWinner  = game.mp.side;
      game.mp.disconnected = true;
      game.state = STATE.MP_RESULT;
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    } else {
      game.mp.lobbyPhase = "error";
      game.mp.errorMsg   = "OPPONENT LEFT";
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    }
  };

  client.cb.onError = (code) => {
    _unbindRoomCode();
    game.mp.lobbyPhase = "error";
    game.mp.errorMsg   = `CONNECTION ERROR (${code})`;
    game.menu.selectedButton = 0;
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

  // Reset mp slice
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
  game.mp.roundEnded           = false;
  game.mp.roundEndWinner       = null;
  game.mp.roundEndTimer        = 0;

  game.state = STATE.MP_LOBBY;
  game.menu.selectedButton = 0;
  game.stars = makeStars();
  _clearFlashes(game, input);
}

// ── updateMpLobby ─────────────────────────────────────────────────────────────

export function updateMpLobby(game, input) {
  const client = getClient();
  const phase  = game.mp.lobbyPhase;

  // ─ main phase ─
  if (phase === "main") {
    // Hover: [findMatch=0, privateRoom=1, joinByCode=2, back=3]
    const phaseBtns = [MP_LOBBY_BTNS.findMatch, MP_LOBBY_BTNS.privateRoom, MP_LOBBY_BTNS.joinByCode, MP_LOBBY_BTNS.back];
    const mp = input.getMousePos();
    for (let i = 0; i < phaseBtns.length; i++) {
      const b = phaseBtns[i];
      if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
        game.menu.selectedButton = i;
      }
    }

    const click = input.consumeClick();
    if (click) {
      if (_hit(click, MP_LOBBY_BTNS.findMatch) && game.mp.connected) {
        // Server auto-balances cockpit-swarm sides; the value we send is ignored.
        // We still set _triedSide so the private-room SIDE_CONFLICT path has a value.
        _triedSide = "p1";
        game.mp.side = "p1";
        client.findMatch("p1", false);
        input.clearMenuPresses();
      }
      if (_hit(click, MP_LOBBY_BTNS.privateRoom) && game.mp.connected) {
        game.mp.side = "p1";
        client.createRoom("p1");
        input.clearMenuPresses();
      }
      if (_hit(click, MP_LOBBY_BTNS.joinByCode) && game.mp.connected) {
        game.mp.side = "p2";
        game.mp.lobbyPhase = "room_join";
        game.menu.selectedButton = 0;
        _bindRoomCode(game);
        input.clearMenuPresses();
      }
      if (_hit(click, MP_LOBBY_BTNS.back)) {
        teardownMp(game, input);
        return;
      }
    }
    if (input.consumeBack()) { teardownMp(game, input); }
    return;
  }

  // ─ searching phase ─
  if (phase === "searching") {
    const mp = input.getMousePos();
    const b  = MP_LOBBY_BTNS.cancel;
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = 0;
    }

    const click = input.consumeClick();
    if ((click && _hit(click, MP_LOBBY_BTNS.cancel)) || input.consumeBack()) {
      client.cancelSearch();
      client.cancelRoom();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ room_host phase ─
  if (phase === "room_host") {
    const mp = input.getMousePos();
    const b  = MP_LOBBY_BTNS.cancel;
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = 0;
    }

    const click = input.consumeClick();
    if ((click && _hit(click, MP_LOBBY_BTNS.cancel)) || input.consumeBack()) {
      client.cancelRoom();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      game.mp.roomCode = null;
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ room_join phase ─
  if (phase === "room_join") {
    // Hover: [joinSubmit=0, joinBack=1]
    const mp = input.getMousePos();
    const joinBtns = [MP_LOBBY_BTNS.joinSubmit, MP_LOBBY_BTNS.joinBack];
    for (let i = 0; i < joinBtns.length; i++) {
      const b = joinBtns[i];
      if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
        game.menu.selectedButton = i;
      }
    }

    const click = input.consumeClick();
    if (click && _hit(click, MP_LOBBY_BTNS.joinSubmit)) _submitRoomJoin(game);
    if ((click && _hit(click, MP_LOBBY_BTNS.joinBack)) || input.consumeBack()) {
      _unbindRoomCode();
      game.mp.lobbyPhase = "main";
      game.mp.side = null;
      game.menu.selectedButton = 0;
      input.clearMenuPresses();
    }
    return;
  }

  // ─ error phase ─
  if (phase === "error") {
    const mp = input.getMousePos();
    const b  = MP_LOBBY_BTNS.back;
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = 0;
    }

    const click = input.consumeClick();
    const dismissed =
      input.consumeBack() ||
      input.consumeConfirm() ||
      (click && _hit(click, MP_LOBBY_BTNS.back));
    if (dismissed) { teardownMp(game, input); }
    return;
  }
}

function _submitRoomJoin(game) {
  const code = game.mp.roomCodeInput.trim();
  if (code.length < 5) return;
  getClient().joinRoom("p2", code);
  _unbindRoomCode();
  game.mp.lobbyPhase = "searching";
  game.menu.selectedButton = 0;
}

// ── updateMpCountdown ─────────────────────────────────────────────────────────

export function updateMpCountdown(game, input) {
  if (hasCountdownStarted(game.mp.startAt, game.mp.clockOffsetMs)) {
    _enterFighting(game, input);
    return;
  }
  if (input.consumeBack()) { teardownMp(game, input); }
}

function _enterCountdown(game, input, round, startAt) {
  _unbindRoomCode();
  game.state      = STATE.MP_COUNTDOWN;
  game.mp.round   = round;
  game.mp.startAt = startAt;
  _clearFlashes(game, input);
}

function _enterFighting(game, input) {
  const client = getClient();
  game.player.muzzleFlash = 0;
  game.player.hurtFlash   = 0;
  game.shake = 0;
  _resetRound(game, client);
  game.state = STATE.MP_FIGHTING;
  client.startPinging();
  input.clearMenuPresses();
  startGameMusic(false);
}

// ── updateMpFighting ──────────────────────────────────────────────────────────

export function updateMpFighting(game, input, dt) {
  _updateLocalPlayer(game, input, dt);
  game.mp.opponentHitFlash = Math.max(0, game.mp.opponentHitFlash - dt);

  const client = getClient();
  if (client.isHost()) {
    _hostTick(game, input, dt);
  } else {
    _guestTick(game, input, dt);
  }

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
    teardownMp(game, input);
    initMpLobby(game, input);
  } else if (activated === 1) {
    teardownMp(game, input);
  }
}

// ── teardownMp ────────────────────────────────────────────────────────────────

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
