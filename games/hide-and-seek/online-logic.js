(function attachHotelOnline(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelOnline = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelOnlineApi() {
  'use strict';

  // The client half of online play, as rules rather than as a socket.
  //
  // `modules/online.js` owns the WebSocket, the avatars and the camera; everything here is pure so
  // the same decisions can be tested with `node --test`: what the connection is doing, what the
  // lobby looks like, which input is worth sending, and how far a client is allowed to disagree with
  // the server about where it is standing.
  //
  // The standing rule from the rest of the cabinet applies here too: **the server is the authority.**
  // A snapshot is the truth, and the local body is only ever predicted between snapshots. Nothing in
  // this file may decide a catch, a battery level or a role — it only reads them off what arrived.

  const NET_STATES = Object.freeze({
    OFFLINE: 'offline',
    CONNECTING: 'connecting',
    LOBBY: 'lobby',
    STARTING: 'starting',
    PLAYING: 'playing',
    ENDED: 'ended',
    ERROR: 'error',
  });

  // How far the local body may drift from the authoritative one before the difference stops being
  // smoothed away and is simply applied. A player walking round a corner the server has not seen yet
  // is a few centimetres out; a player who has been pushed through a door is metres out, and pretending
  // otherwise leaves them standing inside a wall.
  const RECONCILE_DEFAULTS = Object.freeze({
    snapDistance: 2.4,
    blendPerSecond: 6,
    ignoreDistance: 0.06,
  });

  const INPUT_HEARTBEAT_SECONDS = 0.5;

  // The server holds a dropped player's seat for 30 seconds and leaves their body standing where it
  // was — a free find, which is the honest consequence. The client is given slightly less than that
  // to come back, so a resume that is already too late is never even attempted.
  const RECONNECT_GRACE_MS = 30_000;

  // The lobby size, and it has to be **sent** rather than left to the server's default. `find_lobby`
  // matches an open lobby by its seat limits, and a search that omits them is sanitized to the
  // server-wide default of 2-6 — which never equals the 2-8 lobby this game actually creates, so
  // every guest would silently open a room of their own instead of joining each other.
  const LOBBY_LIMITS = Object.freeze({ minPlayers: 2, maxPlayers: 8 });
  const RESUME_MARGIN_MS = 1_500;

  // Which building an online round is played in, carried as a lobby setting.
  //
  // A client builds its map at boot, so it cannot join a round happening somewhere else — it has no
  // geometry for it, and every collision, every ground height and every catch would be adjudicated
  // against a building it is not standing in. Matchmaking already compares lobby settings, so
  // sending the map is what keeps two locations from being matched into one round. Two maps are two
  // pools, deliberately.
  function lobbySettingsFor(mapId) {
    return { mapId: typeof mapId === 'string' && mapId ? mapId : 'grand-hotel' };
  }

  // The authority names the map in its snapshot. If it ever disagrees with the building this page
  // actually built, the round is unplayable here and saying so is far better than walking a body
  // through a hotel the server thinks is a mall.
  function snapshotMapMismatch(snapshot, localMapId) {
    const announced = snapshot && typeof snapshot.mapId === 'string' ? snapshot.mapId : null;
    if (!announced || !localMapId) return null;
    return announced === localMapId ? null : { expected: localMapId, actual: announced };
  }

  function createNetState() {
    return {
      status: NET_STATES.OFFLINE,
      clientId: null,
      sessionToken: null,
      roomCode: null,
      ownerId: null,
      members: [],
      seekerId: null,
      snapshot: null,
      error: null,
      // Who has dropped and is still inside their grace window. Their body is standing in the hotel
      // and is still catchable, so this is a caption rather than a roster change.
      absent: [],
    };
  }

  // What has to survive a socket closing so the same seat can be reclaimed. Nothing about the round
  // is kept — the server still owns all of that, and a resumed client is told it fresh.
  function rememberSession(state, now = Date.now()) {
    if (!state || !state.clientId || !state.sessionToken || !state.roomCode) return null;
    return { clientId: state.clientId, sessionToken: state.sessionToken, roomCode: state.roomCode, at: now };
  }

  // Whether a saved seat is still worth asking for. Past the grace window the server has already
  // given it away, and asking would only produce a RESUME_REJECTED to handle.
  function resumeRequestFor(saved, now = Date.now(), graceMs = RECONNECT_GRACE_MS) {
    if (!saved || !saved.clientId || !saved.sessionToken) return null;
    if (!(now - (saved.at || 0) < graceMs - RESUME_MARGIN_MS)) return null;
    return { type: 'resume_lobby', clientId: saved.clientId, sessionToken: saved.sessionToken };
  }

  function memberIdsFrom(payload) {
    if (Array.isArray(payload?.members)) return payload.members.map((entry) => (typeof entry === 'string' ? entry : entry?.clientId)).filter(Boolean);
    return [];
  }

  function parseValue(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
  }

  // One server event in, one whole view out. The reducer never mutates, so a render can hold on to a
  // previous view and diff against it.
  function applyNetEvent(state, event) {
    const current = state || createNetState();
    if (!event || !event.event) return current;
    switch (event.event) {
      case 'connected':
        return {
          ...current,
          status: NET_STATES.CONNECTING,
          clientId: event.clientId || null,
          sessionToken: event.sessionToken || null,
          error: null,
        };
      // The seat was still there. The round is still running and the server will say where everyone
      // is on the next snapshot, so this only restores who this client *is*.
      case 'session_resumed':
        return {
          ...current,
          status: NET_STATES.PLAYING,
          clientId: event.clientId || current.clientId,
          sessionToken: event.sessionToken || current.sessionToken,
          roomCode: event.roomCode || current.roomCode,
          error: null,
        };
      case 'lobby_player_disconnected':
        return { ...current, absent: [...new Set([...current.absent, event.clientId].filter(Boolean))] };
      case 'lobby_player_reconnected':
        return { ...current, absent: current.absent.filter((id) => id !== event.clientId) };
      case 'lobby_joined':
        return {
          ...current,
          status: NET_STATES.LOBBY,
          clientId: event.clientId || current.clientId,
          roomCode: event.roomCode || null,
          ownerId: event.ownerId || null,
          members: memberIdsFrom(event),
          error: null,
        };
      case 'lobby_updated':
      case 'lobby_player_joined':
      case 'lobby_player_left':
        return { ...current, members: memberIdsFrom(event) || current.members, ownerId: event.ownerId || current.ownerId };
      case 'lobby_started': {
        const started = parseValue(event.matchState);
        return {
          ...current,
          status: NET_STATES.STARTING,
          members: memberIdsFrom(event) || current.members,
          seekerId: started?.seekerId || current.seekerId,
          snapshot: started || current.snapshot,
        };
      }
      case 'lobby_closed':
      case 'lobby_left':
        return { ...createNetState(), clientId: current.clientId, status: NET_STATES.OFFLINE };
      case 'message': {
        if (event.messageType !== 'hide_and_seek_snapshot' && event.messageType !== 'hide_and_seek_match_ended') return current;
        const snapshot = parseValue(event.value);
        if (!snapshot) return current;
        const ended = event.messageType === 'hide_and_seek_match_ended' || !!snapshot.round?.over;
        return {
          ...current,
          status: ended ? NET_STATES.ENDED : NET_STATES.PLAYING,
          seekerId: snapshot.seekerId || current.seekerId,
          snapshot,
        };
      }
      case 'error':
        // A refused resume is not a failure state: the seat is simply gone, and the client falls
        // back to joining a lobby the ordinary way.
        if (event.code === 'RESUME_REJECTED') return { ...current, status: NET_STATES.CONNECTING, error: null };
        return { ...current, status: NET_STATES.ERROR, error: { code: event.code || 'ERROR', message: event.message || '' } };
      default:
        return current;
    }
  }

  function selfOf(state) {
    if (!state?.snapshot || !state.clientId) return null;
    return state.snapshot.players.find((entry) => entry.id === state.clientId) || null;
  }

  function othersOf(state) {
    if (!state?.snapshot) return [];
    return state.snapshot.players.filter((entry) => entry.id !== state.clientId);
  }

  function isSeeker(state) {
    return !!state?.clientId && state.clientId === state?.seekerId;
  }

  // What the client is trying to do. Deliberately the whole payload: there is no field here for
  // where the player thinks they are, because the server does not read one.
  function describeInput({ forward = 0, strafe = 0, yaw = 0, crouch = false, sprint = false, light = false, interact = false } = {}) {
    return {
      forward: Math.max(-1, Math.min(1, Number(forward) || 0)),
      strafe: Math.max(-1, Math.min(1, Number(strafe) || 0)),
      yaw: Number.isFinite(yaw) ? Number(yaw) : 0,
      crouch: !!crouch,
      sprint: !!sprint,
      light: !!light,
      interact: !!interact,
    };
  }

  // The server keeps the last input it was given, so an unchanged one does not need resending — but
  // a heartbeat still goes out, because silence and "stopped moving" have to be distinguishable when
  // a socket stalls. A turn of the head is a change: the yaw is what the step is derived from.
  function shouldSendInput(previous, next, secondsSinceSent = 0) {
    if (!previous) return true;
    if (secondsSinceSent >= INPUT_HEARTBEAT_SECONDS) return true;
    if (previous.forward !== next.forward || previous.strafe !== next.strafe) return true;
    if (previous.crouch !== next.crouch || previous.sprint !== next.sprint || previous.light !== next.light) return true;
    // The authority reads a rising edge off `interact`, so both halves of a press have to reach it.
    // A release that is never sent leaves the door strobing on the next press.
    if (previous.interact !== next.interact) return true;
    return Math.abs(previous.yaw - next.yaw) > 0.01;
  }

  // Prediction meets authority. Small disagreements are walked off over a few frames so a corridor
  // does not stutter; a large one is applied at once, because it means the client is somewhere the
  // server never put it.
  function reconcilePosition(local, authoritative, delta, config) {
    const cfg = config ? { ...RECONCILE_DEFAULTS, ...config } : RECONCILE_DEFAULTS;
    if (!authoritative) return { x: local.x, y: local.y, z: local.z, corrected: false, snapped: false };
    const dx = authoritative.x - local.x;
    const dy = authoritative.y - local.y;
    const dz = authoritative.z - local.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= cfg.ignoreDistance) return { x: local.x, y: local.y, z: local.z, corrected: false, snapped: false };
    if (distance >= cfg.snapDistance) {
      return { x: authoritative.x, y: authoritative.y, z: authoritative.z, corrected: true, snapped: true };
    }
    const blend = Math.max(0, Math.min(1, delta * cfg.blendPerSecond));
    return {
      x: local.x + dx * blend,
      y: local.y + dy * blend,
      z: local.z + dz * blend,
      corrected: true,
      snapped: false,
    };
  }

  // Remote bodies arrive 15 times a second and are drawn 60: they are walked toward the last pose
  // that arrived rather than teleported onto it. Yaw takes the short way round.
  function interpolatePose(previous, target, delta, rate = 12) {
    if (!previous) return { ...target };
    const blend = Math.max(0, Math.min(1, delta * rate));
    let turn = target.yaw - previous.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return {
      ...target,
      x: previous.x + (target.x - previous.x) * blend,
      y: previous.y + (target.y - previous.y) * blend,
      z: previous.z + (target.z - previous.z) * blend,
      yaw: previous.yaw + turn * blend,
    };
  }

  return {
    INPUT_HEARTBEAT_SECONDS, LOBBY_LIMITS, NET_STATES, RECONCILE_DEFAULTS, RECONNECT_GRACE_MS,
    lobbySettingsFor, snapshotMapMismatch,
    applyNetEvent, createNetState, describeInput, interpolatePose, isSeeker,
    othersOf, reconcilePosition, rememberSession, resumeRequestFor, selfOf, shouldSendInput,
  };
});
