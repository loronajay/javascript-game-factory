// The farm's world — sky, sun, the field, and every placed thing on it — built
// once and kept in step with the layout.
//
// The room's shell is four walls and a ceiling; the farm's is a sky. Both own
// their meshes and expose `apply*`/`sync` calls so a swatch or a drag in build
// mode changes the world under the cursor. The field's material comes from the
// same procedural surface renderer the room's floors use, and every prop from
// `farm-props.mts`.
//
// `sync(layout)` is the decor runtime: a row it has never seen is built, a row
// whose item or length changed is rebuilt, a row that only moved is re-posed,
// and a row that is gone is disposed. Building is the expensive part, so a
// drag costs nothing but a `position.set`.
import { createSurfaceMaterial, applySurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { DEFAULT_GROUND_ID, findGround } from "./farm-catalog/ground.mjs";
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { FARM_BOUNDS } from "./farm-layout.mjs";
import { createFarmDecorModel } from "./farm-props.mjs";
import { createFarmScenery } from "./farm-scenery.mjs";
export const SKY = Object.freeze({
    /** The colour at the horizon and at the zenith; the dome blends between them. */
    horizon: "#dbe9f4",
    zenith: "#5aa0e0",
    /** Distance fog in the horizon colour so the fence line softens into the sky. */
    fog: Object.freeze({ near: 30, far: 90 }),
});
function groundStyle(groundId) {
    return (findGround(groundId) ?? findGround(DEFAULT_GROUND_ID)).style;
}
function createSkyDome(THREE) {
    // A big inside-out sphere with a vertex-height gradient; unlit and fog-free so it reads as sky.
    const material = new THREE.ShaderMaterial({
        uniforms: {
            horizon: { value: new THREE.Color(SKY.horizon) },
            zenith: { value: new THREE.Color(SKY.zenith) },
        },
        vertexShader: `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 zenith;
      varying float vHeight;
      void main() {
        float t = clamp(vHeight * 1.6, 0.0, 1.0);
        t = t * t * (3.0 - 2.0 * t);
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
      }
    `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), material);
    dome.name = "farm-sky";
    return dome;
}
function disposeModel(group) {
    group.traverse((object) => {
        object.geometry?.dispose?.();
        const material = object.material;
        if (Array.isArray(material))
            material.forEach((entry) => entry?.dispose?.());
        else
            material?.dispose?.();
    });
    group.parent?.remove(group);
}
export function createFarmWorld(THREE, scene) {
    const { width, depth } = FARM_BOUNDS;
    scene.background = new THREE.Color(SKY.horizon);
    scene.fog = new THREE.Fog(SKY.horizon, SKY.fog.near, SKY.fog.far);
    scene.add(createSkyDome(THREE));
    // Daylight: a warm sun with a shadow box that covers the field, and a sky/ground fill.
    const hemisphere = new THREE.HemisphereLight(0xd6ecff, 0x5a7a3a, 1.0);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    const sunDirection = { x: -18, y: 26, z: 12 };
    sun.position.set(sunDirection.x, sunDirection.y, sunDirection.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -width * 0.65;
    sun.shadow.camera.right = width * 0.65;
    sun.shadow.camera.top = depth * 0.65;
    sun.shadow.camera.bottom = -depth * 0.65;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    // The field, and a wider apron of the same ground outside it so the edge of
    // the world is past the fog rather than a cliff at the fence line.
    const span = { u: width, v: depth };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 1, 1), createSurfaceMaterial(THREE, groundStyle(DEFAULT_GROUND_ID), span));
    ground.name = "farm-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Wide enough that its edge is past the fog's far plane from anywhere on the field.
    const apronSize = SKY.fog.far * 2 + width;
    const apronSpan = { u: apronSize, v: apronSize };
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(apronSize, apronSize, 1, 1), createSurfaceMaterial(THREE, groundStyle(DEFAULT_GROUND_ID), apronSpan));
    apron.name = "farm-apron";
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.02;
    apron.receiveShadow = true;
    scene.add(apron);
    // The countryside past the fence and the tufts underfoot — nothing the player places.
    const scenery = createFarmScenery(THREE, scene, { sunDirection });
    const decorRoot = new THREE.Group();
    decorRoot.name = "farm-decor";
    scene.add(decorRoot);
    const placed = new Map();
    let seedCounter = 0;
    function needsRebuild(entry, row) {
        return entry.row.itemId !== row.itemId || entry.row.length !== row.length;
    }
    function build(row) {
        const definition = findFarmDecor(row.itemId);
        if (!definition)
            return null;
        seedCounter += 1;
        const model = createFarmDecorModel(THREE, definition, row, seedCounter);
        model.group.name = `farm-${row.instanceId}`;
        decorRoot.add(model.group);
        return { row, group: model.group, doors: model.doors, fixtureDoors: model.fixtureDoors, animate: model.animate };
    }
    function pose(entry, row) {
        entry.group.position.set(row.x, 0, row.z);
        entry.group.rotation.y = row.rotationY;
        entry.row = row;
    }
    function sync(layout) {
        const wanted = new Set();
        for (const row of layout.decor) {
            wanted.add(row.instanceId);
            let entry = placed.get(row.instanceId);
            if (entry && needsRebuild(entry, row)) {
                disposeModel(entry.group);
                placed.delete(row.instanceId);
                entry = undefined;
            }
            if (!entry) {
                const built = build(row);
                if (!built)
                    continue;
                placed.set(row.instanceId, built);
                entry = built;
            }
            pose(entry, row);
        }
        for (const [instanceId, entry] of placed) {
            if (wanted.has(instanceId))
                continue;
            disposeModel(entry.group);
            placed.delete(instanceId);
        }
        scenery.rescatter(layout);
    }
    function update(dt) {
        scenery.update(dt);
        for (const entry of placed.values()) {
            entry.doors?.update(dt);
            for (const doors of Object.values(entry.fixtureDoors))
                doors.update(dt);
            entry.animate?.(dt);
        }
    }
    function applyGround(groundId) {
        const style = groundStyle(groundId);
        applySurfaceMaterial(THREE, ground, style, span);
        applySurfaceMaterial(THREE, apron, style, apronSpan);
    }
    return Object.freeze({
        ground,
        applyGround,
        sync,
        models: () => [...placed.values()].map((entry) => entry.group),
        modelFor: (instanceId) => placed.get(instanceId)?.group,
        doorsFor: (doorId) => {
            const own = placed.get(doorId);
            if (own)
                return own.doors;
            // A fixture door: the longest placed instance id the door id extends names its row, the rest names the fixture.
            for (const [instanceId, entry] of placed) {
                if (!doorId.startsWith(`${instanceId}-`))
                    continue;
                const fixture = entry.fixtureDoors[doorId.slice(instanceId.length + 1)];
                if (fixture)
                    return fixture;
            }
            return null;
        },
        update,
    });
}
