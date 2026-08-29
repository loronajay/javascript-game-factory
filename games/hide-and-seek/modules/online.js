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
const PRODUCTION_WS_URL = 'wss://factory-network-server-production.up.railway.app';
const LOCAL_WS_URL = 'ws://localhost:3000';

export function defaultSocketUrl(location) {
  const host = location && location.hostname;
  return host === 'localhost' || host === '127.0.0.1' ? LOCAL_WS_URL : PRODUCTION_WS_URL;
}

export function createOnline({
  logic, avatars, avatarLogic, camera, world, player, menu, config: CONFIG, document, window,
  socketUrl = defaultSocketUrl(window.location), gameId = 'hide-and-seek', identity = null,
}) {
  const statusEl = document.getElementById('onlineStatus');
  const roomEl = document.getElementById('onlineRoom');
  const rosterEl = document.getElementById('onlinePlayers');
  const startBtn = document.getElementById('onlineStart');
  const clockEl = document.getElementById('roundClock');
  const countEl = document.getElementById('roundCount');
  const bannerEl = document.getElementById('roundBanner');
  const hudEl = document.getElementById('roundHud');

  let socket = null;
  let net = logic.createNetState();
  let active = false;
  let lastInput = null;
  let sinceInput = 0;
  let poses = new Map();
  let spawned = new Set();
  let announcedOver = false;

  function label() {
    if (net.error) return `ERROR: ${net.error.code}`;
    if (net.status === logic.NET_STATES.OFFLINE) return 'NOT CONNECTED';
    if (net.status === logic.NET_STATES.CONNECTING) return 'CONNECTING…';
    if (net.status === logic.NET_STATES.LOBBY) return `WAITING FOR GUESTS (${net.members.length})`;
    if (net.status === logic.NET_STATES.STARTING) return 'THE HOTEL IS OPENING…';
    if (net.status === logic.NET_STATES.ENDED) return 'ROUND OVER';
    return 'IN THE HOTEL';
  }

  function renderLobby() {
    if (statusEl) statusEl.textContent = label();
    if (roomEl) roomEl.textContent = net.roomCode ? `ROOM ${net.roomCode}` : '';
    if (rosterEl) {
      rosterEl.textContent = net.members.length
        ? net.members.map((id, index) => (id === net.clientId ? `You` : `Guest ${index + 1}`)).join(' · ')
        : 'No one else here yet.';
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
  function reconcileSelf(delta) {
    const self = logic.selfOf(net);
    if (!self) return;
    if (!self.alive) {
      if (!announcedOver) { announcedOver = true; world.emit('caught', { by: self.caughtBy || 'seeker', online: true }); }
      return;
    }
    const eyeHeight = player.getEyeHeight();
    const local = { x: camera.position.x, y: camera.position.y - eyeHeight, z: camera.position.z };
    const fixed = logic.reconcilePosition(local, self, delta);
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
      send({ type: 'find_lobby', gameId, identity: identity || undefined });
    }
    if (net.status === logic.NET_STATES.STARTING && previousStatus !== logic.NET_STATES.STARTING) {
      active = true;
      announcedOver = false;
      menu.dispatch(menu.actions.PLAY);
    }
    if (net.status === logic.NET_STATES.ENDED && previousStatus !== logic.NET_STATES.ENDED) {
      world.emit('round-over', { ...net.snapshot.round, online: true });
    }
    renderLobby();
  }

  function connect() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    net = logic.applyNetEvent(logic.createNetState(), { event: 'connected', clientId: null });
    renderLobby();
    socket = new window.WebSocket(socketUrl);
    socket.addEventListener('message', (message) => {
      let payload = null;
      try { payload = JSON.parse(message.data); } catch { payload = null; }
      if (payload) handleEvent(payload);
    });
    socket.addEventListener('close', () => {
      active = false;
      net = logic.applyNetEvent(net, { event: 'lobby_closed' });
      renderLobby();
    });
    socket.addEventListener('error', () => {
      net = logic.applyNetEvent(net, { event: 'error', code: 'SOCKET', message: 'Connection failed' });
      renderLobby();
    });
  }

  function disconnect() {
    active = false;
    if (socket) socket.close();
    socket = null;
  }

  function update(delta) {
    if (!active) return;
    if (net.status === logic.NET_STATES.PLAYING || net.status === logic.NET_STATES.ENDED) {
      pushInput(delta);
      reconcileSelf(delta);
      syncBodies(delta);
      paintRoundHud();
    }
  }

  if (startBtn) startBtn.addEventListener('click', () => send({ type: 'start_lobby' }));
  renderLobby();

  return {
    connect, disconnect, update,
    isActive: () => active,
    getState: () => ({ status: net.status, roomCode: net.roomCode, clientId: net.clientId, members: net.members.length, seeker: net.seekerId, tick: net.snapshot?.tick ?? null }),
  };
}
