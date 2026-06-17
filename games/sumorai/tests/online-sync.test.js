// online-sync.test.js — two-client rollback sync harness.
//
// This is the test that was missing. It drives TWO createRollbackSession instances against
// each other through a fake relay that injects latency, jitter, and frame hitches — the
// exact conditions that broke the live match and that a single-machine playtest can never
// reproduce. It asserts the two clients stay in sync and commit identical round outcomes.
//
// A deliberately simple deterministic sim is used (positions + a one-hit kill) so any
// divergence is a fault in the session/time-sync logic, not in the heavy game sim.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_INPUT, inputsDiffer } from '../scripts/online-match-view.js';
import { createRollbackSession } from '../scripts/rollback-session.js';

// ----- deterministic test sim -----------------------------------------------------------
// gameState: two fighters on a line; pressing `attack` within range one-hit-kills the other.

function createTestSim() {
  const gameState = { p1: { x: -5, dead: false }, p2: { x: 5, dead: false }, pendingRoundEnd: null };

  function tickSim(p1In, p2In) {
    const gs = gameState;
    if (!gs.p1.dead) gs.p1.x += (p1In.right ? 1 : 0) - (p1In.left ? 1 : 0);
    if (!gs.p2.dead) gs.p2.x += (p2In.right ? 1 : 0) - (p2In.left ? 1 : 0);
    if (gs.pendingRoundEnd) return;   // first kill is final for the round
    const inRange = Math.abs(gs.p1.x - gs.p2.x) <= 1;
    if (p1In.attack && inRange && !gs.p2.dead) {
      gs.p2.dead = true;
      gs.pendingRoundEnd = { winner: 'p1', isBlastKill: false, frame: null };
    } else if (p2In.attack && inRange && !gs.p1.dead) {
      gs.p1.dead = true;
      gs.pendingRoundEnd = { winner: 'p2', isBlastKill: false, frame: null };
    }
  }

  const saveState = () => structuredClone(gameState);
  const loadState = (snap) => {
    gameState.p1 = structuredClone(snap.p1);
    gameState.p2 = structuredClone(snap.p2);
    gameState.pendingRoundEnd = snap.pendingRoundEnd ? structuredClone(snap.pendingRoundEnd) : null;
  };

  return { gameState, tickSim, saveState, loadState };
}

function makeInput({ left = false, right = false, attack = false } = {}) {
  return { ...EMPTY_INPUT, left, right, attack };
}

// Ground truth: simulate the agreed input streams with no network at all, and record the
// first-kill frame, winner, and the exact post-kill state. Both networked clients must match.
function groundTruth(p1Script, p2Script, maxFrames) {
  const { gameState, tickSim } = createTestSim();
  for (let f = 0; f < maxFrames; f++) {
    tickSim(p1Script[f] ?? EMPTY_INPUT, p2Script[f] ?? EMPTY_INPUT);
    if (gameState.pendingRoundEnd) {
      return {
        frame: f,
        winner: gameState.pendingRoundEnd.winner,
        state: { p1: { ...gameState.p1 }, p2: { ...gameState.p2 } },
      };
    }
  }
  return null;
}

// ----- harness --------------------------------------------------------------------------

function buildClient(localSide, p1Script, p2Script, { window, timeSync }) {
  const sim = createTestSim();
  const outbox = [];   // { frame, input, adv } captured from send()
  let committed = null;

  const session = createRollbackSession({
    localSide,
    gameState: sim.gameState,
    tickSim: sim.tickSim,
    saveState: sim.saveState,
    loadState: sim.loadState,
    inputsDiffer,
    emptyInput: EMPTY_INPUT,
    rollbackWindow: window,
    timeSyncEnabled: timeSync,
    send: (frame, input, adv) => outbox.push({ frame, input: { ...input }, adv }),
    commitRoundEnd: (pending) => {
      committed = {
        frame: pending.frame,
        winner: pending.winner,
        state: { p1: { ...sim.gameState.p1 }, p2: { ...sim.gameState.p2 } },
      };
      sim.gameState.pendingRoundEnd = null;
    },
  });

  const localScript = localSide === 'p1' ? p1Script : p2Script;
  const localInputAt = (frame) => localScript[frame] ?? EMPTY_INPUT;

  return { session, sim, outbox, localInputAt, getCommitted: () => committed };
}

