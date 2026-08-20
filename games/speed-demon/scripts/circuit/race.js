import { CPU_VEHICLE_TUNING } from "./config.js";
import { resolveTrackCollision } from "./collision.js";
import { createCpuDriver, updateCpuDriver } from "./cpu-driver.js";
import { clamp } from "./math.js";
import { createVehicle, stepVehicle } from "./vehicle.js";
import { resolveVehicleCollision } from "./vehicle-collision.js";

export const STATUS_COUNTDOWN = "countdown";
export const STATUS_RACING = "racing";
export const STATUS_FINISHED = "finished";

const validControl = (control) => ["local", "cpu", "remote"].includes(control);

function normalizeParticipant(entry, index, track) {
  const modelId = String(entry?.modelId ?? "");
  if (!modelId) throw new Error("Circuit participant requires modelId");
  const spawn = track.spawns[index % track.spawns.length];
  const control = validControl(entry?.control) ? entry.control : "cpu";
  return {
    playerId: String(entry?.playerId ?? `participant-${index + 1}`),
    control,
    modelId,
    livery: entry?.livery ?? null,
    vehicle: createVehicle(spawn),
    input: { throttle: 0, brake: 0, steer: 0, shift: 0 },
    driver: control === "cpu" ? createCpuDriver(track.racingLine) : null,
    nextCheckpoint: track.checkpoints.length > 1 ? 1 : 0,
    lap: 0,
    finishedAt: null,
    place: null,
  };
}

export function createCircuitRace(definition, track) {
  if (definition?.runtime !== "circuit") throw new Error("Circuit race requires runtime 'circuit'");
  if (!track || track.id !== definition.trackId) throw new Error(`Unknown circuit track '${definition?.trackId}'`);
  if (!Array.isArray(definition.participants) || definition.participants.length === 0) {
    throw new Error("Circuit race requires participants");
  }
  const laps = Math.max(1, Math.min(99, Math.trunc(definition.rules?.laps ?? 3)));
  const countdownSeconds = Math.max(0, Math.min(10, Number(definition.rules?.countdownSeconds ?? 3)));
  const timeoutSeconds = Math.max(10, Math.min(1800, Number(definition.rules?.timeoutSeconds ?? 300)));
  return {
    runtime: "circuit",
    modeId: definition.modeId ?? "circuit",
    trackId: track.id,
    rules: { laps, countdownSeconds, timeoutSeconds },
    source: {
      kind: definition.source?.kind ?? "freeplay",
      id: definition.source?.id ?? null,
    },
    status: countdownSeconds > 0 ? STATUS_COUNTDOWN : STATUS_RACING,
    countdown: countdownSeconds,
    elapsed: 0,
    tick: 0,
    participants: definition.participants.map((entry, index) => normalizeParticipant(entry, index, track)),
    finishOrder: [],
    lastEvents: [],
  };
}

export function inputCircuitRace(state, action = {}) {
  const playerId = String(action.playerId ?? "");
  return {
    ...state,
    participants: state.participants.map((participant) => participant.playerId === playerId
      ? {
        ...participant,
        input: {
          throttle: clamp(Number(action.throttle) || 0, -1, 1),
          brake: clamp(Number(action.brake) || 0, 0, 1),
          steer: clamp(Number(action.steer) || 0, -1, 1),
          shift: Math.sign(Number(action.shift) || 0),
        },
      }
      : participant),
  };
}

function crossesCircle(previous, current, checkpoint) {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared > 0
    ? clamp(((checkpoint.x - previous.x) * dx + (checkpoint.y - previous.y) * dy) / lengthSquared, 0, 1)
    : 0;
  const x = previous.x + dx * projection;
  const y = previous.y + dy * projection;
  return Math.hypot(x - checkpoint.x, y - checkpoint.y) <= checkpoint.radius;
}

