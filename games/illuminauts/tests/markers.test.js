import assert from 'node:assert/strict';
import { createGameState } from '../scripts/state.js';
import { MARKER_LIMIT, MARKER_KINDS, createMarkerState, placeMarker, updateMarkerInput, yawToCardinal, applyRemoteMarker } from '../scripts/markers.js';

function fixture() {
  const state = createGameState();
  state.map = { width: 9, height: 7, tiles: [
    '#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########',
  ].map(r => r.split('')), pickups: [], doors: [], goals: [] };
  Object.assign(state.player, { px: 3.5, py: 3.5, tx: 3, ty: 3, yaw: 0, pitch: 0 });
  state.input = { held: new Set(), justPressed: new Set(), lookX: 0, lookY: 0 };
  return state;
}

// Fresh state carries an empty marker ledger.
const fresh = createGameState();
assert.deepEqual(fresh.markers, createMarkerState());
assert.deepEqual(fresh.markers.remote, []);
assert.equal(fresh.markers.placed.length, 0);
assert.equal(MARKER_LIMIT, 8);
assert.deepEqual(MARKER_KINDS, ['arrow', 'cross']);

// Yaw snaps to the four facings the maze is built from. yaw 0 faces -y (up), -π/2 faces +x (right).
assert.equal(yawToCardinal(0), 'up');
assert.equal(yawToCardinal(-Math.PI / 2), 'right');
assert.equal(yawToCardinal(Math.PI), 'down');
assert.equal(yawToCardinal(Math.PI / 2), 'left');
assert.equal(yawToCardinal(-Math.PI / 2 + 0.3), 'right', 'off-axis yaw snaps to the nearest facing');
assert.equal(yawToCardinal(Math.PI * 2 + 0.1), 'up', 'wrapped yaw is normalized');

// Placing stamps the player's tile and facing.
const s = fixture();
s.player.yaw = -Math.PI / 2;
const first = placeMarker(s, 'arrow');
assert.deepEqual({ ...first, id: undefined }, { id: undefined, kind: 'arrow', x: 3, y: 3, dir: 'right' });
assert.equal(s.markers.placed.length, 1);
assert.match(s.message, /1\/8/);

// Same tile replaces rather than stacks; a different kind swaps the glyph.
placeMarker(s, 'cross');
assert.equal(s.markers.placed.length, 1);
assert.equal(s.markers.placed[0].kind, 'cross');
assert.equal(s.markers.placed[0].id !== first.id, true, 'a replacement is a new marker');

// Unknown kinds are rejected without touching state.
assert.equal(placeMarker(s, 'skull'), null);
assert.equal(s.markers.placed.length, 1);

// The ledger is capped: the oldest tag is recycled once the limit is hit.
const cap = fixture();
for (let i = 0; i < MARKER_LIMIT; i++) { cap.player.tx = 1 + i; cap.player.px = 1.5 + i; placeMarker(cap, 'arrow'); }
assert.equal(cap.markers.placed.length, MARKER_LIMIT);
const oldest = cap.markers.placed[0];
cap.player.tx = 1; cap.player.ty = 4; placeMarker(cap, 'cross');
assert.equal(cap.markers.placed.length, MARKER_LIMIT);
assert.ok(!cap.markers.placed.some(m => m.id === oldest.id), 'oldest marker is recycled');
assert.deepEqual(cap.markers.placed.at(-1), { ...cap.markers.placed.at(-1), x: 1, y: 4, kind: 'cross' });
assert.match(cap.message, /recycled/i);

// Input: E places an arrow, Q places a cross, on the simulation tick only, and each press is consumed once.
const inp = fixture();
inp.input.justPressed.add('KeyE');
assert.equal(updateMarkerInput(inp), true);
assert.equal(inp.markers.placed[0].kind, 'arrow');
assert.equal(inp.input.justPressed.has('KeyE'), false, 'press is consumed');
assert.equal(updateMarkerInput(inp), false, 'nothing placed without a new press');
inp.player.tx = 4; inp.player.px = 4.5; inp.input.justPressed.add('KeyQ');
updateMarkerInput(inp);
assert.equal(inp.markers.placed[1].kind, 'cross');
assert.equal(inp.markers.placed.length, 2);

// Placement is ignored after the run is won and never reaches the online outbox or the pickup ledger.
const won = fixture(); won.player.won = true; won.input.justPressed.add('KeyE');
assert.equal(updateMarkerInput(won), false);
assert.equal(won.markers.placed.length, 0);
assert.equal(inp.online.outbox.length, 0, 'solo tags never touch the relay outbox');
assert.equal(inp.map.pickups.length, 0);

// Markers survive death; they are the player's route memory.
const dead = fixture(); placeMarker(dead, 'arrow');
const snapshot = JSON.stringify(dead.markers);
Object.assign(dead.player, { px: 1.5, py: 1.5, tx: 1, ty: 1, hearts: 3 });
assert.equal(JSON.stringify(dead.markers), snapshot);


// Online: a placed tag is relayed as one event carrying exactly the fields the rival needs.
const on = fixture(); on.online.enabled = true; on.player.yaw = Math.PI;
const relayed = placeMarker(on, 'arrow');
assert.deepEqual(on.online.outbox, [{ type: 'marker_placed', id: relayed.id, kind: 'arrow', x: 3, y: 3, dir: 'down' }]);

// Rival tags land in a separate ledger with the same cap and same-tile rule, and are validated on the way in.
const rx = fixture();
assert.equal(applyRemoteMarker(rx, { id: 1, kind: 'arrow', x: 2, y: 2, dir: 'left' }), true);
assert.deepEqual(rx.markers.remote, [{ id: 1, kind: 'arrow', x: 2, y: 2, dir: 'left' }]);
assert.equal(applyRemoteMarker(rx, { id: 2, kind: 'cross', x: 2, y: 2, dir: 'up' }), true);
assert.equal(rx.markers.remote.length, 1, 'same tile replaces');
assert.equal(rx.markers.remote[0].kind, 'cross');
for (const bad of [
  null, {}, { id: 3, kind: 'skull', x: 1, y: 1, dir: 'up' }, { id: 3, kind: 'arrow', x: 1.5, y: 1, dir: 'up' },
  { id: 3, kind: 'arrow', x: 99, y: 1, dir: 'up' }, { id: 3, kind: 'arrow', x: -1, y: 1, dir: 'up' },
  { id: 3, kind: 'arrow', x: 1, y: 1, dir: 'sideways' }, { id: 'x', kind: 'arrow', x: 1, y: 1, dir: 'up' },
]) assert.equal(applyRemoteMarker(rx, bad), false, 'rejects ' + JSON.stringify(bad));
assert.equal(rx.markers.remote.length, 1);
for (let i = 0; i < MARKER_LIMIT + 2; i++) applyRemoteMarker(rx, { id: 10 + i, kind: 'arrow', x: 1 + (i % 7), y: 1 + Math.floor(i / 7), dir: 'up' });
assert.equal(rx.markers.remote.length, MARKER_LIMIT, 'rival ledger is capped like the local one');
assert.equal(rx.markers.placed.length, 0, 'rival tags never enter the local ledger');
assert.equal(rx.online.outbox.length, 0, 'applying a rival tag is never re-relayed');

console.log('Illuminauts marker tests passed.');
