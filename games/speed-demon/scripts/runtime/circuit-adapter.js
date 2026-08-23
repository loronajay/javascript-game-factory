import {
  createCircuitRace,
  inputCircuitRace,
  stepCircuitRace,
  circuitRaceResult,
} from "../circuit/race.js";
import { hasCircuitAtlas } from "../circuit/assets.js";
import { createLivery } from "../garage/livery.js";

export function createCircuitAdapter({
  track = null,
  trackById = null,
  containsVehicle = () => true,
  renderer = null,
}) {
  const resolveTrack = (value) => {
    const id = value?.trackId;
    if (track && (!id || track.id === id)) return track;
    return typeof trackById === "function" ? trackById(id) : null;
  };
  return Object.freeze({
    create(definition) {
      const participants = definition?.participants?.map((entry) => {
        if (!hasCircuitAtlas(entry?.modelId)) {
          throw new Error(`Circuit atlas unavailable for model '${entry?.modelId ?? ""}'`);
        }
        return { ...entry, livery: createLivery(entry.livery) };
      });
      const selectedTrack = resolveTrack(definition);
      return createCircuitRace({ ...definition, participants }, selectedTrack);
    },
    input(state, action) {
      return inputCircuitRace(state, action);
    },
    step(state, fixedDt) {
      const selectedTrack = resolveTrack(state);
      return stepCircuitRace(state, fixedDt, {
        track: selectedTrack,
        containsVehicle: (vehicle) => containsVehicle(vehicle, selectedTrack),
      });
    },
    result(state, playerId = "local") {
      return circuitRaceResult(state, playerId);
    },
    render(ctx, state, view) {
      if (renderer) renderer(ctx, state, view);
    },
  });
}
