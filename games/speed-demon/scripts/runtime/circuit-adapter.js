import {
  createCircuitRace,
  inputCircuitRace,
  stepCircuitRace,
  circuitRaceResult,
} from "../circuit/race.js";
import { hasCircuitAtlas } from "../circuit/assets.js";
import { createLivery } from "../garage/livery.js";

export function createCircuitAdapter({ track, containsVehicle = () => true, renderer = null }) {
  return Object.freeze({
    create(definition) {
      const participants = definition?.participants?.map((entry) => {
        if (!hasCircuitAtlas(entry?.modelId)) {
          throw new Error(`Circuit atlas unavailable for model '${entry?.modelId ?? ""}'`);
        }
        return { ...entry, livery: createLivery(entry.livery) };
      });
      return createCircuitRace({ ...definition, participants }, track);
    },
    input(state, action) {
      return inputCircuitRace(state, action);
    },
    step(state, fixedDt) {
      return stepCircuitRace(state, fixedDt, { track, containsVehicle });
    },
    result(state, playerId = "local") {
      return circuitRaceResult(state, playerId);
    },
    render(ctx, state, view) {
      if (renderer) renderer(ctx, state, view);
    },
  });
}
