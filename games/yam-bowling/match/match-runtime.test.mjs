import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createSessionState, defaultShot } from "../state/session-state.mjs";
import { createShotHud, formatSpinReadout } from "../ui/shot-hud.mjs";
import { createScoreboard } from "../ui/scoreboard.mjs";
import { createPinDeck } from "../ui/pin-deck.mjs";
import { createResultsScreen } from "../ui/results-screen.mjs";
import { createMatchRuntime } from "./match-runtime.mjs";

const require = createRequire(import.meta.url);
const Core = require("../game-core.js");
const Physics = require("../physics-core.js");
const BallCore = require("../ball-core.js");
const Cpu = require("../cpu-core.js");
const AudioCore = require("../audio-core.js");
const Animation = require("../animation-core.js");
const Cosmetics = require("../cosmetics-core.js");
const Effects = require("../effects-core.js");

// A generic stand-in element: every DOM call the UI modules make resolves to a
// no-op that still records textContent, so the runtime can be driven headlessly.
// The point is to exercise the real modules wired to each other, not to assert
// on markup — the structure tests cover ownership, this covers behaviour.
function createStubElement() {
  const queried = new Map();
  const element = {
    style: { setProperty() {}, width: "", left: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    children: [],
    hidden: false,
    disabled: false,
    value: "",
    src: "",
    textContent: "",
    innerHTML: "",
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    appendChild(child) { element.children.push(child); },
    append() {},
    querySelector(selector) {
      if (!queried.has(selector)) queried.set(selector, createStubElement());
      return queried.get(selector);
    },
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => false,
    focus() {},
  };
  return element;
}

function installDomStub() {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, createStubElement());
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: get,
    querySelectorAll: () => [],
    createElement: () => createStubElement(),
    addEventListener() {},
    activeElement: null,
    hidden: false,
  };
  globalThis.window = { scrollTo() {}, addEventListener() {} };
  globalThis.Image = class { set src(value) { this._src = value; } };
  globalThis.HTMLElement = class {};
  return { get };
}

function createHarness({ physics = Physics } = {}) {
  const dom = installDomStub();
  const playedAudio = [];
  const audio = {
    play(cue) { playedAudio.push(cue); }, unlock() {}, resumeMusic() {}, pauseMusic() {}, toggle() {},
    enabled: true, unlocked: true,
  };
  const renderer = { shake: 0, setCharacter: async () => {}, setLane: async () => {} };
  const calloutPoseCues = [];
  const assets = {
    bowlerBySlug: (slug) => Animation.CANON_BOWLERS.find((b) => b.slug === slug) || Animation.CANON_BOWLERS[0],
    storedSkinId: () => Animation.DEFAULT_SKIN_ID,
    characterPortrait: () => "portrait.webp",
    resultPortrait: () => "result.webp",
    calloutPose: (_slug, cue) => { calloutPoseCues.push(cue); return "pose.webp"; },
  };

  let equippedTrailId = "ball-trail:red-neon";
  const effectPlayers = [];

  const session = createSessionState({
    physics: Physics,
    animation: Animation,
    effects: Effects,
    storedSkinId: assets.storedSkinId,
    localClientId: () => "local",
  });

  const shotHud = createShotHud({ session, balls: BallCore.BALLS, ballCore: BallCore });
  let resultsShown = 0;
  const resultsScreen = createResultsScreen({
    session, core: Core, assets, audio, audioCore: AudioCore,
    onShown: () => { resultsShown += 1; },
  });
  const scoreboard = createScoreboard({
    session, core: Core, laneCore: { getLane: () => ({ name: "Test Lane" }) },
    shotHud, pinDeck: createPinDeck({ session }), onCalloutHidden: () => resultsScreen.hideCalloutPose(),
  });
  const effectsConfig = (player) => {
    effectPlayers.push(player || null);
    return ({
    trailStyle: Effects.styleForItem(Cosmetics.getItem(equippedTrailId)),
    burstStyle: Effects.styleForItem(Cosmetics.getItem("strike-burst:ember")),
    reducedMotion: false,
    });
  };
  const matchRuntime = createMatchRuntime({
    session, core: Core, physics, cpu: Cpu, balls: BallCore.BALLS,
    audio, audioCore: AudioCore, effects: Effects, effectsConfig,
    renderer, assets, shotHud, scoreboard, resultsScreen,
    onlineClient: { submitShot() {}, getSnapshot: () => ({ clientId: "local" }) },
    applyMatchLane: (slug) => { session.matchLaneSlug = slug; },
    getLocalLaneSlug: () => "crimson-crown",
    physicsStep: 1 / 180,
  });

  return {
    session, matchRuntime, shotHud, dom, renderer,
    resultsShown: () => resultsShown,
    equipTrail: (itemId) => { equippedTrailId = itemId; },
    effectPlayers, playedAudio, calloutPoseCues,
  };
}

