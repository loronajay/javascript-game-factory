// onlineSession.js — bridge between the relay client (onlineClient.js) and the
// match controller (the onlineController object in main.js) for online play. The
// controller stays networking-agnostic: it dispatches and animates exactly as it
// does offline, and calls a couple of small hooks on `net`. Everything relay-specific
// lives here. Ported from Mini-Tactics — already game-agnostic.
//
// Authority = deterministic lockstep (see onlineClient.js header):
//   - The active player applies its own accepted command locally, then broadcasts it.
//   - Every other client replays the command through the SAME seeded reducer, so the
//     dice match without ever being sent.
//   - The lobby OWNER broadcasts its state hash after every applied command; the
//     non-owners verify their own hash for that revision and end cleanly on mismatch.
//   - A player leaving mid-match is handled by the (current) OWNER injecting a
//     `concede` command for that seat into the same ordered command stream, so the
//     match continues deterministically (or ends if one side remains). Ownership can
//     transfer to us if the previous owner is the one who left.
//
// The session is created by the lobby on `lobby_started`, BEFORE the controller is
// bound, so remote commands that arrive during the screen handoff are buffered and
// flushed on bind().

import { hashState } from "../core/state-hash.js";

// How long to keep the socket alive after a clean match end, so peers can also
// finish animating the final command before our close would look like a drop.
const CLEAN_CLOSE_GRACE_MS = 2500;

