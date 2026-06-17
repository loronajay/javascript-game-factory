// rollback-session.js — GGPO-style rollback session with peer time-synchronization.
//
// This is the orchestration spine for Sumorai online play. It is pure: no DOM, no
// requestAnimationFrame, no WebSocket. Everything it touches is injected, so two sessions
// can be driven against each other headlessly under simulated latency (see
// tests/online-sync.test.js). That headless harness — not a single-machine playtest — is
// the gate that proves sync holds.
//
// Rollback has three legs; all three live here:
//   1. deterministic sim          — injected `tickSim` (the real per-tick simulation)
//   2. input prediction + rollback — predict remote = last confirmed input; resimulate on miss
//   3. peer time-synchronization   — frame-advantage stalling keeps both clocks on the same
//                                     frame number, the leg that was previously missing
//
// Transport assumption: the relay delivers room messages reliably and IN ORDER (verified —
// factory-network-server rebroadcasts over TCP with no throttle/reorder). That means remote
// input frames arrive contiguously, so `highestRemoteFrameReceived` IS the confirmed frame.

const DEFAULT_ROLLBACK_WINDOW = 60;   // frames of history (~1s at 60hz)
const TIME_SYNC_SAMPLE_WINDOW = 30;   // frames averaged for frame-advantage smoothing
const MIN_FRAME_ADVANTAGE     = 2;    // deadband: only stall when genuinely this far ahead
const MAX_CONSECUTIVE_STALLS  = 9;    // safety cap so a bad estimate can never freeze a peer

