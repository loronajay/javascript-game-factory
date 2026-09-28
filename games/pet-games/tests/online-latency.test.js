// Online Pet Games under a bad connection, headless.
//
// The REAL server engines (factory-network-server, sibling repo) and the REAL
// client sessions, joined by a simulated network: one-way latency with jitter
// on both legs, inputs batched every two ticks, snapshots every three. Two
// people race (or brawl) and this measures what a player would feel — how far
// a snapshot has to correct the predicted pet — and that the match finishes
// with the same answer on both screens. Skipped if the server repo is absent.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const serverDir = resolve(import.meta.dirname, "..", "..", "..", "..", "factory-network-server", "games", "pet-games", "server");
const haveServer = existsSync(serverDir);
const serverModule = (name) => import(pathToFileURL(resolve(serverDir, name)).href);

const TICK_MS = 1000 / 60;

/** A network leg: messages arrive after latency ± jitter, in order (one TCP stream). */
function createLeg(latencyMs, jitterMs, random) {
  const queue = [];
  let lastArrival = 0;
  return {
    send(at, payload) {
      const arrival = Math.max(lastArrival, at + latencyMs + (random() * 2 - 1) * jitterMs);
      lastArrival = arrival;
      queue.push({ arrival, payload });
    },
    receive(at) {
      const due = [];
      while (queue.length && queue[0].arrival <= at) due.push(queue.shift().payload);
      return due;
    },
  };
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const PET = { speciesId: "pet.corgi", name: "Biscuit", paletteId: "standard", stats: { speed: 60, strength: 60, size: 1 } };

function percentile(values, share) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;
}

test("Barnyard Dash: two players at 80 ms RTT with jitter predict smoothly and agree on the finish", { skip: !haveServer && "factory-network-server not beside this repo" }, async (t) => {
  const engine = await serverModule("barnyard-dash-match-engine.mjs");
  const { sanitizeLobbySettings } = await import(pathToFileURL(resolve(serverDir, "..", "..", "..", "src", "util.mjs")).href);
  const { createOnlineRace } = await import("../../barnyard-dash/scripts/online-race.js");
  const { cpuControls } = await import("../../barnyard-dash/scripts/sim/cpu.js");

  const lobby = {
    roomCode: "LATCY",
    seed: "latency-seed",
    members: new Set(["c_a", "c_b"]),
    memberProfiles: new Map([["c_a", { displayName: "A", playerId: "pa" }], ["c_b", { displayName: "B", playerId: "pb" }]]),
    petProfiles: new Map([["c_a", PET], ["c_b", { ...PET, speciesId: "pet.duck", name: "Quackers" }]]),
    settings: sanitizeLobbySettings({ mapId: "barnyard-loop" }),
  };
  const START = 10_000;
  const match = engine.createBarnyardMatch(lobby, START);
  const random = seeded(42);
  let clock = 0;
  const clients = ["c_a", "c_b"].map((clientId) => ({
    clientId,
    up: createLeg(40, 15, random),
    down: createLeg(40, 15, random),
    session: null,
    corrections: [],
  }));
  const started = engine.serializeBarnyardMatch(match, START);
  for (const client of clients) client.session = createOnlineRace({ match: started, clientId: client.clientId, now: () => clock });

  let serverTick = 0;
  let ended = null;
  for (let step = 0; step < 60 * 150 && !ended; step += 1) {
    clock = START + step * TICK_MS;
    // Each person drives with the CPU's own hands, from what they see (their prediction).
    for (const client of clients) {
      for (const payload of client.down.receive(clock)) {
        const before = client.session.me && { ...client.session.me };
        client.session.applySnapshot(payload);
        const after = client.session.me;
        if (before && after && payload.race.status === "racing") client.corrections.push(Math.hypot(before.x - after.x, before.y - after.y));
      }
      const me = client.session.me;
      const controls = me && client.session.race.status === "racing"
        ? cpuControls(me, client.session.race.track, client.session.race.brokenObstacles, { level: "champion", tick: step, seed: client.clientId })
        : {};
      const batch = client.session.tick(controls);
      if (batch) client.up.send(clock, batch);
    }
    // The server: inputs that have arrived, then the tick, then a snapshot every three ticks.
    for (const client of clients) for (const batch of client.up.receive(clock)) engine.applyBarnyardInput(match, client.clientId, batch);
    const done = engine.advanceBarnyardMatch(match, clock + TICK_MS);
    serverTick += 1;
    if (serverTick % 3 === 0 || done) {
      const snapshot = engine.serializeBarnyardMatch(match, clock);
      for (const client of clients) client.down.send(clock, snapshot);
      if (done) ended = snapshot;
    }
  }

  assert.ok(ended, "the race finished");
  assert.equal(ended.results.filter((row) => row.human && Number.isFinite(row.finishedAt)).length, 2, "both people crossed the line");
  for (const client of clients) {
    const p50 = percentile(client.corrections, 0.5);
    const p95 = percentile(client.corrections, 0.95);
    t.diagnostic(`${client.clientId}: ${client.corrections.length} snapshots, correction p50 ${p50.toFixed(2)} p95 ${p95.toFixed(2)} max ${Math.max(...client.corrections).toFixed(1)}`);
    assert.ok(client.corrections.length > 300, "enough snapshots were measured to mean something");
    // A correction of a few units is invisible (a pet is ~24 wide); anything big would be a visible snap.
    assert.ok(p50 < 2, `${client.clientId} median correction ${p50.toFixed(2)}`);
    assert.ok(p95 < 25, `${client.clientId} 95th percentile correction ${p95.toFixed(2)}`);
  }
});