const keys = { strafeLeft: false, strafeRight: false, aimLeft: false, aimRight: false };
const advance = (matchRuntime, seconds) => {
  const step = 1 / 60;
  for (let i = 0; i < Math.round(seconds / step); i += 1) matchRuntime.tick(step, keys);
};

test('3D exhibition uses the shared controls, turn handoffs, results and rematch', async () => {
  const { create3dPhysics } = await import('../bowl3d/physics.mjs');
  const physical = { ...Physics, ...create3dPhysics(Physics) };
  const { session, matchRuntime, resultsShown } = createHarness({ physics: physical });
  session.setup.bowlingStyle = '3d';
  session.setup.playType = 'hotseat';
  matchRuntime.startMatch();
  assert.equal(session.match.bowlingStyle, '3d');
  assert.equal(session.match.modeId, 'quick');
  matchRuntime.startSpin();
  advance(matchRuntime, .2);
  matchRuntime.startCharge();
  advance(matchRuntime, .7);
  matchRuntime.releaseCharge();
  assert.equal(session.scene.phase, 'deck', '3D owns the entire physical roll');
  const elapsed = session.scene.simulation.elapsed;
  session.paused = true;
  advance(matchRuntime, 1);
  assert.equal(session.scene.simulation.elapsed, elapsed);
  session.paused = false;
  advance(matchRuntime, 10);
  assert.equal(session.matchFacts.rolls.length, 1);
  for (let i = 0; session.match.status !== 'complete' && i < 18; i++) {
    Object.assign(session.scene.liveShot, { position: .46, aim: .45, hook: 1 });
    matchRuntime.beginThrow(.8);
    advance(matchRuntime, 10);
  }
  assert.equal(session.match.status, 'complete');
  assert.equal(resultsShown(), 1);
  assert.ok(session.match.players.every(p => p.frames.every(f => f.length >= 1)));
  matchRuntime.startMatch();
  assert.equal(session.match.bowlingStyle, '3d');
  assert.equal(session.scene.simulation, null);
  assert.equal(session.match.players[0].score.total, 0);
});

test('sanctioned matches and lessons never inherit the exhibition 3D preference', () => {
  const { session, matchRuntime } = createHarness();
  session.setup.bowlingStyle = '3d';
  session.tutorialMatch = true;
  matchRuntime.startMatch();
  assert.equal(session.match.bowlingStyle, 'arcade');
  session.tutorialMatch = false;
  session.campaignMatch = { opponentSlug: 'nia-brooks', venueSlug: 'blue-circuit' };
  matchRuntime.startMatch();
  assert.equal(session.match.bowlingStyle, 'arcade');
});