// Drive a full match. latency/jitter are in global driver ticks. `hitch` makes one client
// skip ticking for a window, simulating a frame stall / GC pause / alt-tab.
function runMatch({ p1Script, p2Script, latency = 4, jitter = 0, hitch = null, window = 60, timeSync = true, maxTicks = 4000 }) {
  const a = buildClient('p1', p1Script, p2Script, { window, timeSync });
  const b = buildClient('p2', p1Script, p2Script, { window, timeSync });

  // in-flight messages: { to, deliverAt, frame, input, adv }
  const wire = [];
  const lastDeliverAt = { a: -1, b: -1 };   // keep per-receiver delivery in order (TCP semantics)
  let rng = 1234567;
  const nextJitter = () => {
    if (jitter <= 0) return 0;
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng % (jitter + 1);
  };

  const drain = (client, peerLabel, t) => {
    while (client.outbox.length) {
      const msg = client.outbox.shift();
      // TCP never reorders: jitter varies latency but delivery stays in send order.
      const deliverAt = Math.max(t + latency + nextJitter(), lastDeliverAt[peerLabel] + 1);
      lastDeliverAt[peerLabel] = deliverAt;
      wire.push({ to: peerLabel, deliverAt, ...msg });
    }
  };

  const isHitched = (label, t) => hitch && hitch.who === label && t >= hitch.start && t < hitch.start + hitch.frames;

  for (let t = 0; t < maxTicks; t++) {
    // deliver due messages
    for (let i = wire.length - 1; i >= 0; i--) {
      if (wire[i].deliverAt <= t) {
        const m = wire[i];
        const target = m.to === 'a' ? a : b;
        target.session.onRemoteInput(m.frame, m.input, m.adv);
        wire.splice(i, 1);
      }
    }

    if (a.session.isActive() && !isHitched('a', t)) {
      a.session.tick(a.localInputAt(a.session.localFrameNumber()));
      drain(a, 'b', t);
    }
    if (b.session.isActive() && !isHitched('b', t)) {
      b.session.tick(b.localInputAt(b.session.localFrameNumber()));
      drain(b, 'a', t);
    }

    if (a.getCommitted() && b.getCommitted() && wire.length === 0) break;
  }

  return {
    a: a.getCommitted(),
    b: b.getCommitted(),
    aFrame: a.session.localFrameNumber(),
    bFrame: b.session.localFrameNumber(),
    aConfirmed: a.session.confirmedFrame(),
    bConfirmed: b.session.confirmedFrame(),
  };
}

function bothAgreeWithTruth(result, truth) {
  if (!result.a || !result.b || !truth) return false;
  return result.a.frame === result.b.frame
    && result.a.frame === truth.frame
    && result.a.winner === result.b.winner
    && result.a.winner === truth.winner
    && JSON.stringify(result.a.state) === JSON.stringify(result.b.state)
    && JSON.stringify(result.a.state) === JSON.stringify(truth.state);
}

// Scripts: p1 walks right toward p2 and attacks once they meet. p2 holds, occasionally
// jitters its movement so prediction is non-trivial (forces mispredictions + rollbacks).
function buildScripts(maxFrames) {
  const p1 = [];
  const p2 = [];
  for (let f = 0; f < maxFrames; f++) {
    // p1 walks right to meet p2 (10 steps: -5 -> +5), then attacks from frame 11.
    p1.push(makeInput({ right: f < 10, attack: f >= 11 }));
    // p2 alternates right/left every frame — its input changes constantly, so "repeat last
    // input" prediction mispredicts often and forces rollbacks. Position stays in {5,6}.
    p2.push(makeInput({ right: f % 2 === 0, left: f % 2 === 1 }));
  }
  // Expected: at frame 11 p1.x == p2.x == 5, p1 attacks in range -> p1 wins at frame 11.
  return { p1Script: p1, p2Script: p2 };
}

// ----- tests ----------------------------------------------------------------------------

test('clients stay in sync and commit identical outcomes across a latency sweep', () => {
  const maxFrames = 200;
  const { p1Script, p2Script } = buildScripts(maxFrames);
  const truth = groundTruth(p1Script, p2Script, maxFrames);
  assert.ok(truth, 'scripted match should produce a kill');

  for (const latency of [2, 4, 6, 12]) {
    const result = runMatch({ p1Script, p2Script, latency, window: 60, timeSync: true });
    assert.ok(
      bothAgreeWithTruth(result, truth),
      `latency ${latency}: clients diverged — A=${JSON.stringify(result.a)} B=${JSON.stringify(result.b)} truth=${JSON.stringify(truth)}`,
    );
  }
});

