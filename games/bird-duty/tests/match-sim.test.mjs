import {
  BIRD_DUTY_TICK_RATE,
  MATCH_SIM_PHASE,
  applyMatchSimInput,
  createMatchSimState,
  forfeitMatchSimTurn,
  matchSimActivePlayerId,
  serializeMatchSim,
  tickMatchSim,
} from "../scripts/sim/match-sim.js";
import { HOTSEAT_ROUNDS, HOTSEAT_SHOTS_PER_TURN } from "../scripts/sim/hotseat-session.js";
import { NPC_DEFINITIONS } from "../scripts/sim/npcs.js";
import { POOP_FALL_SPEED, POOP_LANDING_Y } from "../scripts/sim/poop.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "expected truthy");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${actual} to equal ${expected}`);
}

const PLAYERS = [
  { clientId: "c_aaa", name: "Ana" },
  { clientId: "c_bbb", name: "Ben" },
];

const NO_INPUT = { left: false, right: false, drop: false };
const DROP = { left: false, right: false, drop: true };

function makeMatch(players = PLAYERS) {
  return createMatchSimState({ players });
}

/** Run n ticks with one client's input held. */
function run(state, ticks, clientId, input = NO_INPUT) {
  let next = state;
  for (let i = 0; i < ticks; i += 1) {
    next = tickMatchSim(next, clientId ? { [clientId]: input } : {});
  }
  return next;
}

/** Burn a whole turn: press, wait for the poop to land, repeat past the magazine. */
function playOutTurn(state, clientId) {
  let next = state;
  for (let shot = 0; shot < HOTSEAT_SHOTS_PER_TURN + 1; shot += 1) {
    next = tickMatchSim(next, { [clientId]: DROP });
    next = run(next, 120, clientId, NO_INPUT);
  }
  return next;
}

test("a fresh match is waiting on the first player with a clean scoreboard", () => {
  const state = makeMatch();

  assertEqual(state.match.phase, MATCH_SIM_PHASE.READY);
  assertEqual(state.match.round, 1);
  assertEqual(matchSimActivePlayerId(state), "c_aaa");
  assertEqual(state.match.scores.c_aaa, 0);
  assertEqual(state.match.scores.c_bbb, 0);
  assertEqual(state.world.playSession.shotsRemaining, HOTSEAT_SHOTS_PER_TURN);
});

test("only the active player's drop can start a turn", () => {
  const idle = run(makeMatch(), 1, "c_bbb", DROP);
  assertEqual(idle.match.phase, MATCH_SIM_PHASE.READY, "an off-turn drop must not start play");

  const started = run(makeMatch(), 1, "c_aaa", DROP);
  assertEqual(started.match.phase, MATCH_SIM_PHASE.PLAYING);
});

test("an off-turn player cannot move the bird", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  const startX = state.world.player.x;
  state = tickMatchSim(state, { c_bbb: { left: false, right: true, drop: false } });

  assertEqual(state.world.player.x, startX, "the bird answers to the active seat only");
});

test("the active player's held direction moves the bird every tick", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  const startX = state.world.player.x;
  state = run(state, 4, "c_aaa", { left: false, right: true, drop: false });

  assert(state.world.player.x > startX, "held right must move the bird right");
  assertEqual(state.world.player.facing, "right");
});

test("a drop is edge triggered — holding it does not empty the magazine", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  const shotsAtStart = state.world.playSession.shotsRemaining;
  state = run(state, 20, "c_aaa", DROP);

  assertEqual(state.world.playSession.shotsRemaining, shotsAtStart, "one held press is one shot");
});

test("releasing and pressing again fires a second shot", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  const shotsAtStart = state.world.playSession.shotsRemaining;
  state = run(state, 120, "c_aaa", NO_INPUT);
  state = tickMatchSim(state, { c_aaa: DROP });

  assertEqual(state.world.playSession.shotsRemaining, shotsAtStart - 1);
});

test("a poop falls and splats on its own without any client saying so", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  state = tickMatchSim(state, { c_aaa: NO_INPUT });
  state = tickMatchSim(state, { c_aaa: DROP });
  assertEqual(state.world.poop.phase, "airborne");

  const ticksToLand = Math.ceil((POOP_LANDING_Y - state.world.poop.y) / POOP_FALL_SPEED) + 2;
  state = run(state, ticksToLand, "c_aaa", NO_INPUT);

  assertEqual(state.world.poop.phase, "splat");
});

test("the sim records the voice line of the NPC it actually hit", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  state = tickMatchSim(state, { c_aaa: NO_INPUT });
  state = tickMatchSim(state, { c_aaa: DROP });
  assertEqual(state.world.poop.phase, "airborne");

  // A lone sanjeet held under the falling poop. Pinned each tick because he walks at speed 9 and
  // would otherwise stroll out from under it before it lands — this test is about which line the
  // hit records, not about whether he can dodge.
  const pinSanjeetUnderPoop = (current) => ({
    ...current,
    world: {
      ...current.world,
      npcs: {
        ...current.world.npcs,
        wave: { queue: [], delayTicks: 0 },
        entities: [{
          id: 99,
          type: "sanjeet",
          x: current.world.poop.x,
          y: POOP_LANDING_Y,
          direction: 1,
          animationTick: 0,
          poseTicks: 0,
        }],
      },
    },
  });

  let sawSound = null;
  for (let i = 0; i < 120 && !sawSound; i += 1) {
    state = tickMatchSim(pinSanjeetUnderPoop(state), { c_aaa: NO_INPUT });
    sawSound = state.sounds.find((name) => name === NPC_DEFINITIONS.sanjeet.sound) || null;
  }

  assertEqual(sawSound, "sanjeet", "the hit must record sanjeet's own line, not a stand-in");
  assertEqual(state.sounds.includes("alan"), false, "and never a stand-in line");
});

