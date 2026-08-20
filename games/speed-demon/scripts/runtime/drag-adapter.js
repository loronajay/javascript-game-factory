// Adapter around the existing one-dimensional reducer. The wrapper owns input
// levels; `sim/race.js` remains byte-for-byte drag physics.

import { createRace, gateInput, pressShift, startRace, stepRace } from "../sim/race.js";

export function createDragAdapter({ car, gate, renderer = null }) {
  return Object.freeze({
    create(definition) {
      return {
        runtime: "drag",
        race: createRace({ car, gate, ...definition.rules }),
        throttle: 0,
        source: definition.source,
      };
    },
    input(state, action = {}) {
      if (action.type === "throttle") return { ...state, throttle: action.value ? 1 : 0 };
      if (action.type === "start") return { ...state, race: startRace(state.race) };
      if (action.type === "shift") {
        return { ...state, race: pressShift(state.race, { throttle: state.throttle }) };
      }
      if (action.type === "gate") {
        return { ...state, race: gateInput(state.race, action.direction) };
      }
      return state;
    },
    step(state, fixedDt) {
      return { ...state, race: stepRace(state.race, { throttle: state.throttle }, fixedDt) };
    },
    result(state) {
      const race = state.race;
      const timed = race.distanceMetres !== null;
      return {
        won: true,
        value: timed ? race.finishTime : race.vehicle.distance,
        better: timed ? "lower" : "higher",
        finished: race.phase === "finished",
      };
    },
    render(ctx, state, view) {
      if (renderer) renderer(ctx, state, view);
    },
  });
}
