// The client half of an online match.
//
// This module holds no rules. The server decides the match; everything here exists to send this
// player's intent, draw what comes back, and keep the picture moving between snapshots.
//
// It is deliberately the only place that knows an online match is not a local one. `game.js` asks it
// for a world to render and hands it an input state, and the renderer never learns the difference.
import { advanceNpcEntities } from "./sim/npcs.js";
import { updatePlayer } from "./sim/player.js";
import { updatePoop } from "./sim/poop.js";
import { MATCH_SIM_PHASE, readMatchSimInput } from "./sim/match-sim.js";
import { playOnlineSoundEvents } from "./sim/online-sync.js";

export const ONLINE_INPUT_MESSAGE = "bird_duty_input";
export const ONLINE_SNAPSHOT_MESSAGE = "bird_duty_snapshot";
export const ONLINE_MATCH_ENDED_MESSAGE = "bird_duty_match_ended";

/** The three booleans that are the entire client-to-server vocabulary. */
export function inputPayloadFrom(inputState) {
  return readMatchSimInput({
    left: inputState?.left === true,
    right: inputState?.right === true,
    drop: inputState?.dropHeld === true,
  });
}

export function inputPayloadsDiffer(a, b) {
  if (!a || !b) return true;
  return a.left !== b.left || a.right !== b.right || a.drop !== b.drop;
}

export function createOnlineSession({ sounds = null } = {}) {
  let snapshot = null;
  let world = null;
  let lastSent = null;
  let matchEnded = false;

  function reset() {
    snapshot = null;
    world = null;
    lastSent = null;
    matchEnded = false;
  }

  /**
   * Take a server snapshot as the truth.
   *
   * The world is replaced wholesale rather than reconciled: this client predicted presentation since
   * the last one and every one of those predictions is now superseded. Sounds ride along on the
   * snapshot — the server names the voice line of the NPC that was actually hit, so a client never
   * has to guess one from a score delta.
   */
  function applySnapshot(next, { ended = false } = {}) {
    if (!next || typeof next !== "object") return false;
    // Snapshots arrive in order over one socket, but a stale one would rewind the match visibly.
    if (snapshot && Number(next.tick) < Number(snapshot.tick)) return false;

    snapshot = next;
    world = next.world ? { ...next.world } : world;
    if (ended) matchEnded = true;
    if (sounds) playOnlineSoundEvents(sounds, next);
    return true;
  }

  /**
   * Advance what this client can predict, one tick, between snapshots.
   *
   * Snapshots arrive at 20hz and the game runs at 60, so without this the whole match would step
   * three frames at a time. Nothing here scores, spawns, despawns or makes a sound — it moves the
   * things already on screen along the paths they are already on, and the next snapshot corrects it.
   */
  function predict(localInput, myClientId) {
    if (!world) return;
    if (snapshot?.match?.phase !== MATCH_SIM_PHASE.PLAYING) return;

    world = {
      ...world,
      npcs: { ...world.npcs, entities: advanceNpcEntities(world.npcs?.entities) },
      poop: updatePoop(world.poop),
      // Only this client's own bird, and only on its own turn. Predicting somebody else's bird would
      // be inventing their input.
      player: snapshot.activeClientId === myClientId && myClientId
        ? updatePlayer(world.player, localInput || {})
        : world.player,
    };
  }

  return {
    reset,
    applySnapshot,
    predict,
    /**
     * Send this client's intent, but only when it actually changed.
     *
     * The server holds the last input it was given and keeps applying it, so a held key costs one
     * message rather than sixty a second.
     */
    sendInput(client, inputState) {
      const payload = inputPayloadFrom(inputState);
      if (!inputPayloadsDiffer(payload, lastSent)) return false;
      lastSent = payload;
      client?.sendInput?.(payload);
      return true;
    },
    get snapshot() { return snapshot; },
    get world() { return world; },
    get match() { return snapshot?.match || null; },
    get activeClientId() { return snapshot?.activeClientId || null; },
    get ended() { return matchEnded || snapshot?.match?.phase === MATCH_SIM_PHASE.MATCH_OVER; },
    isMyTurn(clientId) {
      return Boolean(clientId) && snapshot?.activeClientId === clientId;
    },
  };
}
