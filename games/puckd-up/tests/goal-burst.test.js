import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoalBurst } from '../scripts/render/goal-burst.js';

class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
}
class BufferGeometry {
    constructor() { this.attributes = {}; this.disposed = false; }
    setAttribute(name, value) { this.attributes[name] = value; }
    dispose() { this.disposed = true; }
}
class PointsMaterial {
    constructor(options) { Object.assign(this, options); this.disposed = false; }
    dispose() { this.disposed = true; }
}
class Points {
    constructor(geometry, material) { this.geometry = geometry; this.material = material; this.visible = true; }
}
class PointLight {
    constructor(color, intensity) {
        this.color = { value: color, set: value => this.color.value = value };
        this.intensity = intensity;
        this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    }
}
const THREE = { BufferAttribute, BufferGeometry, PointsMaterial, Points, PointLight, AdditiveBlending: 'add' };
function fixture() {
    const scene = { children: [], add(value) { this.children.push(value); }, remove(value) { this.children = this.children.filter(item => item !== value); } };
    const burst = createGoalBurst(THREE, scene, { count: 12, random: () => .5 });
    return { scene, burst, points: scene.children.find(item => item instanceof Points), light: scene.children.find(item => item instanceof PointLight) };
}

test('a goal burst uses the scorer color and explodes from the scored-on goal', () => {
    const { burst, points, light } = fixture();
    burst.handle({ type: 'goal', playerScored: true }, ['#ff2400', '#168cff']);
    assert.equal(points.visible, true);
    assert.ok(light.position.z < 0);
    assert.equal(light.color.value, '#ff2400');
    const colors = points.geometry.attributes.color.array;
    assert.ok(colors[0] > colors[1] && colors[0] > colors[2]);
    const before = [...points.geometry.attributes.position.array];
    burst.tick(.2);
    assert.notDeepEqual([...points.geometry.attributes.position.array], before);
});

test('bursts expire, can be reused for the opponent palette and dispose cleanly', () => {
    const { scene, burst, points, light } = fixture();
    burst.handle({ type: 'goal', playerScored: true }, ['#ff2400', '#168cff']);
    burst.tick(1.1);
    assert.equal(points.visible, false);
    burst.handle({ type: 'goal', playerScored: false }, ['#ff2400', '#168cff']);
    assert.ok(light.position.z > 0);
    assert.equal(light.color.value, '#168cff');
    burst.dispose();
    assert.equal(points.geometry.disposed, true);
    assert.equal(points.material.disposed, true);
    assert.equal(scene.children.length, 0);
});