test("Pondside Push: two players at 80 ms RTT with jitter predict their own pet and the match completes", { skip: !haveServer && "factory-network-server not beside this repo" }, async (t) => {
  const engine = await serverModule("pondside-push-match-engine.mjs");
  const { sanitizeLobbySettings } = await import(pathToFileURL(resolve(serverDir, "..", "..", "..", "src", "util.mjs")).href);
  const { createOnlineBrawl } = await import("../../pondside-push/scripts/online-brawl.js");
  const { cpuControls } = await import("../../pondside-push/scripts/sim/cpu.js");

  const lobby = {
    roomCode: "PONDL",
    seed: "pond-latency",
    members: new Set(["c_a", "c_b"]),
    memberProfiles: new Map([["c_a", { displayName: "A", playerId: "pa" }], ["c_b", { displayName: "B", playerId: "pb" }]]),
    petProfiles: new Map([["c_a", PET], ["c_b", { ...PET, name: "Other" }]]),
    settings: sanitizeLobbySettings({}),
  };
  const START = 10_000;
  const match = engine.createPondsideMatch(lobby, START);
  const random = seeded(7);
  let clock = 0;
  const clients = ["c_a", "c_b"].map((clientId) => ({ clientId, up: createLeg(40, 15, random), down: createLeg(40, 15, random), session: null, corrections: [], memory: {} }));
  const started = engine.serializePondsideMatch(match, START);
  for (const client of clients) client.session = createOnlineBrawl({ match: started, clientId: client.clientId, now: () => clock });

  let ended = null;
  let serverTick = 0;
  for (let step = 0; step < 60 * 60 * 6 && !ended; step += 1) {
    clock = START + step * TICK_MS;
    for (const client of clients) {
      for (const payload of client.down.receive(clock)) {
        const before = client.session.me && { ...client.session.me };
        client.session.applySnapshot(payload);
        const after = client.session.me;
        if (before && after && payload.session.phase === "playing" && !after.eliminated) client.corrections.push(Math.hypot(before.x - after.x, before.y - after.y));
      }
      const view = client.session.session;
      const me = client.session.me;
      const controls = me && view.phase === "playing" && !me.eliminated
        ? cpuControls(me, view.match.players, view.match.tick, { level: "pro", seed: client.clientId, islandRadius: view.match.islandRadius, roundSeconds: view.match.roundTicks / 60, memory: client.memory })
        : {};
      const batch = client.session.tick(controls);
      if (batch) client.up.send(clock, batch);
    }
    for (const client of clients) for (const batch of client.up.receive(clock)) engine.applyPondsideInput(match, client.clientId, batch);
    const done = engine.advancePondsideMatch(match, clock + TICK_MS);
    serverTick += 1;
    if (serverTick % 3 === 0 || done) {
      const snapshot = engine.serializePondsideMatch(match, clock);
      for (const client of clients) client.down.send(clock, snapshot);
      if (done) ended = snapshot;
    }
  }

  assert.ok(ended, "the match finished");
  assert.equal(ended.results[0].wins, 3);
  for (const client of clients) {
    // Brawling pets touch constantly, and contact is the server's call, so corrections are larger than a race's.
    const p50 = percentile(client.corrections, 0.5);
    t.diagnostic(`${client.clientId}: ${client.corrections.length} snapshots, correction p50 ${p50.toFixed(2)} p95 ${percentile(client.corrections, 0.95).toFixed(2)}`);
    assert.ok(client.corrections.length > 300, "enough snapshots were measured to mean something");
    assert.ok(p50 < 4, `${client.clientId} median correction ${p50.toFixed(2)}`);
  }
});
