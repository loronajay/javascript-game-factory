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

  function createNetState() {
    return {
      status: NET_STATES.OFFLINE,
      clientId: null,
      roomCode: null,
      ownerId: null,
      members: [],
      seekerId: null,
      snapshot: null,
      error: null,
    };
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
        return { ...current, status: NET_STATES.CONNECTING, clientId: event.clientId || null, error: null };
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
  function describeInput({ forward = 0, strafe = 0, yaw = 0, crouch = false, sprint = false, light = false } = {}) {
    return {
      forward: Math.max(-1, Math.min(1, Number(forward) || 0)),
      strafe: Math.max(-1, Math.min(1, Number(strafe) || 0)),
      yaw: Number.isFinite(yaw) ? Number(yaw) : 0,
      crouch: !!crouch,
      sprint: !!sprint,
      light: !!light,
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
    INPUT_HEARTBEAT_SECONDS, NET_STATES, RECONCILE_DEFAULTS,
    applyNetEvent, createNetState, describeInput, interpolatePose, isSeeker,
    othersOf, reconcilePosition, selfOf, shouldSendInput,
  };
});
