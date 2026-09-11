import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { visualRailSegments } from '../scripts/render/table.js';
import { tableRails } from '../scripts/physics/table-layout.js';
import { W, L, GOAL, RAIL, CONTACT_R, PUCK_R } from '../scripts/config.js';
import { PHYSICS_MALLET_RADIUS } from '../scripts/cosmetics/catalog.js';
import { defaultLoadout, normalizeLoadout } from '../scripts/cosmetics/loadout.js';
import { MALLET_GROUPS, TABLE_GROUPS, allFields, readPath, writePath } from '../scripts/garage/garage-fields.js';

// Two rules this cabinet must not be able to break:
//
//   1. A cosmetic cannot change how the game plays.
//   2. A player can dress their own half of the table and nobody else's.
//
// Both are asserted structurally here rather than promised in a comment.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('the gameplay mallet radius is a physics constant the garage mirrors, not one it sets', () => {
    assert.equal(PHYSICS_MALLET_RADIUS, CONTACT_R - PUCK_R);
    assert.match(read('scripts/physics/world.js'), /new CANNON\.Cylinder\(\.73, \.73, \.36, 32\)/);
});

test('no garage field can reach a gameplay quantity', () => {
    const forbidden = /\b(restitution|friction|mass|linearDamping|angularDamping|MAX_SPEED|CONTACT_R|PUCK_R|GOAL_CAPTURE|strikePower)\b/;
    for (const path of ['scripts/cosmetics/catalog.js', 'scripts/cosmetics/loadout.js', 'scripts/garage/garage-store.js', 'scripts/garage/garage-fields.js']) {
        const source = read(path).split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        assert.doesNotMatch(source.join('\n'), forbidden, `${path} names a gameplay quantity`);
    }
});

test('the physics layer never imports a cosmetic', () => {
    for (const path of ['scripts/physics/world.js', 'scripts/physics/simulation.js', 'scripts/physics/collisions.js', 'scripts/physics/table-layout.js', 'scripts/core/match.js']) {
        assert.doesNotMatch(read(path), /cosmetics\/|garage\//, `${path} imports cosmetic code`);
    }
});

test('every editable geometry value is inside the mallet, whatever it is set to', () => {
    // The visual footprint may differ from the gameplay reach — that is the
    // whole point of the overlay — but it may not run away with the table.
    const extremes = allFields()
        .filter(field => field.kind === 'slider' && field.path.startsWith('mallet.geometry.'))
        .reduce((loadout, field) => writePath(loadout, field.path, field.bounds.max), defaultLoadout());
    const geometry = normalizeLoadout(extremes).mallet.geometry;
    for (const value of Object.values(geometry)) {
        if (typeof value === 'number') assert.ok(value <= 0.9, `geometry value ${value} is larger than a mallet`);
    }
});

test('the physics rails are unchanged by the visual subdivision', () => {
    const rails = tableRails();
    // The same ten walls the cabinet shipped with, in the same places: two
    // side rails, four end segments either side of the goals, four deflectors.
    assert.equal(rails.length, 10);
    assert.deepEqual(rails[0], { x: -W / 2 - RAIL / 2, z: 0, sx: RAIL, sz: L + RAIL * 2, rot: 0 });
    assert.equal(rails.filter(rail => rail.sx === (W - GOAL) / 2).length, 4);
});

test('every visual rail segment belongs to exactly one half, or to the neutral centre', () => {
    const segments = visualRailSegments();
    assert.ok(segments.length > tableRails().length, 'the side rails are subdivided');
    for (const segment of segments) {
        assert.ok(['player', 'cpu', 'center'].includes(segment.side));
        if (segment.side === 'player') assert.ok(segment.z > 0, 'a player segment sits in the player half');
        if (segment.side === 'cpu') assert.ok(segment.z < 0, 'a cpu segment sits in the opponent half');
        if (segment.side === 'center') assert.equal(segment.z, 0);
    }
});

test('the visual segments cover the same span as the physics side rails', () => {
    const segments = visualRailSegments().filter(segment => segment.sx === RAIL);
    const left = segments.filter(segment => segment.x < 0);
    assert.equal(left.reduce((total, segment) => total + segment.sz, 0).toFixed(4), (L + RAIL * 2).toFixed(4));
});

test('the editor addresses only the player half, and there is no side selector', () => {
    for (const field of allFields()) {
        assert.match(field.path, /^(mallet|tableHalf)\./, `unexpected editor path: ${field.path}`);
    }
    const source = read('scripts/garage/garage-screen.js') + read('scripts/garage/garage-fields.js') + read('index.html');
    assert.doesNotMatch(source, /opponentHalf|side\s*[:=]\s*['"]cpu['"]|Side [AB]/i);
});

test('the table renderer only ever writes the side it was handed', () => {
    const source = read('scripts/render/table.js');
    // `sides` is the only map from a side name to materials, and every write in
    // applyHalfAppearance goes through the `target` it resolves.
    const body = source.slice(source.indexOf('function applyHalfAppearance'), source.indexOf('function clearHalfAppearance'));
    assert.doesNotMatch(body, /playerGoalMat|cpuGoalMat|playerSideAccentMat|cpuSideAccentMat|fieldPlayer|fieldCpu/);
    assert.match(body, /const target = sides\[side\]/);
});

test('the editor groups are the ones the Garage advertises', () => {
    assert.deepEqual(MALLET_GROUPS.map(group => group.name), ['Chassis', 'Shape', 'Material', 'Colors', 'Hardware', 'Decal']);
    assert.deepEqual(TABLE_GROUPS.map(group => group.name), ['Surface', 'Pattern', 'Markings', 'Rails', 'Goal', 'Trim']);
});

// Editor paths address ONE LOADOUT — `mallet.*` and `tableHalf.*` — never the
// document that holds the list of them. That is what keeps the controls the same
// whichever slot is equipped.
test('every control addresses a real field of a loadout', () => {
    const garage = defaultLoadout();
    for (const field of allFields()) {
        assert.notEqual(readPath(garage, field.path), undefined, `dead editor path: ${field.path}`);
        if (field.kind === 'slider') {
            assert.equal(typeof readPath(garage, field.path), 'number', field.path);
            assert.ok(field.bounds.min < field.bounds.max, field.path);
        }
        if (field.kind === 'color') assert.match(readPath(garage, field.path), /^#[0-9a-f]{6}$/);
        if (field.kind === 'toggle') assert.equal(typeof readPath(garage, field.path), 'boolean');
    }
});

test('writePath leaves the source document untouched', () => {
    const before = defaultLoadout();
    const after = writePath(before, 'mallet.colors.primary', '#123456');
    assert.equal(before.mallet.colors.primary, '#a14848');
    assert.equal(after.mallet.colors.primary, '#123456');
});