test('online 3D replay duration is authoritative even if local physics settles early', () => {
  const physical = { ...Physics, fullLaneSimulation: true,
    createSimulation: pins => ({ pins, startStanding: pins.length, elapsed: 0, complete: true }),
    stepSimulation() {},
  };
  const { session, matchRuntime } = createHarness({ physics: physical });
  matchRuntime.startMatch();
  session.onlineMatch = true;
  session.match.bowlingStyle = '3d';
  const match = structuredClone(session.match);
  session.pendingAuthoritativeRoll = { snapshot: { match }, roll: {
    rollNumber: 1, knocked: 0, pinsAfter: Physics.createRack(), duration: 1,
  } };
  matchRuntime.beginThrow(.7);
  advance(matchRuntime, .5);
  assert.equal(session.scene.phase, 'deck');
  advance(matchRuntime, .55);
  assert.equal(session.scene.phase, 'transition');
});

test("a local match starts on the player's own lane with both bowlers racked", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();

  assert.equal(session.matchLaneSlug, "crimson-crown");
  assert.equal(session.onlineMatch, false);
  assert.equal(session.match.players.length, 2);
  assert.equal(session.scene.phase, "ready");
  assert.equal(session.scene.pins.filter((pin) => pin.standing).length, 10);
});

test("a local match replaces a stale unowned setup skin before creating players", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.skinIds[0] = "maid";

  matchRuntime.startMatch();

  assert.equal(session.match.players[0].skinId, "canon");
});

test("a human throw runs spin, charge, approach and deck through to a scored roll", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();

  matchRuntime.startSpin();
  assert.equal(session.scene.phase, "spin");

  advance(matchRuntime, 0.2);
  matchRuntime.startCharge();
  assert.equal(session.scene.phase, "charging");

  // Holding builds real power rather than releasing at the opening value.
  const openingPower = session.scene.chargeLevel;
  advance(matchRuntime, 0.9);
  assert.ok(session.scene.chargeLevel > openingPower,
    `charge should build while held (${openingPower} -> ${session.scene.chargeLevel})`);

  matchRuntime.releaseCharge();
  assert.equal(session.scene.phase, "approach");

  // Drive the ball down the lane, through the pin simulation, and out the far
  // side into the next roll.
  advance(matchRuntime, 12);

  const rolls = session.match.players[0].frames.flat();
  assert.ok(rolls.length >= 1, "the roll should have been recorded on the scorecard");
  assert.deepEqual(session.matchFacts.rolls[0], {
    playerId: "p1",
    frameIndex: 0,
    rollIndex: 0,
    pocketLine: session.matchFacts.rolls[0].pocketLine,
    standingPinIdsAfter: session.matchFacts.rolls[0].standingPinIdsAfter,
  });
  assert.equal(typeof session.matchFacts.rolls[0].pocketLine, "boolean",
    "achievement evidence records whether the opening delivery followed a pocket line");
  assert.equal(session.matchFacts.rolls[0].standingPinIdsAfter.length, 10 - rolls[0],
    "achievement evidence records the exact standing rack after the roll");
  assert.ok(["ready", "transition"].includes(session.scene.phase),
    `the deck should have settled, got phase ${session.scene.phase}`);
});

test("a CPU bowler takes its own turn once its delay elapses", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "cpu";
  matchRuntime.startMatch();
  // Hand the turn to the CPU seat directly rather than bowling a whole frame.
  session.match.activePlayer = 1;
  matchRuntime.prepareActivePlayer();
  assert.equal(session.activePlayer().type, "cpu");

  advance(matchRuntime, 1.2);
  assert.notEqual(session.scene.phase, "ready", "the CPU should have committed to a shot");
});

test("an active-bowler refresh can skip the turn banner and announcement", () => {
  const { session, matchRuntime, playedAudio } = createHarness();
  matchRuntime.startMatch();
  session.bannerTime = 0;
  playedAudio.length = 0;

  matchRuntime.prepareActivePlayer({ announce: false });

  assert.equal(session.bannerTime, 0);
  assert.deepEqual(playedAudio, []);
});

test("the shot cannot be adjusted while the ball is already away", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  assert.equal(session.canAdjustShot(), true);

  matchRuntime.startSpin();
  assert.equal(session.canAdjustShot(), false, "spin timing has already begun");

  session.scene.phase = "ready";
  session.paused = true;
  assert.equal(session.canAdjustShot(), false, "a paused match takes no input");
});