export function createOnlineSession({ client, mySeat, isOwner, members, seed, size, localProfile = null }) {
  let _controller = null;
  let latencyMs = null;
  let _ended = false;
  let _owner = !!isOwner;

  // The ordered clientId list from lobby_started: seat = index + 1, identical on
  // every client. Lets us map a departed clientId back to its seat.
  const membersAtStart = Array.isArray(members) ? members.slice() : [];
  const myClientId = client.getClientId();

  // Per-seat display names from the `profile` exchange (for HUD strings).
  const nameBySeat = new Map();
  // Presentation-only rich identity for ranked nameplates. Never enters state hash.
  const profileBySeat = new Map();
  // Seats we have already conceded on disconnect, so a re-fired left event (or a
  // second owner) never double-concedes.
  const handledDrops = new Set();

  // Remote commands that arrive before the controller binds, kept in order.
  const _pending = [];
  // Owner-authored disconnect concedes can also arrive during the lobby -> match
  // handoff. Keep them until a live controller can inject the command.
  const _pendingOwnerConcedes = [];
  // Serialize remote applies (and owner-authored concedes) so their async
  // animations never overlap.
  let _applyChain = Promise.resolve();

  // Owner hashes keyed by revision (verified by non-owners); our own hashes keyed
  // by revision. Whichever arrives second triggers the comparison.
  const _ownerHashByRevision = new Map();
  const _myHashByRevision = new Map();

  function seatForClientId(clientId) {
    const idx = membersAtStart.indexOf(clientId);
    return idx >= 0 ? idx + 1 : null;
  }

  function rememberProfile(profile) {
    const seat = Number(profile?.seat);
    if (!Number.isFinite(seat) || seat < 1) return;
    const displayName = typeof profile.displayName === "string" ? profile.displayName.trim() : "";
    if (displayName) nameBySeat.set(seat, displayName);
    profileBySeat.set(seat, {
      playerId: typeof profile.playerId === "string" ? profile.playerId : "",
      displayName: displayName || nameBySeat.get(seat) || `Player ${seat}`,
      rankedProfile: profile.rankedProfile && typeof profile.rankedProfile === "object"
        ? { ...profile.rankedProfile }
        : null,
    });
  }

  rememberProfile({ ...(localProfile || {}), seat: mySeat });

  function _checkHash(revision) {
    const mine = _myHashByRevision.get(revision);
    const owner = _ownerHashByRevision.get(revision);
    if (mine == null || owner == null) return;
    if (mine !== owner && !_ended) {
      _ended = true;
      _controller?.endOnDesync?.();
    }
  }

  // Record our post-apply hash for a revision (every client). On a non-owner this
  // feeds the desync check; on the owner it is the value we broadcast.
  function _recordLocalHash(match) {
    if (!match) return;
    _myHashByRevision.set(match.revision, hashState(match));
    if (!_owner) _checkHash(match.revision);
  }

  function _enqueueRemote(command) {
    _applyChain = _applyChain.then(async () => {
      if (_ended || !_controller) return;
      await _controller.applyRemoteCommand(command);
      const match = _controller.getMatchState?.();
      // After applying a command, the owner is at the canonical revision —
      // broadcast that hash so non-owners can verify.
      if (match) {
        if (_owner) client.sendHash(match.revision, hashState(match));
        _recordLocalHash(match);
      }
    });
    return _applyChain;
  }

  function _enqueueOwnerConcede(seat) {
    if (!_controller) {
      _pendingOwnerConcedes.push(seat);
      return Promise.resolve();
    }
    _applyChain = _applyChain.then(async () => {
      if (_ended || !_controller) return;
      await _controller.applyOwnerConcede(seat);
    });
    return _applyChain;
  }

  // ── client gameplay callbacks (own them from session creation) ──
  client.cb.onRemoteCommand = ({ command }) => {
    if (_controller) _enqueueRemote(command);
    else _pending.push(command);
  };

  client.cb.onRemoteHash = ({ revision, hash }) => {
    _ownerHashByRevision.set(revision, hash);
    if (!_owner) _checkHash(revision);
  };

  client.cb.onRemoteProfile = (profile) => {
    rememberProfile(profile);
  };

  client.cb.onLatency = (ms) => {
    latencyMs = ms;
  };

  // A player left the lobby mid-match. The relay reports the new owner; if that is
  // us, we take over hash authority AND the disconnect concede. The concede is
  // serialized on the apply chain so it never overlaps an in-flight animation; the
  // controller broadcasts it (and the owner's hash) through the normal command path.
  client.cb.onPlayerLeft = ({ clientId, ownerId }) => {
    if (_ended) return;
    if (ownerId && ownerId === myClientId) _owner = true;
    const seat = seatForClientId(clientId);
    if (seat == null || handledDrops.has(seat)) return;
    handledDrops.add(seat);
    if (!_owner) return; // non-owners simply replay the owner's concede command
    _enqueueOwnerConcede(seat);
  };

  client.cb.onClosed = () => {
    if (_ended) return;
    _ended = true;
    _controller?.endOnDisconnect?.("You lost connection to the match.");
  };

  // ── surface used by the controller ──

  // Called by the controller after a LOCAL command is accepted and applied.
  // Broadcast it so the others replay it; the owner also publishes its hash.
  function onLocalCommandApplied(command) {
    if (_ended) return;
    client.sendCommand(command);
    const match = _controller?.getMatchState?.();
    if (match) {
      if (_owner) client.sendHash(match.revision, hashState(match));
      _recordLocalHash(match);
    }
  }

  // Register the live controller and flush any commands that landed during the
  // lobby → match screen handoff.
  function bind(controller) {
    _controller = controller;
    // Seed our revision-0 hash so an immediate desync (bad seed/size) is caught.
    const match = controller.getMatchState?.();
    _recordLocalHash(match);
    if (_owner && match) client.sendHash(match.revision, hashState(match));
    while (_pending.length) _enqueueRemote(_pending.shift());
    while (_pendingOwnerConcedes.length) _enqueueOwnerConcede(_pendingOwnerConcedes.shift());
    client.startPinging();
  }

  // Match ended cleanly (a winner, or a concede). Keep the socket open briefly so
  // peers can also reach completion before our close would read as a disconnect.
  function endMatch() {
    if (_ended) return;
    _ended = true;
    client.stopPinging();
    if (typeof setTimeout === "function") {
      setTimeout(() => client.disconnect(), CLEAN_CLOSE_GRACE_MS);
    } else {
      client.disconnect();
    }
  }

  // Tear down immediately (quit / abandon / desync). Peers see a disconnect, which
  // is the correct outcome for an abandoned match.
  function dispose() {
    _ended = true;
    client.stopPinging();
    client.disconnect();
  }

  return {
    // identity / config the controller and HUD read
    mySeat,
    get isOwner() {
      return _owner;
    },
    seed,
    size,
    nameForSeat(seat) {
      return nameBySeat.get(seat) || null;
    },
    profileForSeat(seat) {
      const profile = profileBySeat.get(seat);
      return profile ? { ...profile, rankedProfile: profile.rankedProfile ? { ...profile.rankedProfile } : null } : null;
    },
    get latencyMs() {
      return latencyMs;
    },
    // hooks
    onLocalCommandApplied,
    bind,
    endMatch,
    dispose,
  };
}
