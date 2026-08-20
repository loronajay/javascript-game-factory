const controlsForWire = (tick, controls = {}) => ({
  t: tick,
  throttle: Number(controls.throttle) || 0,
  brake: Number(controls.brake) || 0,
  steer: Number(controls.steer) || 0,
  shift: Number(controls.shift) || 0,
});

export function createCircuitPrediction(state, playerId) {
  return { state, playerId, pending: [], acknowledgedTick: -1, sentThrough: -1 };
}

export function predictCircuitTick(prediction, adapter, controls) {
  const event = controlsForWire(prediction.state.tick, controls);
  let state = adapter.input(prediction.state, { playerId: prediction.playerId, ...event });
  state = adapter.step(state, 1 / 120);
  return { ...prediction, state, pending: [...prediction.pending, event] };
}

export function unsentCircuitInputs(prediction) {
  return prediction.pending.filter((event) => event.t > prediction.sentThrough);
}

export function markCircuitInputsSent(prediction, events) {
  return events.length === 0 ? prediction : { ...prediction, sentThrough: events.at(-1).t };
}

function mergeWireSnapshot(current, snapshot) {
  const wireParticipants = new Map((snapshot.participants ?? []).map((entry) => [entry.playerId, entry]));
  return {
    ...current,
    tick: snapshot.tick,
    elapsed: snapshot.elapsed,
    status: snapshot.status,
    finishOrder: [...(snapshot.finishOrder ?? [])],
    participants: current.participants.map((participant) => {
      const wire = wireParticipants.get(participant.playerId);
      return wire ? { ...participant, ...wire, vehicle: { ...wire.vehicle }, input: { ...wire.input } } : participant;
    }),
  };
}

export function reconcileCircuitSnapshot(prediction, adapter, snapshot) {
  if (!snapshot || snapshot.tick <= prediction.acknowledgedTick) return prediction;
  const targetTick = prediction.state.tick;
  const pending = prediction.pending.filter((event) => event.t >= snapshot.tick);
  let state = mergeWireSnapshot(prediction.state, snapshot);
  for (let tick = snapshot.tick; tick < targetTick; tick += 1) {
    const input = pending.find((event) => event.t === tick);
    if (input) state = adapter.input(state, { playerId: prediction.playerId, ...input });
    state = adapter.step(state, 1 / 120);
  }
  return { ...prediction, state, pending, acknowledgedTick: snapshot.tick };
}
