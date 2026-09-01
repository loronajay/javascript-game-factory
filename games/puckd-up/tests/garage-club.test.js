import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGarageClub } from '../scripts/render/venues/garage-club.js';

class Transform {
    set(...values) { this.values = values; }
}

class Group {
    constructor() { this.children = []; this.userData = {}; }
    add(child) { this.children.push(child); }
}

class BoxGeometry {
    constructor(...size) { this.size = size; }
}

class CylinderGeometry {
    constructor(...size) { this.size = size; }
}

class MeshStandardMaterial {
    constructor(options) { Object.assign(this, options); this.userData = {}; }
}

class Mesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.position = new Transform();
        this.rotation = new Transform();
    }
}

class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
        super(geometry, material);
        this.count = count;
        this.instanceMatrix = {};
    }
    setMatrixAt() {}
}

class Object3D {
    constructor() {
        this.position = new Transform();
        this.scale = new Transform();
        this.rotation = new Transform();
        this.matrix = {};
    }
    updateMatrix() {}
}

class PointLight {
    constructor() { this.position = new Transform(); }
}

const THREE = { Group, BoxGeometry, CylinderGeometry, MeshStandardMaterial, Mesh, InstancedMesh, Object3D, PointLight };

test('Garage Club leaves the overhead camera sightline open', () => {
    const venue = buildGarageClub(THREE);
    const roofOccluders = venue.children.filter(child => {
        const [width = 0, , depth = 0] = child.geometry?.size || [];
        const [, y = 0] = child.position?.values || [];
        return y > 5 && width >= 18 && depth >= 20;
    });

    assert.deepEqual(roofOccluders, [], 'a solid roof over the table renders as a grey slab from the elevated game camera');
});