function advanceParticipant(participant, previousVehicle, track, rules, elapsed, place) {
  if (participant.finishedAt !== null || track.checkpoints.length === 0) return { participant, event: null };
  const checkpoint = track.checkpoints[participant.nextCheckpoint];
  if (!checkpoint || !crossesCircle(previousVehicle, participant.vehicle, checkpoint)) {
    return { participant, event: null };
  }
  const completedIndex = participant.nextCheckpoint;
  const nextCheckpoint = (completedIndex + 1) % track.checkpoints.length;
  let lap = participant.lap;
  let finishedAt = participant.finishedAt;
  let finishPlace = participant.place;
  let event = { type: "checkpoint", playerId: participant.playerId, checkpoint: completedIndex };
  if (completedIndex === 0) {
    lap += 1;
    event = { type: "lap", playerId: participant.playerId, lap };
    if (lap >= rules.laps) {
      finishedAt = elapsed;
      finishPlace = place;
      event = { type: "finish", playerId: participant.playerId, place, time: elapsed };
    }
  }
  return {
    participant: { ...participant, nextCheckpoint, lap, finishedAt, place: finishPlace },
    event,
  };
}

function stepParticipants(state, dt, track, containsVehicle) {
  const previous = state.participants.map((participant) => participant.vehicle);
  let participants = state.participants.map((participant) => {
    if (participant.finishedAt !== null) return participant;
    let input = participant.input;
    let driver = participant.driver;
    if (participant.control === "cpu") {
      const decision = updateCpuDriver(driver, participant.vehicle);
      input = decision.input;
      driver = decision.driver;
    }
    const tuning = participant.control === "cpu" ? CPU_VEHICLE_TUNING : undefined;
    const driveInput = { ...input, throttle: input.brake > 0 ? -input.brake : input.throttle };
    const candidate = stepVehicle(participant.vehicle, driveInput, dt, tuning);
    const collision = resolveTrackCollision(participant.vehicle, candidate, containsVehicle);
    return { ...participant, input, driver, vehicle: collision.vehicle };
  });

  for (let left = 0; left < participants.length; left += 1) {
    for (let right = left + 1; right < participants.length; right += 1) {
      const contact = resolveVehicleCollision(participants[left].vehicle, participants[right].vehicle);
      if (!contact.impact) continue;
      participants[left] = {
        ...participants[left],
        vehicle: containsVehicle(contact.player) ? contact.player : participants[left].vehicle,
      };
      participants[right] = {
        ...participants[right],
        vehicle: containsVehicle(contact.cpu) ? contact.cpu : participants[right].vehicle,
      };
    }
  }
  return { participants, previous };
}

export function stepCircuitRace(state, dt, environment = {}) {
  if (state.status === STATUS_FINISHED) return state;
  const safeDt = clamp(Number(dt) || 0, 0, 0.05);
  if (state.status === STATUS_COUNTDOWN) {
    const countdown = Math.max(0, state.countdown - safeDt);
    return {
      ...state,
      countdown,
      tick: state.tick + 1,
      status: countdown === 0 ? STATUS_RACING : STATUS_COUNTDOWN,
      lastEvents: countdown === 0 ? [{ type: "start" }] : [],
    };
  }

  const track = environment.track;
  if (!track) throw new Error("Circuit step requires its track environment");
  const containsVehicle = environment.containsVehicle ?? (() => true);
  const elapsed = state.elapsed + safeDt;
  const stepped = stepParticipants(state, safeDt, track, containsVehicle);
  const finishOrder = [...state.finishOrder];
  const lastEvents = [];
  const participants = stepped.participants.map((participant, index) => {
    const place = finishOrder.length + 1;
    const advanced = advanceParticipant(
      participant,
      stepped.previous[index],
      track,
      state.rules,
      elapsed,
      place,
    );
    if (advanced.event) lastEvents.push(advanced.event);
    if (advanced.event?.type === "finish") finishOrder.push(participant.playerId);
    return advanced.participant;
  });
  const timedOut = elapsed >= state.rules.timeoutSeconds;
  const complete = timedOut || participants.every((participant) => participant.finishedAt !== null);
  if (timedOut) lastEvents.push({ type: "timeout" });
  return {
    ...state,
    elapsed,
    tick: state.tick + 1,
    participants,
    finishOrder,
    lastEvents,
    status: complete ? STATUS_FINISHED : STATUS_RACING,
  };
}

export function circuitRaceResult(state, playerId = "local") {
  const participant = state.participants.find((entry) => entry.playerId === playerId) ?? null;
  const finished = participant?.finishedAt !== null && participant?.finishedAt !== undefined;
  return {
    won: participant?.place === 1,
    value: finished ? participant.finishedAt : null,
    better: "lower",
    place: participant?.place ?? null,
    finished,
  };
}
