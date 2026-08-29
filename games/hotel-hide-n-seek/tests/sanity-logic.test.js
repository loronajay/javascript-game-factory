const test = require('node:test');
const assert = require('node:assert/strict');
const sanity = require('../sanity-logic.js');

const ROOMS = [
  { id: '105', floor: 1, x: -9, z: 0 },
  { id: '111', floor: 1, x: -9, z: 18 },
  { id: '205', floor: 2, x: -9, z: 0 },
];

// A secret tunnel is an explicit box rather than a centre, because it runs the length of the two
// rooms it links.
const TUNNEL = { id: '105-107-tunnel', kind: 'tunnel', floor: 1, minX: -14.5, maxX: -12, minZ: -3.4, maxZ: 8.7 };
const ZONES = [...ROOMS, TUNNEL];

test('a position inside a room reports that room, and the hallway reports the hallway', () => {
  assert.deepEqual(sanity.locateZone(ZONES, { x: -9, z: 0, floor: 1 }), { id: '105', kind: 'room' });
  assert.deepEqual(sanity.locateZone(ZONES, { x: -6.2, z: 3.4, floor: 1 }), { id: '105', kind: 'room' });
  assert.deepEqual(sanity.locateZone(ZONES, { x: 0, z: 0, floor: 1 }), { id: sanity.HALLWAY, kind: 'hallway' });
  assert.deepEqual(sanity.locateZone(ZONES, { x: -9, z: 18, floor: 1 }), { id: '111', kind: 'room' });
});

test('a room only claims the floor it is on', () => {
  assert.equal(sanity.locateZone(ZONES, { x: -9, z: 0, floor: 2 }).id, '205');
  assert.equal(sanity.locateZone(ZONES, { x: -9, z: 18, floor: 2 }).id, sanity.HALLWAY);
});

test('the stairwell and elevator (floor 0) are never a room', () => {
  assert.equal(sanity.locateZone(ZONES, { x: -9, z: 0, floor: 0 }).id, sanity.HALLWAY);
});

test('a secret tunnel is its own kind of zone, on its own floor', () => {
  assert.deepEqual(sanity.locateZone(ZONES, { x: -13.25, z: 2, floor: 1 }), { id: '105-107-tunnel', kind: 'tunnel' });
  assert.equal(sanity.locateZone(ZONES, { x: -13.25, z: 2, floor: 2 }).id, sanity.HALLWAY);
  assert.equal(sanity.locateZone(ZONES, { x: -13.25, z: 40, floor: 1 }).id, sanity.HALLWAY);
});

test('the tunnel wins the sliver of wall it shares with the room box next door', () => {
  // The tunnel floor rect and the room box overlap by a couple of centimetres of solid wall; the
  // tunnel is the more specific space, so it is tested first.
  assert.equal(sanity.locateZone(ZONES, { x: -12.01, z: 0, floor: 1 }).kind, 'tunnel');
});

test('sanity fills while the player stays in one room and reports full at the fill time', () => {
  const config = { fillSeconds: 4 };
  let state = sanity.createSanityState();
  for (let tick = 0; tick < 2; tick += 1) state = sanity.updateSanity(state, { zone: '105', delta: 1, config });
  assert.equal(state.zone, '105');
  assert.equal(state.value, 0.5);
  assert.equal(state.full, false);
  for (let tick = 0; tick < 2; tick += 1) state = sanity.updateSanity(state, { zone: '105', delta: 1, config });
  assert.equal(state.value, 1);
  assert.equal(state.full, true);
});

test('sanity does not overfill past 1', () => {
  const config = { fillSeconds: 2 };
  let state = sanity.createSanityState();
  for (let tick = 0; tick < 10; tick += 1) state = sanity.updateSanity(state, { zone: '105', delta: 1, config });
  assert.equal(state.value, 1);
  assert.equal(state.seconds, 2);
});

test('leaving the room resets the meter', () => {
  const config = { fillSeconds: 4 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: '105', delta: 3, config });
  assert.equal(state.value, 0.75);
  state = sanity.updateSanity(state, { zone: sanity.HALLWAY, delta: 0.1, config });
  assert.equal(state.value, 0);
  assert.equal(state.reset, 'zone');
});

test('moving between two rooms resets the meter as surely as stepping into the hall', () => {
  const config = { fillSeconds: 4 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: '105', delta: 3.5, config });
  state = sanity.updateSanity(state, { zone: '111', delta: 0.1, config });
  assert.equal(state.value, 0);
  assert.equal(state.zone, '111');
});

test('steps taken in the hallway reset the meter once they add up', () => {
  const config = { fillSeconds: 10, hallwayStepDistance: 5 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: sanity.HALLWAY, delta: 4, config });
  assert.equal(state.value, 0.4);
  state = sanity.updateSanity(state, { zone: sanity.HALLWAY, delta: 0.5, movedDistance: 2, config });
  assert.equal(state.value, 0.45, 'a short step is not enough on its own');
  state = sanity.updateSanity(state, { zone: sanity.HALLWAY, delta: 0.5, movedDistance: 3.5, config });
  assert.equal(state.value, 0);
  assert.equal(state.reset, 'steps');
});

test('standing still in the hallway still fills — camping anywhere is the thing being punished', () => {
  const config = { fillSeconds: 4, hallwayStepDistance: 5 };
  let state = sanity.createSanityState();
  for (let tick = 0; tick < 4; tick += 1) state = sanity.updateSanity(state, { zone: sanity.HALLWAY, delta: 1, config });
  assert.equal(state.full, true);
});