test('clients stay in sync under jittered delivery', () => {
  const maxFrames = 200;
  const { p1Script, p2Script } = buildScripts(maxFrames);
  const truth = groundTruth(p1Script, p2Script, maxFrames);

  const result = runMatch({ p1Script, p2Script, latency: 5, jitter: 4, window: 60, timeSync: true });
  assert.ok(bothAgreeWithTruth(result, truth),
    `jitter run diverged — A=${JSON.stringify(result.a)} B=${JSON.stringify(result.b)}`);
});

test('time-sync keeps a one-sided frame hitch within the rollback window', () => {
  const maxFrames = 220;
  const { p1Script, p2Script } = buildScripts(maxFrames);
  const truth = groundTruth(p1Script, p2Script, maxFrames);

  // small window + a hitch longer than the window: only time-sync stalling can keep the
  // peers close enough to avoid dropping confirmed inputs.
  const result = runMatch({
    p1Script, p2Script, latency: 3, window: 8, timeSync: true,
    hitch: { who: 'b', start: 6, frames: 20 },
  });
  assert.ok(bothAgreeWithTruth(result, truth),
    `hitch run diverged with time-sync ON — A=${JSON.stringify(result.a)} B=${JSON.stringify(result.b)} truth=${JSON.stringify(truth)}`);
});

test('TEETH CHECK: same hitch WITHOUT time-sync desyncs (proves the test has bite)', () => {
  const maxFrames = 220;
  const { p1Script, p2Script } = buildScripts(maxFrames);
  const truth = groundTruth(p1Script, p2Script, maxFrames);

  const result = runMatch({
    p1Script, p2Script, latency: 3, window: 8, timeSync: false,
    hitch: { who: 'b', start: 6, frames: 20 },
  });
  // With no stalling, the hitch pushes drift past the 8-frame window, confirmed inputs get
  // dropped, and the clients can no longer agree. If this ever PASSES agreement, the sync
  // test above is not actually exercising what we think it is.
  assert.ok(!bothAgreeWithTruth(result, truth),
    'expected desync without time-sync, but clients agreed — the hitch was not severe enough to exercise the fix');
});

test('fuzz: randomized inputs, latency, jitter, and hitches never desync', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let rng = seed * 2654435761 >>> 0;
    const rand = (n) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };

    const maxFrames = 160;
    // both players move randomly and may attack; whoever lands an in-range hit first wins
    const p1 = [];
    const p2 = [];
    for (let f = 0; f < maxFrames; f++) {
      p1.push(makeInput({ left: rand(3) === 0, right: rand(3) === 0, attack: f > 6 && rand(4) === 0 }));
      p2.push(makeInput({ left: rand(3) === 0, right: rand(3) === 0, attack: f > 6 && rand(4) === 0 }));
    }
    const truth = groundTruth(p1, p2, maxFrames);

    const latency = 2 + rand(10);
    const jitter = rand(5);
    const hitch = rand(2) === 0
      ? { who: rand(2) === 0 ? 'a' : 'b', start: 5 + rand(20), frames: 5 + rand(25) }
      : null;

    const result = runMatch({ p1Script: p1, p2Script: p2, latency, jitter, hitch, window: 60, timeSync: true });

    if (truth) {
      assert.ok(bothAgreeWithTruth(result, truth),
        `seed ${seed} (lat=${latency} jit=${jitter} hitch=${JSON.stringify(hitch)}): diverged — A=${JSON.stringify(result.a)} B=${JSON.stringify(result.b)} truth=${JSON.stringify(truth)}`);
    } else {
      // no kill in ground truth: neither client should have committed, and both stay close
      assert.equal(result.a, null, `seed ${seed}: A committed a phantom round end`);
      assert.equal(result.b, null, `seed ${seed}: B committed a phantom round end`);
    }
  }
});

test('time-sync prevents unbounded clock drift in steady state', () => {
  const maxFrames = 400;
  // no attacks: a long peaceful match that should never end, used to measure drift
  const p1Script = Array.from({ length: maxFrames }, (_, f) => makeInput({ right: f % 3 === 0 }));
  const p2Script = Array.from({ length: maxFrames }, (_, f) => makeInput({ left: f % 4 === 0 }));

  const result = runMatch({ p1Script, p2Script, latency: 6, jitter: 3, window: 60, timeSync: true, maxTicks: 300 });

  // neither committed (no kill); both advanced; their frame counters stayed close together
  assert.equal(result.a, null);
  assert.equal(result.b, null);
  assert.ok(result.aFrame > 100 && result.bFrame > 100, 'both clients should have made progress');
  assert.ok(Math.abs(result.aFrame - result.bFrame) <= 12,
    `frame drift grew too large: A=${result.aFrame} B=${result.bFrame}`);
});
