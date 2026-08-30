// Online play: the socket, the lobby screen, and the bodies a snapshot describes.
//
// The server owns the round. This module never decides a catch, a battery level or a role — it sends
// what the player is trying to do and draws what came back. Every rule it needs is pure and lives in
// `online-logic.js`; everything here is a WebSocket, some DOM, and the avatar rig.
//
// Prediction: the local body keeps walking through `player.js` between snapshots, because that mover
// is now the same pure one the server ticks. When a snapshot lands, `reconcilePosition` decides
// whether the difference is small enough to walk off or big enough to apply outright.
// The sibling real-time service every online cabinet in this repo uses. A page served from
// localhost talks to a local copy of it instead, so the hotel can be tested without a deploy.
import { createOnlineResults } from './online-results.js';

const PRODUCTION_WS_URL = 'wss://factory-network-server-production.up.railway.app';
const LOCAL_WS_URL = 'ws://localhost:3000';

export function defaultSocketUrl(location) {
  const host = location && location.hostname;
  return host === 'localhost' || host === '127.0.0.1' ? LOCAL_WS_URL : PRODUCTION_WS_URL;
}

export function createOnline({
  logic, avatars, avatarLogic, camera, world, player, menu, config: CONFIG, document, window,
  hotel = null, furnishings = null, elevator = null, demons = null, flashlightDrops = null, hiders = null, spectator = null,
  socketUrl = defaultSocketUrl(window.location), gameId = 'hide-and-seek', identity = null,
  maps = null, mapId = null,
}) {
  // The building this page is standing. It is fixed at boot, so it is both what this client queues
  // for and what it checks the authority's snapshot against.
  const localMapId = maps ? maps.playableMapId(mapId) : mapId;
  const lobbySettings = () => logic.lobbySettingsFor(localMapId);
  let mapMismatch = null;
  const statusEl = document.getElementById('onlineStatus');
  const roomEl = document.getElementById('onlineRoom');
  const rosterEl = document.getElementById('onlinePlayers');
  const playerCountEl = document.getElementById('onlinePlayerCount');
  const startBtn = document.getElementById('onlineStart');
  const copyBtn = document.getElementById('onlineCopy');
  const clockEl = document.getElementById('roundClock');
  const countEl = document.getElementById('roundCount');
  const bannerEl = document.getElementById('roundBanner');
  const hudEl = document.getElementById('roundHud');
  const results = createOnlineResults({ world, spectator, document });

  let socket = null;
  let net = logic.createNetState();
  let active = false;
  let lastInput = null;
  let sinceInput = 0;
  let poses = new Map();
  let spawned = new Set();
  let announcedOver = false;
  let spectating = false;
  let localAvatarRole = null;
  let narratedTick = -1;
  let publishedKeys = '';
  // The seat to reclaim if the socket drops mid-round. Session storage rather than local: a seat is
  // this tab's, and a second tab opening the hotel must not steal it.
  const sessionStore = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const SESSION_KEY = 'hide-and-seek.session';
  let reconnectTimer = null;

  function saveSession() {
    if (!sessionStore) return;
    const saved = logic.rememberSession(net, Date.now());
    try {
      if (saved) sessionStore.setItem(SESSION_KEY, JSON.stringify(saved));
      else sessionStore.removeItem(SESSION_KEY);
    } catch { /* a browser refusing storage is not a reason to refuse the round */ }
  }

  function readSession() {
    if (!sessionStore) return null;
    try { return JSON.parse(sessionStore.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function clearSession() {
    if (!sessionStore) return;
    try { sessionStore.removeItem(SESSION_KEY); } catch { /* see above */ }
  }

  function label() {
    if (net.error) return `ERROR: ${net.error.code}`;
    if (net.status === logic.NET_STATES.OFFLINE) return 'NOT CONNECTED';
    if (net.status === logic.NET_STATES.CONNECTING) return 'CONNECTING…';
    if (net.status === logic.NET_STATES.LOBBY) return `WAITING FOR GUESTS (${net.members.length})`;
    if (net.status === logic.NET_STATES.STARTING) return 'THE HOTEL IS OPENING…';
    if (net.status === logic.NET_STATES.ENDED) return 'ROUND OVER';
    if (net.absent.length) return `IN THE HOTEL · ${net.absent.length} GUEST${net.absent.length === 1 ? '' : 'S'} DROPPED`;
    return 'IN THE HOTEL';
  }

  function renderLobby() {
    if (statusEl) { statusEl.textContent = label(); statusEl.dataset.state = net.status; }
    if (roomEl) roomEl.textContent = net.roomCode || '— — — — —';
    if (playerCountEl) playerCountEl.textContent = `${net.members.length} / ${logic.LOBBY_LIMITS.maxPlayers}`;
    if (copyBtn) copyBtn.disabled = !net.roomCode;
    if (rosterEl) {
      rosterEl.replaceChildren();
      if (!net.members.length) {
        const empty = document.createElement('div');
        empty.className = 'emptyRoster';
        empty.textContent = 'Waiting for the first guest…';
        rosterEl.appendChild(empty);
      }
      net.members.forEach((id, index) => {
        const guest = document.createElement('div');
        guest.className = 'rosterGuest';
        const seat = document.createElement('span');
        seat.className = 'guestSeat';
        seat.textContent = String(index + 1).padStart(2, '0');
        const name = document.createElement('span');
        name.className = 'guestName';
        name.textContent = id === net.clientId ? 'YOU' : `GUEST ${index + 1}`;
        const badge = document.createElement('span');
        badge.className = 'guestBadge';
        badge.textContent = id === net.ownerId ? 'HOST' : 'READY';
        guest.append(seat, name, badge);
        rosterEl.appendChild(guest);
      });
    }
    if (startBtn) {
      const owner = !!net.clientId && net.clientId === net.ownerId;
      startBtn.disabled = !owner || net.members.length < 2 || net.status !== logic.NET_STATES.LOBBY;
      startBtn.textContent = owner ? 'START ROUND' : 'WAITING FOR HOST';
    }
  }

  function send(payload) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function sendLobbyMessage(messageType, value) {
    return send({ type: 'lobby_message', messageType, value: JSON.stringify(value) });
  }

  // Remote bodies wear the rig every player wears, so nothing here knows it is drawing someone else.
  function syncBodies(delta) {
    const seen = new Set();
    for (const entry of logic.othersOf(net)) {
      seen.add(entry.id);
      if (!spawned.has(entry.id)) {
        avatars.spawn(entry.id, {
          role: entry.role === 'seeker' ? avatarLogic.ROLES.SEEKER : avatarLogic.ROLES.HIDER,
          seat: spawned.size + 1,
          name: entry.name || 'Guest',
        });
        spawned.add(entry.id);
      }
      if (!entry.alive) { avatars.setVisible(entry.id, false); continue; }
      avatars.setVisible(entry.id, true);
      const target = { x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw, crouching: entry.crouching, flashlightOn: entry.flashlight.on, flashlightCharge: entry.flashlight.charge };
      const pose = logic.interpolatePose(poses.get(entry.id), target, delta);
      poses.set(entry.id, pose);
      avatars.setPose(entry.id, pose);
    }
    for (const id of [...spawned]) {
      if (seen.has(id)) continue;
      avatars.remove(id);
      spawned.delete(id);
      poses.delete(id);
    }
  }

  function syncLocalRole() {
    const self = logic.selfOf(net);
    if (!self || self.role === localAvatarRole) return;
    localAvatarRole = self.role;
    avatars.spawn('local', { role: self.role === 'seeker' ? avatarLogic.ROLES.SEEKER : avatarLogic.ROLES.HIDER, seat: 0, hideHead: true, name: self.name || 'You' });
  }

  function spectatorPlayers() { return net.snapshot?.players || []; }

  function beginSpectating() {
    if (spectating) return;
    spectating = true;
    world.state.playerEliminated = true;
    avatars.setVisible('local', false);
    player.setFlashlight(false);
    spectator?.start(spectatorPlayers, net.clientId);
    world.notify('YOU WERE CAUGHT. SPECTATING THE REST OF THE MATCH.', 2600);
  }

  function finishRound() {
    if (announcedOver || !net.snapshot?.round?.over) return;
    announcedOver = true;
    spectating = false;
    const view = net.snapshot.round;
    const won = (logic.isSeeker(net) && view.outcome === 'seeker') || (!logic.isSeeker(net) && view.outcome === 'hiders');
    results.show({
      eyebrow: won ? 'MATCH COMPLETE — YOUR SIDE WON' : 'MATCH COMPLETE',
      title: won ? 'VICTORY' : 'YOUR SIDE LOST',
      message: won
        ? `${logic.isSeeker(net) ? 'Every guest was found' : 'The seeker never cleared the building'}. Find another match to choose a stage and join a new lobby.`
        : 'The online round is over. Find another match to choose a stage and join a new lobby.',
      outcome: view.outcome, won });
  }

  function failOnline(message) {
    clearSession();
    window.clearTimeout(reconnectTimer);
    const connection = socket;
    socket = null;
    connection?.close();
    net = logic.applyNetEvent(net, { event: 'error', code: 'ONLINE_SESSION', message });
    // Keep the authority claim until the user explicitly leaves. A transport error cannot enable
    // the solo simulation, even while the online recovery screen is visible.
    results.show({ eyebrow: 'ONLINE MATCH INTERRUPTED', title: 'MATCH UNAVAILABLE', message });
  }

  // The hotel's moving parts, drawn from the snapshot. None of this is decided here: a door is open
  // because the server says so, the cabin is at that height because the server put it there, and a
  // drawer is empty because someone else got there first.
  function applyFixtures(view) {
    if (!view) return;
    if (hotel) hotel.applyOpenings(view.doors || {});
    if (furnishings) for (const id of Object.keys(view.drawers)) furnishings.applyDrawer(id, view.drawers[id]);
    if (elevator) elevator.applyRemote(view.elevator);
  }

  // The key ring is the one piece of fixture state that is *yours*, so it arrives on your own player
  // record rather than in the shared fixture view — another player's keys are not your business.
  function applyKeys(keys) {
    const joined = (keys || []).join('|');
    if (joined === publishedKeys) return;
    publishedKeys = joined;
    world.state.inventory = new Set(keys || []);
    world.updateInventoryHud();
  }

  // Server events, narrated once. Snapshots arrive 15 times a second and this runs 60, so the tick
  // that produced them is what gates the callout — otherwise every message is read out four times.
  function narrate(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.events) || snapshot.tick === narratedTick) return;
    narratedTick = snapshot.tick;
    for (const event of snapshot.events) {
      if (event.playerId && event.playerId !== net.clientId) continue;
      if (event.type === 'door-locked') world.notify(`${event.roomNumber} is locked. Search drawers or find another route.`, 2200);
      else if (event.type === 'door-unlocked') world.notify(`${event.roomNumber} unlocked.`, 1800);
      else if (event.type === 'key-found') world.notify(`Found: ${event.keyLabel || event.keyId}`, 2000);
      else if (event.type === 'drawer-empty') world.notify('Nothing useful in this drawer.', 1600);
      else if (event.type === 'secret-discovered') world.notify('A hidden passage is behind the wall.', 2200);
      else if (event.type === 'flashlight-pickup') world.notify(`FLASHLIGHT CHARGE: ${Math.ceil(event.charge * 100)}%`, 1800);
      else if (event.type === 'elevator-held') world.notify('The elevator is locked until hiding time is over.', 1800);
    }
  }

  function paintRoundHud() {
    const view = net.snapshot?.round;
    if (!view || !hudEl) return;
    hudEl.dataset.phase = view.phase;
    if (clockEl) clockEl.textContent = view.clock || (view.seconds === null ? 'NO LIMIT' : '');
    if (countEl) countEl.textContent = `${view.hidersRemaining}/${view.hidersTotal}`;
    if (bannerEl) {
      bannerEl.textContent = view.phase === 'hiding'
        ? (logic.isSeeker(net) ? 'THEY ARE HIDING — WAIT HERE' : 'HIDE. THE SEEKER IS HELD.')
        : '';
    }
  }

  // The camera is corrected toward the authoritative body, never driven by it: hard-setting a
  // position 15 times a second is a stutter, and the local player has already walked with the same
  // rules the server used.
  function reconcileSelf(delta, initial = false) {
    const self = logic.selfOf(net);
    if (!self) return;
    if (!self.alive) {
      if (!net.snapshot?.round?.over) beginSpectating();
      return;
    }
    const eyeHeight = player.getEyeHeight();
    const local = { x: camera.position.x, y: camera.position.y - eyeHeight, z: camera.position.z };
    const fixed = initial ? { ...self, corrected: true } : logic.reconcilePosition(local, self, delta);
    if (fixed.corrected) camera.position.set(fixed.x, fixed.y + eyeHeight, fixed.z);
    world.state.playerFeetY = fixed.y;
    world.state.seekerHeld = net.snapshot.round.phase === 'hiding' && logic.isSeeker(net);
  }

  function pushInput(delta) {
    const input = logic.describeInput({ ...player.getInput(), yaw: world.state.yaw });
    sinceInput += delta;
    if (!logic.shouldSendInput(lastInput, input, sinceInput)) return;
    if (!sendLobbyMessage('hide_and_seek_input', input)) return;
    lastInput = input;
    sinceInput = 0;
  }

  function handleEvent(event) {
    const previousStatus = net.status;
    net = logic.applyNetEvent(net, event);
    if (event.event === 'connected') {
      // A seat still inside its grace window is reclaimed rather than replaced: the body is standing
      // in the hotel and is still catchable, so rejoining as a new player would leave a corpse.
      const resume = logic.resumeRequestFor(readSession(), Date.now(), logic.RECONNECT_GRACE_MS);
      if (resume) send(resume);
      else send({ type: 'find_lobby', gameId, ...logic.LOBBY_LIMITS, settings: lobbySettings(), identity: identity || undefined });
    }
    if (event.event === 'error' && event.code === 'RESUME_REJECTED') {
      clearSession();
      if (active) { failOnline('Your seat could not be rejoined. Find another online match.'); return; }
      send({ type: 'find_lobby', gameId, ...logic.LOBBY_LIMITS, settings: lobbySettings(), identity: identity || undefined });
    }
    if (event.event === 'session_resumed') {
      active = true;
      world.state.remoteFixtures = true;
      menu.dispatch(menu.actions.PLAY);
    }
    if (event.event === 'lobby_joined' || event.event === 'session_resumed') saveSession();
    if (net.status === logic.NET_STATES.STARTING && previousStatus !== logic.NET_STATES.STARTING) {
      active = true;
      announcedOver = false;
      spectating = false;
      world.state.gameOver = false;
      world.state.playerEliminated = false;
      // There is one authority per hotel. Every door, drawer, lift and demon in this browser stops
      // deciding anything the moment the match starts, and the offline stand-in hiders leave the
      // building — the guests are real now.
      world.state.remoteFixtures = true;
      if (hiders) hiders.standDown();
      if (!logic.hasPlayableSnapshot(net)) {
        failOnline('The server did not provide a complete round with one seeker. Reload before joining again.');
        return;
      }
      // The start packet already contains the authority's world. Apply it before input is enabled,
      // including an exact spawn, instead of waiting for the first periodic snapshot.
      update(0, true);
      if (!world.state.gameOver) menu.dispatch(menu.actions.PLAY);
    }
    if (net.status === logic.NET_STATES.ENDED && previousStatus !== logic.NET_STATES.ENDED) {
      // A finished round is not a seat worth reclaiming.
      clearSession();
      world.emit('round-over', { ...net.snapshot.round, online: true });
      finishRound();
    }
    renderLobby();
  }

  function connect() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    net = logic.applyNetEvent(logic.createNetState(), { event: 'connected', clientId: null });
    renderLobby();
    const connection = new window.WebSocket(socketUrl);
    socket = connection;
    connection.addEventListener('message', (message) => {
      if (socket !== connection) return;
      let payload = null;
      try { payload = JSON.parse(message.data); } catch { payload = null; }
      if (payload) handleEvent(payload);
    });
    connection.addEventListener('close', () => {
      if (socket !== connection) return;
      socket = null;
      // Mid-round, a closed socket is a dropped connection rather than a finished game: the seat is
      // held for a grace window, so try to walk back into it before tearing the lobby down.
      if (active && [logic.NET_STATES.STARTING, logic.NET_STATES.PLAYING].includes(net.status)) saveSession();
      const resumable = logic.resumeRequestFor(readSession(), Date.now(), logic.RECONNECT_GRACE_MS);
      if (resumable) {
        if (statusEl) statusEl.textContent = 'RECONNECTING…';
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => connect(), 1200);
        return;
      }
      if (active && !world.state.gameOver) { failOnline('The connection was lost. Find another online match.'); return; }
      clearSession();
      net = logic.applyNetEvent(net, { event: 'lobby_closed' });
      renderLobby();
    });
    connection.addEventListener('error', () => {
      if (socket !== connection) return;
      // The close event owns reconnection; keep the seat's current state until it runs.
      if (active) return;
      net = logic.applyNetEvent(net, { event: 'error', code: 'SOCKET', message: 'Connection failed' });
      renderLobby();
    });
  }

  function disconnect() {
    active = false;
    world.state.remoteFixtures = false;
    window.clearTimeout(reconnectTimer);
    clearSession();
    const connection = socket;
    socket = null;
    if (connection) connection.close();
    net = logic.createNetState();
    renderLobby();
  }

  function update(delta, initial = false) {
    if (!active) return;
    if (![logic.NET_STATES.STARTING, logic.NET_STATES.PLAYING, logic.NET_STATES.ENDED].includes(net.status)) return;
    if (!net.snapshot?.round || !Array.isArray(net.snapshot.players)) return;
    // Two authorities disagreeing about who was caught is the failure this whole layer exists to
    // prevent; two of them disagreeing about which *building* the round is in is the same failure
    // one level down, and it can only end with a body walking through a wall that is not there.
    // Refuse the round out loud instead.
    const mismatch = logic.snapshotMapMismatch(net.snapshot, localMapId);
    if (mismatch && !mapMismatch) {
      mapMismatch = mismatch;
      world.notify(`This round is in a different location (${mismatch.actual}). Reload to join it.`);
      world.emit('online-map-mismatch', mismatch);
      failOnline('The server selected a different map. Find another match after choosing the same stage.');
    }
    if (mapMismatch) return;
    syncLocalRole();
    const self = logic.selfOf(net);
    if (self?.alive && !initial) pushInput(delta);
    reconcileSelf(delta, initial);
    syncBodies(delta);
    applyFixtures(net.snapshot?.fixtures);
    if (demons) demons.applySnapshot(net.snapshot?.demons || [], net.snapshot?.threat, net.clientId);
    if (flashlightDrops) flashlightDrops.applySnapshot(net.snapshot?.pickups || []);
    if (self) {
      if (self.alive) player.applyRemoteFlashlight(self.flashlight);
      else player.setFlashlight(false);
      applyKeys(self.keys);
    }
    narrate(net.snapshot);
    paintRoundHud();
    spectator?.update();
    finishRound();
  }

  function menuClick() {
    window.dispatchEvent(new window.CustomEvent('hotel:menu-action', { detail: { action: 'onlineAction' } }));
  }

  if (startBtn) startBtn.addEventListener('click', () => { menuClick(); send({ type: 'start_lobby' }); });
  if (copyBtn) copyBtn.addEventListener('click', () => {
    if (!net.roomCode) return;
    menuClick();
    window.navigator?.clipboard?.writeText(net.roomCode).catch(() => {});
    copyBtn.textContent = 'COPIED';
    window.setTimeout(() => { copyBtn.textContent = 'COPY CODE'; }, 1200);
  });
  renderLobby();

  return {
    connect, disconnect, update,
    isActive: () => active,
    getState: () => ({
      status: net.status, roomCode: net.roomCode, clientId: net.clientId,
      members: net.members.length, absent: net.absent.length, seeker: net.seekerId,
      mapId: localMapId,
      mapMismatch,
      tick: net.snapshot?.tick ?? null,
      demons: net.snapshot?.demons?.length ?? 0,
      threat: net.snapshot?.threat ?? null,
      resumable: !!logic.resumeRequestFor(readSession(), Date.now(), logic.RECONNECT_GRACE_MS),
    }),
  };
}
