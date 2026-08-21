import { createLivery } from "../garage/livery.js";
import { modeById, objectiveOption, raceOptionsFor } from "../sim/modes.js";
import { DEFAULT_CIRCUIT_TRACK_ID } from "../circuit/tracks.js";

export function canonicalLoadout(value) {
  return {
    modelId: String(value?.modelId ?? ""),
    livery: createLivery(value?.livery),
  };
}

export function buildRuntimeDefinition({
  modeId,
  objectiveId,
  trackId = null,
  participants,
  source = { kind: "freeplay", id: null },
} = {}) {
  const mode = modeById(modeId);
  if (!mode) throw new Error(`No such mode: ${modeId}`);
  const objective = objectiveOption(mode, objectiveId);
  const normalizedParticipants = (participants ?? []).map((participant) => ({
    playerId: String(participant.playerId),
    displayName: String(participant.displayName ?? participant.playerId),
    control: participant.control,
    ...canonicalLoadout(participant),
  }));
  if (normalizedParticipants.length === 0) throw new Error("Race definition requires participants");

  if (mode.runtime === "circuit") {
    return {
      runtime: "circuit",
      modeId: mode.id,
      trackId: trackId ?? DEFAULT_CIRCUIT_TRACK_ID,
      rules: {
        laps: objective.laps,
        countdownSeconds: 3,
        timeoutSeconds: 300,
      },
      participants: normalizedParticipants,
      source: { kind: source.kind, id: source.id ?? null },
    };
  }

  return {
    runtime: "drag",
    modeId: mode.id,
    trackId,
    rules: { ...raceOptionsFor(mode.id, objective.id), countdownSeconds: 3 },
    participants: normalizedParticipants,
    source: { kind: source.kind, id: source.id ?? null },
  };
}
