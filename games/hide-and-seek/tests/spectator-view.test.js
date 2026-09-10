const test = require('node:test');
const assert = require('node:assert/strict');

const spectator = require('../spectator-logic.js');
const hiderLogic = require('../hider-logic.js');
const avatarLogic = require('../avatar-logic.js');

test('a spectator sees by the watched player light, not by its own dead battery', () => {
  const lit = spectator.spectatorLight({ flashlightOn: true, flashlightCharge: 0.4 });
  assert.deepEqual(lit, { on: true, charge: 0.4, beam: 1 });
});

test('a watched player with the light off still leaves the camera something to see by', () => {
  const dark = spectator.spectatorLight({ flashlightOn: false, flashlightCharge: 0.8 });
  assert.equal(dark.on, false);
  assert.equal(dark.beam, spectator.GHOST_BEAM);
  assert.ok(dark.beam > 0 && dark.beam < 1, 'the ghost light is dimmer than a real flashlight');
});

test('an empty battery cannot be reported as lit, and no target is not a crash', () => {
  assert.equal(spectator.spectatorLight({ flashlightOn: true, flashlightCharge: 0 }).on, false);
  assert.equal(spectator.spectatorLight(null).beam, spectator.GHOST_BEAM);
  assert.equal(spectator.spectatorLight({}).charge, 0);
});

test('a CPU guest carries its light until it is tucked in', () => {
  const { HIDER_STATES } = hiderLogic;
  assert.equal(hiderLogic.flashlightOn({ state: HIDER_STATES.SETTLING }), true);
  assert.equal(hiderLogic.flashlightOn({ state: HIDER_STATES.FLEEING }), true);
  assert.equal(hiderLogic.flashlightOn({ state: HIDER_STATES.HIDDEN }), false);
  assert.equal(hiderLogic.flashlightOn(null), false);
});

test('the seeker wears a uniform and a guest does not, so the two read apart at a glance', () => {
  const seeker = avatarLogic.avatarMarker(avatarLogic.ROLES.SEEKER, 0);
  const guest = avatarLogic.avatarMarker(avatarLogic.ROLES.HIDER, 2);

  assert.equal(seeker.kind, 'seeker');
  assert.ok(seeker.cap && seeker.epaulettes, 'the seeker silhouette differs, not just its colour');
  assert.ok(seeker.glow > guest.glow, 'the seeker is the one warm figure in the building');
  assert.equal(guest.cap, false);
  assert.equal(guest.epaulettes, false);
  assert.equal(guest.scarf, true);
});

test('each guest seat gets its own scarf colour so spectating tells them apart', () => {
  const colours = [0, 1, 2, 3, 4].map((seat) => avatarLogic.avatarMarker(avatarLogic.ROLES.HIDER, seat).cloth);
  assert.equal(new Set(colours).size, colours.length);
});

test('a CPU guest actually spends a battery, so a spectator following one has something to see', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const flashlightLogic = require('../flashlight-logic.js');
  const context = await mapRuntime('grand-hotel');
  const { createHiders } = await import('../modules/hiders.js');
  const hiders = createHiders({
    ...context, logic: hiderLogic, tuning: hiderLogic.HIDER_DEFAULTS, count: 2,
    flashlightLogic, flashlightConfig: { drainSeconds: 120 },
  });

  assert.ok(hiders.list().every((entry) => entry.flashlightOn), 'a guest still looking for a spot carries a light');
  for (let tick = 0; tick < 60 * 90; tick += 1) hiders.update(1 / 60, []);
  const settled = hiders.list();
  assert.ok(settled.length, 'the guests are still in the building');
  assert.ok(settled.some((entry) => entry.flashlightOn === false), 'a hidden guest puts its light out');
  assert.ok(settled.every((entry) => entry.flashlightCharge < 1), 'the battery is spent, not decorative');
  assert.ok(settled.every((entry) => entry.flashlightCharge > 0));
  for (const entry of settled) assert.equal(spectator.spectatorLight(entry).on, entry.flashlightOn);
});

test('without the flashlight seam a guest is exactly as dark as it always was', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const context = await mapRuntime('grand-hotel');
  const { createHiders } = await import('../modules/hiders.js');
  const hiders = createHiders({ ...context, logic: hiderLogic, tuning: hiderLogic.HIDER_DEFAULTS, count: 1 });
  hiders.update(1 / 60, []);
  const [guest] = hiders.list();
  assert.equal(guest.flashlightOn, false);
  assert.equal(guest.flashlightCharge, 1);
});
