// Circuit HUD view-model — pure. The renderer gets numbers and labels rather
// than deciding race order, lap timing, or what an automatic gearbox displays.

import { clamp } from "../circuit/math.js";
import { getForwardSpeed, getSpeed } from "../circuit/vehicle.js";

const SPEED_TO_KPH = 0.7;
const GEAR_BANDS_KPH = Object.freeze([0, 42, 78, 116, 158, 205, 260]);
const IDLE_RPM = 950;
const REDLINE_RPM = 7800;

function instrumentValues(vehicle) {
  const signedKph = getForwardSpeed(vehicle) * SPEED_TO_KPH;
  const speedKph = Math.round(Math.abs(getSpeed(vehicle) * SPEED_TO_KPH));
  if (signedKph < -2) return { speedKph, gear: "R", rpm: 2400 };

  let gear = 1;
  while (gear < 6 && speedKph >= GEAR_BANDS_KPH[gear]) gear += 1;
  const low = GEAR_BANDS_KPH[gear - 1];
  const high = GEAR_BANDS_KPH[gear];
  const pull = clamp((speedKph - low) / Math.max(1, high - low), 0, 1);
  return {
    speedKph,
    gear,
    rpm: Math.round(IDLE_RPM + pull * (REDLINE_RPM - IDLE_RPM)),
  };
}

function distanceToNext(participant, track) {
  const checkpoint = track?.checkpoints?.[participant.nextCheckpoint];
  return checkpoint
    ? Math.hypot(checkpoint.x - participant.vehicle.x, checkpoint.y - participant.vehicle.y)
    : Infinity;
}

function checkpointProgress(participant, track) {
  const count = track?.checkpoints?.length ?? 0;
  if (count === 0) return participant.lap;
  if (participant.finishedAt !== null) return participant.lap * count;
  // A race starts waiting for checkpoint 1, so `nextCheckpoint - 1` is how
  // many gates have been cleared on the current lap. This pair is also what an
  // authoritative online snapshot carries; a browser-only counter is not.
  const clearedThisLap = (participant.nextCheckpoint - 1 + count) % count;
  return participant.lap * count + clearedThisLap;
}

function runningOrder(state, track) {
  if (state.status === "countdown") return [...state.participants];
  return [...state.participants].sort((left, right) => {
    if (left.place !== null || right.place !== null) {
      if (left.place === null) return 1;
      if (right.place === null) return -1;
      return left.place - right.place;
    }
    const progress = checkpointProgress(right, track) - checkpointProgress(left, track);
    if (progress) return progress;
    const remaining = distanceToNext(left, track) - distanceToNext(right, track);
    if (Math.abs(remaining) > 1e-9) return remaining;
    return state.participants.indexOf(left) - state.participants.indexOf(right);
  });
}

function announcement(state, local) {
  if (state.status === "countdown") return String(Math.max(1, Math.ceil(state.countdown)));
  if (state.status === "finished") return local.place === 1 ? "VICTORY" : "DEFEAT";
  const event = state.lastEvents.find((entry) => entry.playerId === local.playerId);
  if (event?.type === "start") return "GO";
  if (event?.type === "lap" && event.lap === state.rules.laps - 1) return "FINAL LAP";
  return null;
}

export function circuitHudView(state, track, playerId = "local") {
  const local = state.participants.find((participant) => participant.playerId === playerId)
    ?? state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  const order = runningOrder(state, track);
  const position = order.findIndex((participant) => participant.playerId === local.playerId) + 1;
  const currentLap = local.finishedAt === null
    ? Math.min(state.rules.laps, local.lap + 1)
    : state.rules.laps;

  return {
    position: { current: position, total: state.participants.length },
    lap: { current: currentLap, total: state.rules.laps, completed: local.lap },
    timing: {
      total: local.finishedAt ?? state.elapsed,
      currentLap: local.finishedAt === null ? Math.max(0, state.elapsed - local.lapStartedAt) : local.lastLapTime,
      lastLap: local.lastLapTime,
      bestLap: local.bestLapTime,
    },
    checkpoint: { current: local.nextCheckpoint + 1, total: track?.checkpoints?.length ?? 0 },
    instruments: instrumentValues(local.vehicle),
    announcement: announcement(state, local),
    runners: order.map((participant, index) => ({
      playerId: participant.playerId,
      name: participant.playerId === local.playerId
        ? (participant.displayName
          && participant.displayName !== participant.playerId
          && participant.displayName !== "DRIVER"
          ? participant.displayName
          : "YOU")
        : (participant.displayName || "DRIVER"),
      position: index + 1,
      lap: Math.min(state.rules.laps, participant.lap + (participant.finishedAt === null ? 1 : 0)),
      finished: participant.finishedAt !== null,
      local: participant.playerId === local.playerId,
    })),
  };
}
