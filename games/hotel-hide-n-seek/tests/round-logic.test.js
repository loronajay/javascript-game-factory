const test = require('node:test');
const assert = require('node:assert/strict');

const round = require('../round-logic.js');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = {
  durationSeconds: 120,
  hideSeconds: 45,
  tagDistance: 1.8,
  tagHeightTolerance: 1.4,
};

function newRound(hiderCount = 3, config = CONFIG) {
  const players = ['seeker', ...Array.from({ length: hiderCount }, (_, index) => `hider-${index}`)];
  return round.createRound({ players, seekerId: 'seeker', config });
}

function playing(hiderCount = 3) {
  return round.tickRound(newRound(hiderCount), CONFIG.hideSeconds, CONFIG);
}

function find(state, id) {
  return state.participants.find((entry) => entry.id === id);
}

test('the demo has three guests while an untimed round still scales to a sixteen-player lobby', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'game-config.js'), 'utf8');

  assert.equal(round.ROUND_DEFAULTS.durationSeconds, null);
  assert.match(source, /durationSeconds:\s*null/);
  assert.match(source, /hiderCount:\s*3/);

  const players = Array.from({ length: 16 }, (_, index) => `player-${index + 1}`);
  let state = round.createRound({ players, seekerId: players[0] });
  state = round.tickRound(state, round.ROUND_DEFAULTS.hideSeconds);
  state = round.tickRound(state, 60 * 60 * 24);

  assert.equal(state.status, round.ROUND_STATES.ACTIVE);
  assert.equal(state.remaining, null);
  assert.equal(round.livingHiders(state).length, 15);
  assert.equal(round.describeRound(state).clock, 'NO LIMIT');
});

test('a created round seats every player, names one seeker, and starts in the hiding phase', () => {
  const state = newRound(3);

  assert.equal(state.status, round.ROUND_STATES.ACTIVE);
  assert.equal(state.phase, round.PHASES.HIDING);
  assert.equal(state.participants.length, 4);
  assert.equal(find(state, 'seeker').role, round.ROLES.SEEKER);
  assert.equal(state.participants.filter((entry) => entry.role === round.ROLES.SEEKER).length, 1);
  assert.deepEqual(state.participants.map((entry) => entry.seat), [0, 1, 2, 3]);
  assert.ok(state.participants.every((entry) => entry.alive));
  assert.equal(state.outcome, null);
});

test('the round clock does not start until the hiding head start expires', () => {
  let state = newRound(2);
  assert.equal(state.hideRemaining, CONFIG.hideSeconds);
  assert.equal(state.remaining, CONFIG.durationSeconds);

  state = round.tickRound(state, 4, CONFIG);
  assert.equal(state.phase, round.PHASES.HIDING);
  assert.equal(state.hideRemaining, 41);
  assert.equal(state.remaining, CONFIG.durationSeconds, 'the round clock is frozen while hiders hide');

  state = round.tickRound(state, 41, CONFIG);
  assert.equal(state.phase, round.PHASES.SEEKING);
  assert.equal(state.hideRemaining, 0);

  state = round.tickRound(state, 5, CONFIG);
  assert.equal(state.remaining, CONFIG.durationSeconds - 5);
});

test('the hiding phase cannot be configured below forty-five seconds', () => {
  const state = newRound(2, { ...CONFIG, hideSeconds: 8 });

  assert.equal(state.hideRemaining, 45);
  assert.equal(round.tickRound(state, 44.9, CONFIG).phase, round.PHASES.HIDING);
});

test('a tick that spans the release only spends its remainder on the round clock', () => {
  const state = round.tickRound(newRound(2), CONFIG.hideSeconds + 3, CONFIG);

  assert.equal(state.phase, round.PHASES.SEEKING);
  assert.equal(state.remaining, CONFIG.durationSeconds - 3);
});

test('a seeker tags a hider only within reach, at a matching height, and with line of sight', () => {
  const seeker = { x: 0, y: 0, z: 0 };

  assert.ok(round.canTag({ seeker, hider: { x: 1.2, y: 0, z: 0 } }, CONFIG));
  assert.ok(!round.canTag({ seeker, hider: { x: 4, y: 0, z: 0 } }, CONFIG), 'out of reach');
  assert.ok(!round.canTag({ seeker, hider: { x: 1.2, y: 3.2, z: 0 } }, CONFIG), 'a floor above is not a tag');
  assert.ok(!round.canTag({ seeker, hider: { x: 1.2, y: 0, z: 0 }, occluded: true }, CONFIG), 'through a wall is not a tag');
});

