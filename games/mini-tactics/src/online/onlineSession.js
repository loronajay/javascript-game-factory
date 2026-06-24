// onlineSession.js — bridge between the relay client (onlineClient.js) and the
// GameController. The controller stays networking-agnostic: it dispatches and
// animates exactly as it does offline, and calls a couple of small hooks on
// `this.net`. Everything relay-specific lives here.
//
// Authority = deterministic lockstep (see onlineClient.js header):
//   - Each side applies its own accepted command locally, then broadcasts it.
//   - The other side replays the command through the SAME seeded reducer, so the
//     dice match without ever being sent.
//   - The host (p1) broadcasts its state hash after every applied command; the
//     guest verifies its own hash for that revision and ends cleanly on mismatch.
//
// The session is created by the lobby once it knows seed/size/side, BEFORE the
// GameController exists, so remote commands that arrive during the screen handoff
// are buffered and flushed on bind().

import { hashState } from "../core/state-hash.js";

// How long to keep the socket alive after a clean match end, so the peer can also
// finish animating the final command before our close would look like a drop.
const CLEAN_CLOSE_GRACE_MS = 2500;

export function createOnlineSession({ client, mySeat, isHost, size, seed }) {
  let _controller = null;
  let remoteName = null;
  let latencyMs = null;
  let _ended = false;

  // Remote commands that arrive before the controller binds, kept in order.
  const _pending = [];
  // Serialize remote applies so their (async) animations never overlap.
  let _applyChain = Promise.resolve();

  // Host hashes keyed by revision (guest side); our own hashes keyed by revision.
  // We compare lazily: whichever arrives second triggers the check.
  const _hostHashByRevision = new Map();
  const _myHashByRevision = new Map();

  function _checkHash(revision) {
    const mine = _myHashByRevision.get(revision);
    const host = _hostHashByRevision.get(revision);
    if (mine == null || host == null) return;
    if (mine !== host && !_ended) {
      _ended = true;
      _controller?.endOnDesync?.();
    }
  }

  // Record our post-apply hash for a revision (both sides). On the guest this
  // feeds the desync check; on the host it is the value we broadcast.
  function _recordLocalHash(match) {
    if (!match) return;
    _myHashByRevision.set(match.revision, hashState(match));
    if (!isHost) _checkHash(match.revision);
  }

  function _enqueueRemote(command) {
    _applyChain = _applyChain.then(async () => {
      if (_ended || !_controller) return;
      await _controller.applyRemoteCommand(command);
      const match = _controller.getMatchState?.();
      // After applying a command that originated on the guest, the host is now at
      // the canonical revision — broadcast that hash so the guest can verify.
      if (match) {
        if (isHost) client.sendHash(match.revision, hashState(match));
        _recordLocalHash(match);
      }
    });
    return _applyChain;
  }

  // ── client gameplay callbacks (own them from session creation) ──
  client.cb.onRemoteCommand = ({ command }) => {
    if (_controller) _enqueueRemote(command);
    else _pending.push(command);
  };

  client.cb.onRemoteHash = ({ revision, hash }) => {
    _hostHashByRevision.set(revision, hash);
    if (!isHost) _checkHash(revision);
  };

  client.cb.onRemoteProfile = ({ displayName }) => {
    if (typeof displayName === "string" && displayName.trim()) {
      remoteName = displayName.trim();
    }
  };

  client.cb.onLatency = (ms) => {
    latencyMs = ms;
  };

  client.cb.onPartnerLeft = () => {
    if (_ended) return;
    _ended = true;
    _controller?.endOnDisconnect?.("Your opponent left the match.");
  };

  // ── surface used by the GameController ──

  // Called by the controller after a LOCAL command is accepted and applied.
  // Broadcast it so the opponent replays it; the host also publishes its hash.
  function onLocalCommandApplied(command) {
    if (_ended) return;
    client.sendCommand(command);
    const match = _controller?.getMatchState?.();
    if (match) {
      if (isHost) client.sendHash(match.revision, hashState(match));
      _recordLocalHash(match);
    }
  }

  // Register the live controller and flush any commands that landed during the
  // lobby → match screen handoff.
  function bind(controller) {
    _controller = controller;
    // Seed our revision-0 hash so an immediate desync (bad seed/size) is caught.
    _recordLocalHash(controller.getMatchState?.());
    while (_pending.length) _enqueueRemote(_pending.shift());
    client.startPinging();
  }

  // Match ended cleanly (a winner, or a concede). Stop treating the peer as
  // present, but keep the socket open briefly so the OTHER client can also reach
  // completion before our close would otherwise read as a disconnect to them.
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

  // Tear down immediately (quit / abandon / desync). The peer will see this as a
  // disconnect, which is the correct outcome for an abandoned match.
  function dispose() {
    _ended = true;
    client.stopPinging();
    client.disconnect();
  }

  return {
    // identity / config the controller and HUD read
    mySeat,
    isHost,
    size,
    seed,
    get remoteName() {
      return remoteName;
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
