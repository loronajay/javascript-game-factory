// The Temple Trial: four Monks, one real. Match prep marks the real Monk and
// shuffles the decoys into the far corner off the authoritative RNG; the intro
// dialogue beats then reveal/split them presentationally. Extracted from
// campaignMatch.js (the layout table calls prepareMonkTrial).

import { nextRandom } from "../../../core/rng.js";

const MONK_TRIAL_POSITIONS = Object.freeze([
  Object.freeze({ x: 7, y: 0 }),
  Object.freeze({ x: 8, y: 1 }),
  Object.freeze({ x: 8, y: 0 }),
  Object.freeze({ x: 7, y: 1 }),
]);
const MONK_TRIAL_CENTER_POSITION = Object.freeze({ x: 4, y: 4 });
const MONK_TRIAL_ALERT_POSITION = Object.freeze({ x: 8, y: 0 });
const MONK_TRIAL_FAKE_ART_SETS = Object.freeze([
  Object.freeze({ "front-kick": "Lotus Uppercut", protect: "Mirror Palm" }),
  Object.freeze({ "front-kick": "Temple Sweep", protect: "Still Water Guard" }),
  Object.freeze({ "front-kick": "Cloudbreaker Kick", protect: "Incense Veil" }),
]);

function shuffledMonkTrialPositions(rngState) {
  let state = rngState;
  const positions = MONK_TRIAL_POSITIONS.map((position) => ({ ...position }));
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const roll = nextRandom(state);
    state = roll.state;
    const swap = Math.floor(roll.value * (index + 1));
    [positions[index], positions[swap]] = [positions[swap], positions[index]];
  }
  return { positions, rngState: state };
}

export function prepareMonkTrial(match, units) {
  const monks = units.filter((unit) => unit.player === 2 && unit.type === "monk");
  if (monks.length !== 4) return { units, rngState: match.rngState, missionRules: null };
  const realRoll = nextRandom(match.rngState);
  const realIndex = Math.min(monks.length - 1, Math.floor(realRoll.value * monks.length));
  const shuffled = shuffledMonkTrialPositions(realRoll.state);
  const realMonkId = monks[realIndex].id;
  let fakeIndex = 0;
  const positionByMonkId = new Map(monks.map((unit, index) => [unit.id, shuffled.positions[index]]));
  const finalPositions = Object.fromEntries(monks.map((unit) => {
    const position = positionByMonkId.get(unit.id) ?? unit.position;
    return [unit.id, { x: position.x, y: position.y }];
  }));
  const prepared = units.map((unit) => {
    if (unit.player === 1) return { ...unit, introHidden: true };
    if (unit.player !== 2 || unit.type !== "monk") return unit;
    const real = unit.id === realMonkId;
    const fakeArtNames = real ? null : MONK_TRIAL_FAKE_ART_SETS[fakeIndex++ % MONK_TRIAL_FAKE_ART_SETS.length];
    return {
      ...unit,
      position: real ? { ...MONK_TRIAL_CENTER_POSITION } : (positionByMonkId.get(unit.id) ?? unit.position),
      introHidden: !real,
      trialIntroAlert: false,
      trialRealMonk: real,
      trialFakeMonk: !real,
      ...(fakeArtNames ? { fakeArtNames: { ...fakeArtNames } } : {}),
    };
  });
  return {
    units: prepared,
    rngState: shuffled.rngState,
    missionRules: { monkTrial: { realMonkId, finalPositions, introComplete: false } },
  };
}

export function applyMonkTrialIntroBeat(state, beat) {
  if (!state?.missionRules?.monkTrial) return state;
  if (beat === "monkIntroRevealAndMove") {
    const realMonkId = state.missionRules.monkTrial.realMonkId;
    return {
      ...state,
      units: state.units.map((unit) => {
        if (unit.player === 1) return { ...unit, introHidden: false };
        if (unit.id === realMonkId) {
          return {
            ...unit,
            position: { ...MONK_TRIAL_ALERT_POSITION },
            introHidden: false,
            trialIntroAlert: true,
          };
        }
        return unit;
      }),
    };
  }
  if (beat === "monkIntroSplitShuffle" || beat === "monkIntroComplete") {
    const finalPositions = state.missionRules.monkTrial.finalPositions ?? {};
    return {
      ...state,
      missionRules: {
        ...state.missionRules,
        monkTrial: {
          ...state.missionRules.monkTrial,
          introComplete: true,
        },
      },
      units: state.units.map((unit) => {
        const finalPosition = finalPositions[unit.id];
        return {
          ...unit,
          ...(finalPosition ? { position: { ...finalPosition } } : {}),
          introHidden: false,
          trialIntroAlert: false,
        };
      }),
    };
  }
  return state;
}