test('tagging a hider takes it out of play and records who took it', () => {
  const state = round.resolveTag(playing(3), { seekerId: 'seeker', hiderId: 'hider-1' });
  const hider = find(state, 'hider-1');

  assert.equal(hider.alive, false);
  assert.equal(hider.caughtBy, round.CAUGHT_BY.SEEKER);
  assert.equal(round.livingHiders(state).length, 2);
  assert.equal(state.outcome, null, 'two hiders are still hiding');
});

test('the seeker wins once the last hider is out, however each one went out', () => {
  let state = playing(2);
  state = round.resolveTag(state, { seekerId: 'seeker', hiderId: 'hider-0' });
  assert.equal(state.status, round.ROUND_STATES.ACTIVE);

  state = round.resolveDemonCatch(state, 'hider-1');
  assert.equal(state.status, round.ROUND_STATES.ENDED);
  assert.equal(state.outcome, round.OUTCOMES.SEEKER);
  assert.equal(state.cause, round.CAUSES.ALL_HIDERS_OUT);
  assert.equal(find(state, 'hider-1').caughtBy, round.CAUGHT_BY.DEMON);
});

test('the demon taking the seeker ends the round for the hiders even with hiders left', () => {
  const state = round.resolveDemonCatch(playing(3), 'seeker');

  assert.equal(state.status, round.ROUND_STATES.ENDED);
  assert.equal(state.outcome, round.OUTCOMES.HIDERS);
  assert.equal(state.cause, round.CAUSES.SEEKER_LOST);
  assert.equal(find(state, 'seeker').alive, false);
  assert.equal(round.livingHiders(state).length, 3, 'survivors are not retroactively caught');
});

test('running out of time is a hider win', () => {
  const state = round.tickRound(playing(2), CONFIG.durationSeconds, CONFIG);

  assert.equal(state.status, round.ROUND_STATES.ENDED);
  assert.equal(state.outcome, round.OUTCOMES.HIDERS);
  assert.equal(state.cause, round.CAUSES.TIMEOUT);
  assert.equal(state.remaining, 0);
});

test('the seeker cannot tag during the head start', () => {
  const hiding = newRound(2);
  const state = round.resolveTag(hiding, { seekerId: 'seeker', hiderId: 'hider-0' });

  assert.equal(find(state, 'hider-0').alive, true);
});

test('bogus catch resolution is ignored rather than trusted', () => {
  const state = playing(2);

  assert.equal(round.resolveTag(state, { seekerId: 'hider-0', hiderId: 'hider-1' }), state, 'only the seeker tags');
  assert.equal(round.resolveTag(state, { seekerId: 'seeker', hiderId: 'seeker' }), state, 'the seeker cannot tag itself');
  assert.equal(round.resolveTag(state, { seekerId: 'seeker', hiderId: 'ghost' }), state, 'unknown players do not exist');

  const once = round.resolveTag(state, { seekerId: 'seeker', hiderId: 'hider-0' });
  assert.equal(round.resolveTag(once, { seekerId: 'seeker', hiderId: 'hider-0' }), once, 'a hider is only caught once');

  const ended = round.resolveDemonCatch(state, 'seeker');
  assert.equal(round.resolveTag(ended, { seekerId: 'seeker', hiderId: 'hider-0' }), ended, 'an ended round is settled');
  assert.equal(round.tickRound(ended, 10, CONFIG), ended, 'an ended round does not keep ticking');
});

test('a round with no hiders never starts', () => {
  const state = round.createRound({ players: ['seeker'], seekerId: 'seeker', config: CONFIG });

  assert.equal(state.status, round.ROUND_STATES.LOBBY);
  assert.equal(round.tickRound(state, 999, CONFIG), state);
});

test('the seeker is picked from the roster when nobody is named', () => {
  const state = round.createRound({ players: ['a', 'b', 'c'], random: () => 0.5, config: CONFIG });

  assert.equal(find(state, 'b').role, round.ROLES.SEEKER);
  assert.equal(round.seekerOf(state).id, 'b');
  assert.equal(round.livingHiders(state).length, 2);
});

test('the round describes itself for a HUD without exposing hider positions', () => {
  const view = round.describeRound(round.resolveTag(playing(3), { seekerId: 'seeker', hiderId: 'hider-0' }), CONFIG);

  assert.equal(view.hidersRemaining, 2);
  assert.equal(view.hidersTotal, 3);
  assert.equal(view.phase, round.PHASES.SEEKING);
  assert.equal(view.clock, '2:00');
  assert.equal(view.over, false);
  assert.deepEqual(Object.keys(view).sort(), ['caught', 'cause', 'clock', 'hidersRemaining', 'hidersTotal', 'outcome', 'over', 'phase', 'seconds']);
});