test('walking around inside a room does not reset it — hiding in place is the sin, not moving', () => {
  const config = { fillSeconds: 4, hallwayStepDistance: 5 };
  let state = sanity.createSanityState();
  for (let tick = 0; tick < 4; tick += 1) state = sanity.updateSanity(state, { zone: '105', delta: 1, movedDistance: 4, config });
  assert.equal(state.full, true);
});

test('no hunt target while nobody is full', () => {
  const candidates = [{ id: 'a', full: false, zone: '105', x: 0, z: 0, floor: 1 }];
  assert.equal(sanity.selectHuntTarget(candidates, { x: 0, z: 0, floor: 1 }), null);
});

test('a full hider standing in the hallway is not a hunt target — the demon enters rooms', () => {
  const candidates = [{ id: 'a', full: true, zone: sanity.HALLWAY, x: 0, z: 0, floor: 1 }];
  assert.equal(sanity.selectHuntTarget(candidates, { x: 0, z: 0, floor: 1 }), null);
});

test('among full hiders the demon commits to the one it is closest to', () => {
  const candidates = [
    { id: 'far', full: true, zone: '111', x: 0, z: 40, floor: 1 },
    { id: 'near', full: true, zone: '105', x: 0, z: 6, floor: 1 },
  ];
  assert.equal(sanity.selectHuntTarget(candidates, { x: 0, z: 0, floor: 1 }).id, 'near');
});

test('each hider carries an independent sanity tracker that becomes a hunt candidate', () => {
  const config = { fillSeconds: 4 };
  let first = sanity.createPlayerSanity({ x: -9, z: 0 });
  let second = sanity.createPlayerSanity({ x: -9, z: 18 });

  first = sanity.updatePlayerSanity(first, { id: 'hider-1', x: -9, z: 0, floor: 1 }, ZONES, 4, config);
  second = sanity.updatePlayerSanity(second, { id: 'hider-2', x: -9, z: 18, floor: 1 }, ZONES, 1, config);

  assert.equal(first.candidate.full, true);
  assert.equal(first.candidate.zone, '105');
  assert.equal(second.candidate.full, false);
  assert.equal(sanity.selectHuntTarget([first.candidate, second.candidate], { x: 0, z: 0, floor: 1 }).id, 'hider-1');
});

test('a floor apart counts as distance, so a hider one floor up is further than one down the hall', () => {
  const candidates = [
    { id: 'upstairs', full: true, zone: '205', x: 0, z: 2, floor: 2 },
    { id: 'same-floor', full: true, zone: '111', x: 0, z: 14, floor: 1 },
  ];
  const target = sanity.selectHuntTarget(candidates, { x: 0, z: 0, floor: 1 }, { floorPenalty: 24 });
  assert.equal(target.id, 'same-floor');
});

test('a secret tunnel drains the meter instead of filling it', () => {
  const config = { fillSeconds: 10, tunnelDrainSeconds: 5 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: '105', kind: 'room', delta: 8, config });
  assert.equal(state.value, 0.8);
  // Entering the passage carries the meter in — the tunnel is the one zone change that does not
  // wipe it — and then bleeds it off.
  state = sanity.updateSanity(state, { zone: 'tunnel-a', kind: 'tunnel', delta: 1, config });
  assert.equal(state.value, 0.6, 'a full meter drains over tunnelDrainSeconds, it does not vanish');
  state = sanity.updateSanity(state, { zone: 'tunnel-a', kind: 'tunnel', delta: 2, config });
  assert.equal(state.value, 0.2);
});

test('the tunnel drain bottoms out at zero and stays there', () => {
  const config = { fillSeconds: 10, tunnelDrainSeconds: 5 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: '105', kind: 'room', delta: 10, config });
  assert.equal(state.full, true);
  for (let tick = 0; tick < 20; tick += 1) state = sanity.updateSanity(state, { zone: 'tunnel-a', kind: 'tunnel', delta: 1, config });
  assert.equal(state.value, 0);
  assert.equal(state.seconds, 0);
});

test('a meter can never read full inside a tunnel, however long you sit there', () => {
  const config = { fillSeconds: 4, tunnelDrainSeconds: 5 };
  let state = sanity.createSanityState();
  for (let tick = 0; tick < 20; tick += 1) state = sanity.updateSanity(state, { zone: 'tunnel-a', kind: 'tunnel', delta: 1, config });
  assert.equal(state.full, false);
  assert.equal(state.value, 0);
});

test('leaving a tunnel resets like any other zone change and the meter starts climbing again', () => {
  const config = { fillSeconds: 10, tunnelDrainSeconds: 5 };
  let state = sanity.createSanityState();
  state = sanity.updateSanity(state, { zone: 'tunnel-a', kind: 'tunnel', delta: 1, config });
  state = sanity.updateSanity(state, { zone: '107', kind: 'room', delta: 1, config });
  assert.equal(state.reset, 'zone');
  state = sanity.updateSanity(state, { zone: '107', kind: 'room', delta: 3, config });
  assert.equal(state.value, 0.3);
});

test('a tunnel is never a hunt target — the demon walks into rooms and cannot open a secret panel', () => {
  const candidates = [{ id: 'a', full: true, zone: 'tunnel-a', kind: 'tunnel', x: 0, z: 0, floor: 1 }];
  assert.equal(sanity.selectHuntTarget(candidates, { x: 0, z: 0, floor: 1 }), null);
});