test("a human shot is final at release in local play just as it is online", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  matchRuntime.beginThrow(0.7);

  matchRuntime.tick(1 / 60, {
    strafeLeft: false,
    strafeRight: true,
    aimLeft: false,
    aimRight: false,
  });

  assert.equal(session.scene.shot.release, 0,
    "movement held after release must not create a local-only trajectory correction");
});

test("a new roll resets the previous trajectory but keeps the selected ball", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();

  Object.assign(session.scene.liveShot, {
    position: 0.42,
    aim: -0.45,
    hook: 0.91,
    power: 0.37,
    ballIndex: 2,
  });
  session.playerShots[0] = { ...session.scene.liveShot };

  matchRuntime.prepareNextRoll();

  const freshShot = defaultShot();
  assert.deepEqual(
    {
      position: session.scene.liveShot.position,
      aim: session.scene.liveShot.aim,
      hook: session.scene.liveShot.hook,
      power: session.scene.liveShot.power,
    },
    {
      position: freshShot.position,
      aim: freshShot.aim,
      hook: freshShot.hook,
      power: freshShot.power,
    },
  );
  assert.equal(session.scene.liveShot.ballIndex, 2);
});

test("a ball that reaches the gutter during its approach stays captured through deck physics", () => {
  const { session, matchRuntime } = createHarness();
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  Object.assign(session.scene.liveShot, {
    position: 0.46,
    aim: 0.45,
    hook: 1,
    ballIndex: 2,
  });
  matchRuntime.beginThrow(0.6, { release: 0.035 });

  for (let i = 0; i < 90 && !session.scene.gutterSide; i += 1) {
    matchRuntime.tick(1 / 60, keys);
  }

  assert.equal(session.scene.gutterSide, 1, "the approach should detect the right gutter edge");
  assert.equal(session.scene.phase, "approach", "capture should happen as soon as the ball touches the gutter");

  advance(matchRuntime, 0.2);
  assert.equal(session.scene.phase, "deck");
  assert.equal(session.scene.simulation.ball.gutterSide, 1, "deck physics must inherit the captured rail");
  assert.equal(session.scene.simulation.ball.x, Physics.GUTTER_CENTER_X);
});

test("spin timing names the hook direction and strength plainly", () => {
  assert.equal(formatSpinReadout(0.02), "Straight");
  assert.equal(formatSpinReadout(-0.76), "76% LEFT HOOK");
  assert.equal(formatSpinReadout(0.83), "83% RIGHT HOOK");
});

// --- Equipped visual effects -------------------------------------------------
//
// These drive a real roll rather than asserting on the emitter in isolation:
// what matters is that the effect follows the ball the tick loop is already
// moving, and that it changes nothing about the roll itself.

// A whole roll, from the rack to the settled deck, with a fixed shot so two
// runs are directly comparable.
function bowlOneRoll(harness, { power = 0.9 } = {}) {
  const { session, matchRuntime } = harness;
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  matchRuntime.startSpin();
  advance(matchRuntime, 0.2);
  matchRuntime.startCharge();
  advance(matchRuntime, power);
  matchRuntime.releaseCharge();
  advance(matchRuntime, 12);
  return harness;
}

test("an equipped ball trail follows the roll and clears once the deck settles", () => {
  const harness = createHarness();
  const { session, matchRuntime } = harness;
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  matchRuntime.startSpin();
  advance(matchRuntime, 0.2);
  matchRuntime.startCharge();
  advance(matchRuntime, 0.9);
  matchRuntime.releaseCharge();

  // Mid-approach: the ball is visibly rolling, so the trail is alive.
  advance(matchRuntime, 0.3);
  assert.equal(session.scene.phase, "approach");
  assert.ok(session.effects.trail.length > 0, "a rolling ball should be leaving a trail");

  advance(matchRuntime, 12);
  assert.equal(session.effects.trail.length, 0, "particles must not outlive the roll");
});