test("sound events accumulate across ticks and are drained by serializing", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  state = tickMatchSim(state, { c_aaa: NO_INPUT });
  state = tickMatchSim(state, { c_aaa: DROP });
  assert(state.sounds.includes("poopRelease"), "the release must be recorded");

  const serialized = serializeMatchSim(state);
  assert(serialized.snapshot.sounds.includes("poopRelease"));
  assertEqual(serialized.drained.sounds.length, 0, "a drained state must not replay old sounds");
});

test("a spent turn hands the seat to the next player without ending the match", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  state = playOutTurn(state, "c_aaa");

  assertEqual(state.match.phase, MATCH_SIM_PHASE.TURN_OVER);
  assertEqual(matchSimActivePlayerId(state), "c_bbb");
  assertEqual(state.match.round, 1, "round only advances after the last seat");
  assertEqual(state.world.playSession.shotsRemaining, HOTSEAT_SHOTS_PER_TURN, "the next seat gets a full magazine");
});

test("the match ends after every seat has played every round", () => {
  let state = makeMatch();

  for (let seat = 0; seat < PLAYERS.length * HOTSEAT_ROUNDS; seat += 1) {
    const active = matchSimActivePlayerId(state);
    state = tickMatchSim(state, { [active]: DROP });
    state = playOutTurn(state, active);
  }

  assertEqual(state.match.phase, MATCH_SIM_PHASE.MATCH_OVER);
  assert(state.match.winnerClientId, "a finished match names a winner or a tie");
});

test("the sim is deterministic — same inputs, same world", () => {
  const script = [DROP, NO_INPUT, { left: false, right: true, drop: false }, NO_INPUT, DROP];
  const play = () => {
    let state = makeMatch();
    for (let i = 0; i < 200; i += 1) {
      state = tickMatchSim(state, { c_aaa: script[i % script.length] });
    }
    return JSON.stringify(serializeMatchSim(state).snapshot);
  };

  assertEqual(play(), play(), "two runs of one input log must produce one world");
});

test("buffered input drives the tick so a quiet client keeps its held keys", () => {
  let state = makeMatch();
  state = applyMatchSimInput(state, "c_aaa", DROP);
  state = tickMatchSim(state, state.inputs);

  assertEqual(state.match.phase, MATCH_SIM_PHASE.PLAYING, "buffered input drives the tick");
});

test("applyMatchSimInput narrows whatever a client sends to three booleans", () => {
  const state = applyMatchSimInput(makeMatch(), "c_aaa", {
    left: true,
    right: 1,
    drop: "yes please",
    score: 9999,
    x: -400,
  });
  const stored = state.inputs.c_aaa;

  assertEqual(stored.left, true);
  assertEqual(stored.right, true);
  assertEqual(stored.drop, false);
  assertEqual(Object.keys(stored).sort().join(","), "drop,left,right", "nothing else survives the narrowing");
});

test("input from a client who is not in the match is ignored", () => {
  const state = applyMatchSimInput(makeMatch(), "c_intruder", DROP);

  assertEqual(state.inputs.c_intruder, undefined);
});

test("a tick rate is published so a client can predict between snapshots", () => {
  assertEqual(BIRD_DUTY_TICK_RATE, 60);
  assertEqual(serializeMatchSim(makeMatch()).snapshot.tickRate, 60);
});

test("serialized snapshots name every player so a client can draw the scoreboard", () => {
  const { snapshot } = serializeMatchSim(makeMatch());

  assertEqual(snapshot.match.players.length, 2);
  assertEqual(snapshot.match.players[0].name, "Ana");
  assertEqual(snapshot.match.players[1].clientId, "c_bbb");
});

test("a turn can be forfeited mid-play so an abandoned seat cannot stall the match", () => {
  let state = run(makeMatch(), 1, "c_aaa", DROP);
  assertEqual(state.match.phase, MATCH_SIM_PHASE.PLAYING);
  assert(state.world.playSession.shotsRemaining > 0, "the seat still has shots in hand");

  state = forfeitMatchSimTurn(state, "c_aaa");

  assertEqual(state.match.phase, MATCH_SIM_PHASE.TURN_OVER);
  assertEqual(matchSimActivePlayerId(state), "c_bbb");
  assertEqual(state.world.playSession.shotsRemaining, HOTSEAT_SHOTS_PER_TURN, "the next seat is fresh");
});

test("a seat that never even started its turn can be forfeited", () => {
  const state = forfeitMatchSimTurn(makeMatch(), "c_aaa");

  assertEqual(state.match.phase, MATCH_SIM_PHASE.TURN_OVER);
  assertEqual(matchSimActivePlayerId(state), "c_bbb");
});

test("forfeiting is only ever the active seat's turn to lose", () => {
  const state = makeMatch();

  assertEqual(forfeitMatchSimTurn(state, "c_bbb"), state, "an off-turn seat forfeits nothing");
  assertEqual(forfeitMatchSimTurn(state, "c_nobody"), state, "a stranger forfeits nothing");
});

test("forfeiting the last seat of the last round ends the match properly", () => {
  let state = makeMatch();
  for (let seat = 0; seat < PLAYERS.length * HOTSEAT_ROUNDS; seat += 1) {
    state = forfeitMatchSimTurn(state, matchSimActivePlayerId(state));
  }

  assertEqual(state.match.phase, MATCH_SIM_PHASE.MATCH_OVER);
  assert(state.match.winnerClientId, "a forfeited match still names a result");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
