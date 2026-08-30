const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const maps = require('../map-catalog.js');
const serverPath = path.resolve(__dirname, '../../../../factory-network-server/games/hide-and-seek/server/hide-and-seek-match-engine.mjs');

// Exercise the actual network server composition when its sibling checkout is available. Delayed
// in-memory packets simulate two independent viewers; neither viewer runs a pickup authority.
for (const map of maps.playableMaps()) {
  test(`${map.id}: server placements and one contested claim converge under snapshot latency`, { skip: !fs.existsSync(serverPath) }, async () => {
    const api = await import(pathToFileURL(serverPath).href);
    const THREE = await import('../vendor/three.module.js');
    const { createFlashlightPickups } = await import('../modules/flashlight-pickups.js');
    const lobby = { roomCode: 'LOOT', seed: 'flashlight-test', members: new Set(['a', 'b', 'c']), settings: { mapId: map.id } };
    const match = api.createHideAndSeekMatchState(lobby, 0);
    const first = api.serializeHideAndSeekMatch(match, 0);
    assert.ok(first.pickups.length > 0, 'server mirror must seed floor pickups');
    assert.deepEqual(first.pickups, api.serializeHideAndSeekMatch(api.createHideAndSeekMatchState(lobby, 0), 0).pickups);
    assert.notDeepEqual(first.pickups, api.serializeHideAndSeekMatch(api.createHideAndSeekMatchState({ ...lobby, seed: 'another-round' }, 0), 0).pickups);
    const clients = [2, 7].map(delay => ({ delay, queue: [], lastTick: -1, renderer: createFlashlightPickups({
      THREE, scene: new THREE.Scene(), world: { collections: { interactables: [] } }, player: {},
      logic: { createFloorPickups() { assert.fail('online clients must not roll their own loot'); } },
    }) }));
    const publish = (time, snapshot) => {
      for (const client of clients) client.queue.push({ at: time + client.delay, snapshot: structuredClone(snapshot) });
    };
    const deliver = time => {
      for (const client of clients) while (client.queue[0]?.at <= time) {
        const packet = client.queue.shift().snapshot;
        if (packet.tick < client.lastTick) continue;
        client.lastTick = packet.tick;
        client.renderer.applySnapshot(packet.pickups);
      }
    };
    publish(0, first);
    deliver(7);
    assert.deepEqual(clients[0].renderer.getState(), clients[1].renderer.getState());
    const pickup = match.state.pickups[0];
    const contenders = match.state.bodies.filter(body => body.id !== match.seekerId);
    // Stage both living hiders at a legal authored point on the authority, never through input.
    match.state = { ...match.state, demons: [], bodies: match.state.bodies.map(body => body.id === match.seekerId ? body : {
      ...body, x: pickup.x, y: pickup.y, z: pickup.z, floor: pickup.floor, flashlight: { on: false, charge: 0.1 },
    }) };
    for (const body of contenders) api.applyHideAndSeekInput(match, body.id, { pickupId: pickup.id, pickups: [], flashlightCharge: 1 });
    match.state = match.engine.tick(match.state, 1 / 60, Object.fromEntries(match.inputs));
    const after = api.serializeHideAndSeekMatch(match, 20);
    assert.equal(after.pickups.some(p => p.id === pickup.id), false);
    assert.equal(after.players.filter(p => p.id !== match.seekerId && p.flashlight.charge > 0.1).length, 1);
    publish(8, after);
    deliver(10);
    assert.equal(clients[0].renderer.getState().some(p => p.id === pickup.id), false);
    assert.equal(clients[1].renderer.getState().some(p => p.id === pickup.id), true, 'slow viewer awaits authority');
    deliver(15);
    assert.deepEqual(clients[0].renderer.getState(), after.pickups);
    assert.deepEqual(clients[1].renderer.getState(), after.pickups);
    api.applyHideAndSeekReconnect(match, contenders[1].id);
    assert.deepEqual(api.serializeHideAndSeekMatch(match, 30).pickups, after.pickups, 'reconnect cannot replenish consumed loot');
  });
}
