// The farm's scenery: everything the eye sees that is not on the layout and
// cannot be placed — the countryside beyond the fence and the grass underfoot.
//
// Beyond the fence: a ring of rolling hills that the fog softens into the sky,
// a treeline between the hills and the field so the horizon is never a flat
// edge, a few clouds that drift, and the sun itself. Underfoot: thousands of
// grass tufts and a scatter of wildflowers as ONE instanced mesh each, kept
// off every building, pond and solid prop (`rescatter(layout)` re-lays them
// after a build), so the field reads as a meadow and not a green carpet.
//
// Every position comes from a seeded generator, so the same farm looks the
// same on every load. No art assets, and nothing here is saved.
import { standard } from "./arcade-room-decor-primitives.mjs";
import { FARM_BOUNDS } from "./farm-layout.mjs";
import { groundCoverExclusions } from "./farm-scene.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";
export const SCENERY = Object.freeze({
    /** How many tufts and flowers the field carries; positions are fixed, a build only hides the ones under something. */
    tufts: 2600,
    flowers: 320,
    /** Where the treeline and the hills stand from the field's centre. */
    treelineRadius: Object.freeze({ min: 24, max: 40 }),
    hillRadius: Object.freeze({ min: 55, max: 95 }),
    clouds: 9,
});
/** A tiny deterministic generator so the countryside is the same on every load. */
function seeded(seed) {
    let n = (seed * 9301 + 49297) % 233280;
    return () => {
        n = (n * 9301 + 49297) % 233280;
        return n / 233280;
    };
}
/** The ring of hills: big flattened spheres in muted greens, further ones bluer, all softened by the fog. */
function createHills(THREE, scene, random) {
    const near = standard(THREE, "#4f7a3a", 1, 0);
    const mid = standard(THREE, "#5a8a5a", 1, 0);
    const far = standard(THREE, "#6f9a8a", 1, 0);
    const count = 26;
    for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + random() * 0.2;
        const radius = SCENERY.hillRadius.min + random() * (SCENERY.hillRadius.max - SCENERY.hillRadius.min);
        const width = 22 + random() * 30;
        const height = 6 + random() * 10;
        const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), radius > 80 ? far : radius > 68 ? mid : near);
        hill.scale.set(width, height, width * 0.8);
        hill.position.set(Math.cos(angle) * radius, -height * 0.25, Math.sin(angle) * radius);
        hill.receiveShadow = true;
        scene.add(hill);
    }
}
/** A treeline past the fence: cheap cone-and-sphere trees, denser than the field's, in two staggered rings. */
function createTreeline(THREE, scene, random) {
    const needles = standard(THREE, "#2f6b3a", 0.95, 0);
    const needlesLight = standard(THREE, "#3f7f44", 0.95, 0);
    const leaves = standard(THREE, "#3f7f34", 0.95, 0);
    const trunk = standard(THREE, "#4a3220", 0.95, 0);
    const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
    const sphereGeometry = new THREE.SphereGeometry(1, 10, 8);
    const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.25, 1, 6);
    const count = 120;
    for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + random() * 0.05;
        const radius = SCENERY.treelineRadius.min + random() * (SCENERY.treelineRadius.max - SCENERY.treelineRadius.min);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const tree = new THREE.Group();
        const stem = new THREE.Mesh(trunkGeometry, trunk);
        const pine = random() < 0.55;
        if (pine) {
            const height = 5 + random() * 4;
            stem.scale.set(1, 2, 1);
            stem.position.y = 1;
            const crown = new THREE.Mesh(coneGeometry, random() < 0.5 ? needles : needlesLight);
            crown.scale.set(1.6 + random() * 0.8, height, 1.6 + random() * 0.8);
            crown.position.y = 1.5 + height / 2;
            crown.castShadow = true;
            tree.add(stem, crown);
        }
        else {
            const size = 2.2 + random() * 1.6;
            stem.scale.set(1.4, 3, 1.4);
            stem.position.y = 1.5;
            const crown = new THREE.Mesh(sphereGeometry, leaves);
            crown.scale.set(size, size * 0.85, size);
            crown.position.y = 3 + size * 0.6;
            crown.castShadow = true;
            tree.add(stem, crown);
        }
        tree.position.set(x, 0, z);
        tree.rotation.y = random() * Math.PI * 2;
        scene.add(tree);
    }
}
/** Clouds: clusters of flattened spheres, self-lit so the fog never greys them, drifting slowly downwind. */
function createClouds(THREE, scene, random) {
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 1, metalness: 0, fog: false, transparent: true, opacity: 0.94 });
    const geometry = new THREE.SphereGeometry(1, 12, 8);
    const clouds = [];
    for (let index = 0; index < SCENERY.clouds; index += 1) {
        const cloud = new THREE.Group();
        const puffs = 3 + Math.floor(random() * 3);
        const size = 5 + random() * 6;
        for (let puff = 0; puff < puffs; puff += 1) {
            const mesh = new THREE.Mesh(geometry, material);
            const spread = (puff - (puffs - 1) / 2) * size * 0.75;
            const scale = size * (0.6 + random() * 0.5);
            mesh.scale.set(scale, scale * 0.45, scale * 0.8);
            mesh.position.set(spread, random() * size * 0.15, (random() - 0.5) * size * 0.4);
            cloud.add(mesh);
        }
        const angle = random() * Math.PI * 2;
        const radius = 50 + random() * 70;
        cloud.position.set(Math.cos(angle) * radius, 34 + random() * 22, Math.sin(angle) * radius);
        cloud.userData.speed = 0.6 + random() * 0.6;
        scene.add(cloud);
        clouds.push(cloud);
    }
    return clouds;
}
/** The sun: a bright disc with a soft halo, placed along the directional light's own bearing. */
function createSun(THREE, scene, direction) {
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const at = { x: direction.x / length * 125, y: direction.y / length * 125, z: direction.z / length * 125 };
    const disc = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff6d8", fog: false }));
    disc.position.set(at.x, at.y, at.z);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffe9b8", fog: false, transparent: true, opacity: 0.22, depthWrite: false }));
    halo.position.set(at.x, at.y, at.z);
    scene.add(disc, halo);
}
/** Five blades in a clump: thin tapered triangles leaning out from a shared root, merged into one geometry. */
function createTuftGeometry(THREE) {
    const positions = [];
    const blades = 5;
    for (let index = 0; index < blades; index += 1) {
        const angle = (index / blades) * Math.PI * 2 + 0.4;
        const lean = 0.35 + (index % 2) * 0.15;
        const height = 0.16 + (index % 3) * 0.03;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        // Root is a short base across the lean direction; the tip leans out and up.
        const half = 0.014;
        const tipX = dx * lean * height;
        const tipZ = dz * lean * height;
        positions.push(-dz * half, 0, dx * half, dz * half, 0, -dx * half, tipX, height, tipZ);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}
function sprinkle(count, random) {
    const halfWidth = FARM_BOUNDS.width / 2 - FARM_BOUNDS.wallInset - 0.4;
    const halfDepth = FARM_BOUNDS.depth / 2 - FARM_BOUNDS.wallInset - 0.4;
    const out = [];
    for (let index = 0; index < count; index += 1) {
        out.push({
            x: (random() * 2 - 1) * halfWidth,
            z: (random() * 2 - 1) * halfDepth,
            scale: 0.7 + random() * 0.7,
            lean: (random() - 0.5) * 0.5,
            turn: random() * Math.PI * 2,
            tone: random(),
        });
    }
    return out;
}
export function createFarmScenery(THREE, scene, options) {
    const random = seeded(2026);
    createHills(THREE, scene, random);
    createTreeline(THREE, scene, random);
    const clouds = createClouds(THREE, scene, random);
    createSun(THREE, scene, options.sunDirection);
    // Ground cover: one instanced mesh of tufts, one of flowers. A tuft is a clump of
    // five thin blades leaning apart — cheap, and from eye height it reads as grass.
    const tuftGeometry = createTuftGeometry(THREE);
    const tuftMaterial = new THREE.MeshStandardMaterial({ color: "#7fbf52", roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, SCENERY.tufts);
    tufts.receiveShadow = true;
    tufts.name = "farm-tufts";
    scene.add(tufts);
    const flowerGeometry = new THREE.SphereGeometry(0.032, 6, 5);
    flowerGeometry.translate(0, 0.13, 0);
    const flowerMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7, metalness: 0 });
    const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, SCENERY.flowers);
    flowers.name = "farm-flowers";
    scene.add(flowers);
    const stemGeometry = new THREE.CylinderGeometry(0.006, 0.008, 0.13, 4);
    stemGeometry.translate(0, 0.065, 0);
    const stems = new THREE.InstancedMesh(stemGeometry, new THREE.MeshStandardMaterial({ color: "#4f9a3a", roughness: 0.95 }), SCENERY.flowers);
    stems.name = "farm-flower-stems";
    scene.add(stems);
    const tuftSpots = sprinkle(SCENERY.tufts, random);
    const flowerSpots = sprinkle(SCENERY.flowers, random);
    const tuftTones = ["#7fbf52", "#6fae48", "#8dc45a", "#9ad264"].map((hex) => new THREE.Color(hex));
    const flowerTones = ["#ffffff", "#ffd33d", "#ff8fb0", "#c084fc", "#ff9a3c"].map((hex) => new THREE.Color(hex));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    function lay(mesh, spots, blocked, tones, size) {
        let count = 0;
        for (const spot of spots) {
            if (blocked(spot))
                continue;
            position.set(spot.x, 0, spot.z);
            euler.set(spot.lean, spot.turn, spot.lean * 0.6);
            quaternion.setFromEuler(euler);
            scale.set(...size(spot));
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(count, matrix);
            mesh.setColorAt(count, tones[Math.floor(spot.tone * tones.length)]);
            count += 1;
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
    }
    function rescatter(layout) {
        const exclusions = groundCoverExclusions(layout);
        const blocked = (spot) => exclusions.some((box) => obstacleBlocks(spot, box, 0.15));
        lay(tufts, tuftSpots, blocked, tuftTones, (spot) => [spot.scale, spot.scale, spot.scale]);
        lay(flowers, flowerSpots, blocked, flowerTones, (spot) => [spot.scale * 0.8, spot.scale * 0.6, spot.scale * 0.8]);
        lay(stems, flowerSpots, blocked, [new THREE.Color("#4f9a3a")], (spot) => [1, spot.scale, 1]);
    }
    function update(dt) {
        for (const cloud of clouds) {
            cloud.position.x += dt * cloud.userData.speed;
            // Wrap around a wide box so the sky never runs out of clouds.
            if (cloud.position.x > 140)
                cloud.position.x = -140;
        }
    }
    return Object.freeze({ rescatter, update });
}