test("the no-trail default leaves nothing behind", () => {
  const harness = createHarness();
  harness.equipTrail("ball-trail:none");
  bowlOneRoll(harness);
  assert.equal(harness.session.effects.trail.length, 0);
});

test("an online replay resolves effects from the bowler who threw the shot", () => {
  const harness = createHarness();
  const { session, matchRuntime, effectPlayers } = harness;
  const remote = {
    id: "remote",
    characterSlug: "nia-brooks",
    skinId: "canon",
    presentation: { ballTrailId: "ball-trail:cyan-pulse", strikeBurstId: "strike-burst:cyan-flash" },
    frames: [[], [], []],
    score: { total: 0, cumulative: [null, null, null] },
    type: "human",
  };
  session.onlineMatch = true;
  session.match = {
    modeId: "quick", status: "playing", frameIndex: 0, activePlayer: 1,
    players: [{ ...remote, id: "local" }, remote], winnerIds: [],
  };
  session.playerShots = [defaultShot(), defaultShot()];
  matchRuntime.beginThrow(0.7, { release: 0 });
  matchRuntime.tick(1 / 60, keys);

  assert.equal(effectPlayers.at(-1), remote);
});

// A shot that really clears the rack through the shipped physics, found by
// sweeping the shot space. It is asserted to strike below, so if physics ever
// changes under it the test fails loudly instead of quietly testing nothing.
const STRIKING_SHOT = Object.freeze({ position: -0.3, aim: 0.12, hook: 0.6, power: 0.7 });

// Stops as soon as the roll is scored rather than running the clock out: a
// burst is short-lived by design, so advancing past it would leave nothing to
// look at and quietly turn the assertion below into a no-op.
function bowlStrike(harness) {
  const { session, matchRuntime } = harness;
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  Object.assign(session.scene.liveShot, STRIKING_SHOT);
  matchRuntime.beginThrow(STRIKING_SHOT.power, { release: 0 });

  const step = 1 / 60;
  for (let i = 0; i < 12 * 60; i += 1) {
    matchRuntime.tick(step, keys);
    if ((session.match.players[0].frames[0] ?? []).length > 0) break;
  }
  return session.match.players[0].frames[0] ?? [];
}

test("a strike fires the equipped burst exactly once for that roll", () => {
  const harness = createHarness();
  const { session } = harness;

  assert.deepEqual(bowlStrike(harness), [10], "the probe shot should still strike");
  assert.notEqual(session.effects.lastBurstKey, "", "a strike should have fired the burst");
  assert.ok(session.effects.burst.length > 0);

  const key = session.effects.lastBurstKey;
  const count = session.effects.burst.length;

  // Re-running the same roll's trigger -- a replayed online snapshot, or a
  // resumed match rebuilding the scene -- must be inert.
  assert.equal(
    Effects.triggerBurst(session.effects, {
      x: 0, z: 0.9, key, style: Effects.styleForItem(Cosmetics.getItem("strike-burst:ember")),
    }),
    false,
  );
  assert.equal(session.effects.burst.length, count);
});

test("a circuit final-frame bonus strike gets the full strike presentation", () => {
  const harness = createHarness();
  const { session, matchRuntime, playedAudio, calloutPoseCues, dom } = harness;
  session.campaignMatch = {
    opponentSlug: "nia-brooks",
    venueSlug: "oak-and-onyx",
  };
  session.setup.modeId = "quick";
  matchRuntime.startMatch();

  session.match.frameIndex = 2;
  session.match.activePlayer = 0;
  session.match.players[0].frames = [[0, 0], [0, 0], [10]];
  session.scene.pins = Physics.createRack();
  playedAudio.length = 0;
  calloutPoseCues.length = 0;
  Object.assign(session.scene.liveShot, STRIKING_SHOT);
  matchRuntime.beginThrow(STRIKING_SHOT.power, { release: 0 });

  const step = 1 / 60;
  for (let i = 0; i < 12 * 60; i += 1) {
    matchRuntime.tick(step, keys);
    if (session.match.players[0].frames[2].length > 1) break;
  }

  assert.deepEqual(session.match.players[0].frames[2], [10, 10], "the probe bonus ball should strike");
  assert.equal(dom.get("callout").querySelector("strong").textContent, "Strike!");
  assert.equal(dom.get("callout").querySelector("span").textContent, "Clean pocket hit");
  assert.equal(playedAudio.at(-1), "strike");
  assert.equal(calloutPoseCues.at(-1), "strike");
  assert.notEqual(session.effects.lastBurstKey, "", "the strike presentation includes its burst");
});