function mean(values) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// deps:
//   localSide        — 'p1' | 'p2' (which player this client controls)
//   gameState        — the live game state (read for pendingRoundEnd; mutated by tickSim)
//   tickSim(p1In,p2In)        — one deterministic simulation tick
//   saveState()               — snapshot current gameState (e.g. () => saveGameState(gameState))
//   loadState(snap)           — restore a snapshot (e.g. snap => loadGameState(gameState, snap))
//   inputsDiffer(a, b)        — true if two input snapshots differ
//   send(frame, input, adv)   — transmit local input for `frame` plus our frame-advantage
//   commitRoundEnd(pending)   — perform the irreversible round-end transition + clear pending
//   emptyInput                — a neutral input snapshot used for prediction fallback
//   rollbackWindow            — optional override of the history size
//   timeSyncEnabled           — optional; default true. When false, stalling is disabled
//                               (used by the test's "teeth check" to prove sync would break)
function createRollbackSession(deps) {
  const {
    localSide,
    gameState,
    tickSim,
    saveState,
    loadState,
    inputsDiffer,
    send,
    commitRoundEnd,
    emptyInput,
    epoch = 0,                // per-round id; rejects stray inputs from another round
    rollbackWindow = DEFAULT_ROLLBACK_WINDOW,
    timeSyncEnabled = true,
  } = deps;

  const window = rollbackWindow;
  const stateBuffer  = new Array(window);   // snapshot taken BEFORE simulating frame F
  const localInputs  = new Array(window);   // local input used at frame F
  const remoteInputs = new Array(window);   // remote input used at frame F (predicted or confirmed)
  const confirmed    = new Array(window).fill(false);  // is remoteInputs[slot] a real input?
  const futureConfirmed = new Map();        // confirmed remote inputs for frames we haven't reached

  let localFrame = 0;
  let highestRemoteFrameReceived = -1;      // == confirmed frame (contiguous ordered delivery)
  let predictionBaseline = null;            // newest confirmed remote input (repeat-last prediction)
  let resimulating = false;
  let active = true;

  // time-sync
  const advantageSamples = [];
  let remoteReportedAdvantage = 0;
  let consecutiveStalls = 0;

  // rollback-rate telemetry (for the network-health HUD)
  let rollbacksThisSec = 0;
  let displayRollbacks = 0;
  let secStartFrame = 0;

  function _mapInputs(localIn, remoteIn) {
    return localSide === 'p1' ? [localIn, remoteIn] : [remoteIn, localIn];
  }

  // Run one simulation frame and stamp the kill frame onto a freshly-set pendingRoundEnd.
  // tickSim (simulation-step) sets gameState.pendingRoundEnd on a kill but cannot know the
  // frame number; we stamp it here so it is identical whether reached live or during resim.
  function _simFrame(frame, p1In, p2In) {
    tickSim(p1In, p2In);
    const pending = gameState.pendingRoundEnd;
    if (pending && (pending.frame === null || pending.frame === undefined)) {
      pending.frame = frame;
    }
  }

  function _advance(localInput) {
    const slot = localFrame % window;
    stateBuffer[slot] = saveState();
    localInputs[slot] = { ...localInput };

    let remoteIn;
    const fut = futureConfirmed.get(localFrame);
    if (fut) {
      remoteIn = fut;
      confirmed[slot] = true;
      futureConfirmed.delete(localFrame);
    } else {
      remoteIn = predictionBaseline ?? emptyInput;
      confirmed[slot] = false;
    }
    remoteInputs[slot] = { ...remoteIn };

    const localAdvantage = localFrame - highestRemoteFrameReceived;
    advantageSamples.push(localAdvantage);
    if (advantageSamples.length > TIME_SYNC_SAMPLE_WINDOW) advantageSamples.shift();

    send(localFrame, localInput, localAdvantage, epoch);

    const [p1In, p2In] = _mapInputs(localInputs[slot], remoteInputs[slot]);
    _simFrame(localFrame, p1In, p2In);
    localFrame++;
  }

  function _resimulate(fromFrame) {
    if (localFrame - fromFrame > window) return;   // older than history; cannot roll back
    loadState(stateBuffer[fromFrame % window]);
    resimulating = true;
    for (let f = fromFrame; f < localFrame; f++) {
      const slot = f % window;
      stateBuffer[slot] = saveState();
      if (!confirmed[slot]) remoteInputs[slot] = { ...(predictionBaseline ?? emptyInput) };
      const localIn  = localInputs[slot]  ?? emptyInput;
      const remoteIn = remoteInputs[slot] ?? emptyInput;
      const [p1In, p2In] = _mapInputs(localIn, remoteIn);
      _simFrame(f, p1In, p2In);
    }
    resimulating = false;
    rollbacksThisSec++;
  }

  // Re-derive the exact post-kill state from confirmed inputs so BOTH peers begin the
  // round-end sequence from an identical frame, then perform the irreversible transition.
  function _commit(pending) {
    const slot = pending.frame % window;
    loadState(stateBuffer[slot]);
    resimulating = true;
    const localIn  = localInputs[slot]  ?? emptyInput;
    const remoteIn = remoteInputs[slot] ?? emptyInput;   // confirmed: frame <= confirmedFrame()
    const [p1In, p2In] = _mapInputs(localIn, remoteIn);
    _simFrame(pending.frame, p1In, p2In);
    resimulating = false;
    commitRoundEnd(gameState.pendingRoundEnd);
  }

  // Hard prediction barrier — the correctness leg. We must never simulate a frame so far
  // ahead of the last confirmed remote input that we could no longer roll back to it when
  // the real input arrives. Hitting this barrier means lockstep-waiting for the peer; it is
  // not subject to the smoothing cap. (The original netcode had no barrier — it advanced
  // unboundedly and then DISCARDED out-of-window inputs, which is the permanent desync.)
  function _hardBarrier() {
    return (localFrame - highestRemoteFrameReceived) >= (window - 1);
  }

  // Frame-advantage smoothing — eases the leading peer into the barrier so play stays fluid
  // instead of slamming into a hard stall. Pure heuristic; correctness does not depend on it.
  function _heuristicStall() {
    if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) return false;
    if (advantageSamples.length === 0) return false;
    const syncAdvantage = (mean(advantageSamples) - remoteReportedAdvantage) / 2;
    return syncAdvantage >= MIN_FRAME_ADVANTAGE;
  }

  function _shouldStall() {
    if (!timeSyncEnabled) return false;   // emulate the old sync-free behavior (teeth check)
    return _hardBarrier() || _heuristicStall();
  }

  function _maybeSnapshotRollbackRate() {
    if (localFrame - secStartFrame >= 60) {
      displayRollbacks = rollbacksThisSec;
      rollbacksThisSec = 0;
      secStartFrame = localFrame;
    }
  }

  // Advance the session one display frame. Returns what happened so the caller's loop can
  // honor a stall (skip rendering a new sim frame) without knowing the internals.
  function tick(localInput) {
    if (!active) return { advanced: false, stalled: false, committed: false };

    if (_shouldStall()) {
      consecutiveStalls++;
      return { advanced: false, stalled: true, committed: false };
    }
    consecutiveStalls = 0;

    _advance(localInput);
    _maybeSnapshotRollbackRate();

    const pending = gameState.pendingRoundEnd;
    if (pending && pending.frame != null && pending.frame <= highestRemoteFrameReceived) {
      _commit(pending);
      active = false;
      return { advanced: true, stalled: false, committed: true };
    }
    return { advanced: true, stalled: false, committed: false };
  }

  // A confirmed remote input arrived. `frame` is the remote peer's frame number; because the
  // two clocks share frame 0 and time-sync keeps them aligned, it indexes our timeline too.
  function onRemoteInput(frame, snap, remoteAdvantage, msgEpoch) {
    if (msgEpoch !== undefined && msgEpoch !== epoch) return;   // input belongs to another round
    if (typeof remoteAdvantage === 'number' && Number.isFinite(remoteAdvantage)) {
      remoteReportedAdvantage = remoteAdvantage;
    }
    if (frame <= highestRemoteFrameReceived) return;   // duplicate/old (ordered transport)
    highestRemoteFrameReceived = frame;
    predictionBaseline = { ...snap };

    if (frame >= localFrame) {
      // We are behind: this is a confirmed input for a frame we have not simulated yet.
      // Stash it and apply it directly when we reach that frame — no misprediction at all.
      futureConfirmed.set(frame, { ...snap });
      return;
    }

    const slot = frame % window;
    const used = remoteInputs[slot];
    remoteInputs[slot] = { ...snap };
    confirmed[slot] = true;
    if (!used || inputsDiffer(used, snap)) _resimulate(frame);
  }

  return {
    tick,
    onRemoteInput,
    epoch,
    isResimulating: () => resimulating,
    isActive:       () => active,
    localFrameNumber: () => localFrame,
    confirmedFrame:   () => highestRemoteFrameReceived,
    framesToStall:    () => (_shouldStall() ? 1 : 0),
    getRollbacksPerSecond: () => displayRollbacks,
  };
}

export {
  createRollbackSession,
  DEFAULT_ROLLBACK_WINDOW,
  MIN_FRAME_ADVANTAGE,
  TIME_SYNC_SAMPLE_WINDOW,
};