test("a roll that leaves pins standing fires no burst at all", () => {
  const harness = createHarness();
  const { session, matchRuntime } = harness;
  session.setup.playType = "hotseat";
  matchRuntime.startMatch();
  Object.assign(session.scene.liveShot, { position: 0.24, aim: 0.12, hook: 0, power: 0.7 });
  matchRuntime.beginThrow(0.7, { release: 0 });
  advance(matchRuntime, 12);

  const firstFrame = session.match.players[0].frames[0] ?? [];
  assert.notEqual(firstFrame[0], 10, "this shot is meant to leave the rack open");
  assert.equal(session.effects.lastBurstKey, "", "only a strike earns the burst");
  assert.equal(session.effects.burst.length, 0);
});

test("a scene reset clears live particles but never re-arms a fired burst", () => {
  const harness = createHarness();
  const { session } = harness;
  bowlStrike(harness);
  const firedKey = session.effects.lastBurstKey;
  assert.notEqual(firedKey, "");

  // What a resumed online match does: rebuild the deck under the same roll.
  session.resetScene(session.scene.pins);
  assert.equal(session.effects.burst.length, 0);
  assert.equal(session.effects.trail.length, 0);
  assert.equal(session.effects.lastBurstKey, firedKey, "the fired roll must stay remembered");
});

test("equipped effects change nothing about the roll they decorate", () => {
  // The same shot, bowled twice: once with a trail equipped and once without.
  // Physics, scoring and pin state must be identical -- effects are paint.
  const withTrail = createHarness();
  withTrail.equipTrail("ball-trail:red-neon");
  bowlOneRoll(withTrail);

  const withoutTrail = createHarness();
  withoutTrail.equipTrail("ball-trail:none");
  bowlOneRoll(withoutTrail);

  const pinState = (harness) => harness.session.scene.pins
    .map((pin) => [pin.standing !== false, Math.round(pin.x * 1e6), Math.round(pin.y * 1e6)]);

  assert.deepEqual(
    withTrail.session.match.players[0].frames,
    withoutTrail.session.match.players[0].frames,
    "the scorecard must not depend on an equipped cosmetic",
  );
  assert.deepEqual(pinState(withTrail), pinState(withoutTrail), "the deck must land identically");
  assert.equal(withTrail.session.scene.phase, withoutTrail.session.scene.phase);
});

// The pause card names the match it belongs to, and both the local start and the
// online one reset it through this seam. When only the local path wrote it, an
// ended lesson left "End lesson" sitting on the quit button of an online room.
test("the pause card is derived from the match that is actually running", () => {
  const { session, matchRuntime, dom } = createHarness();
  const quit = dom.get("quit-match-button");
  const restart = dom.get("restart-match-button");

  session.tutorialMatch = true;
  matchRuntime.startMatch();
  assert.equal(quit.textContent, "End lesson");
  assert.equal(restart.hidden, true);

  // The lesson is over and an online match takes the lane.
  session.tutorialMatch = false;
  session.onlineMatch = true;
  matchRuntime.syncPauseChrome();
  assert.equal(quit.textContent, "Leave match");
  assert.equal(restart.hidden, true);

  session.onlineMatch = false;
  matchRuntime.startMatch();
  assert.equal(quit.textContent, "Quit to setup");
  assert.equal(restart.hidden, false);
});
