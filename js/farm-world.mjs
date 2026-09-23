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
import { celestialOrbit, generateStarField } from "./farm-sky.mjs";
import { farmLightProfile } from "./farm-time.mjs";
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
function canvasTexture(THREE, size, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    draw(context, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
function createStarTexture(THREE) {
    return canvasTexture(THREE, 32, (context, size) => {
        const centre = size / 2;
        const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(0.16, "rgba(255,255,255,1)");
        glow.addColorStop(0.42, "rgba(220,232,255,.72)");
        glow.addColorStop(1, "rgba(190,215,255,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, size, size);
    });
}
function createStars(THREE) {
    const root = new THREE.Group();
    root.name = "farm-stars";
    const texture = createStarTexture(THREE);
    const styles = Object.freeze({
        faint: Object.freeze({ size: 0.42, opacity: 0.54 }),
        medium: Object.freeze({ size: 0.72, opacity: 0.74 }),
        bright: Object.freeze({ size: 1.08, opacity: 0.95 }),
    });
    const stars = generateStarField(520);
    for (const tier of ["faint", "medium", "bright"]) {
        const positions = [];
        const colors = [];
        for (const star of stars) {
            if (star.size !== tier)
                continue;
            positions.push(star.x * 112, star.y * 112, star.z * 112);
            const cool = new THREE.Color(star.warmth > 0.82 ? 0xffedcf : star.warmth < 0.18 ? 0xc9ddff : 0xf2f5ff);
            colors.push(cool.r, cool.g, cool.b);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        const style = styles[tier];
        const material = new THREE.PointsMaterial({ map: texture, size: style.size, vertexColors: true, transparent: true, opacity: 0, alphaTest: 0.02, depthWrite: false, fog: false });
        const points = new THREE.Points(geometry, material);
        points.userData.nightOpacity = style.opacity;
        points.renderOrder = -1;
        root.add(points);
    }
    return root;
}
function createSunTexture(THREE) {
    return canvasTexture(THREE, 128, (context, size) => {
        const centre = size / 2;
        const glow = context.createRadialGradient(centre - 8, centre - 10, 2, centre, centre, centre);
        glow.addColorStop(0, "rgba(255,255,245,1)");
        glow.addColorStop(0.34, "rgba(255,245,194,1)");
        glow.addColorStop(0.51, "rgba(255,196,91,.96)");
        glow.addColorStop(0.62, "rgba(255,177,65,.32)");
        glow.addColorStop(1, "rgba(255,150,40,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, size, size);
    });
}
function createMoonTexture(THREE) {
    return canvasTexture(THREE, 128, (context, size) => {
        const centre = size / 2;
        const radius = 43;
        context.save();
        context.beginPath();
        context.arc(centre, centre, radius, 0, Math.PI * 2);
        context.clip();
        const face = context.createRadialGradient(centre - 15, centre - 17, 4, centre, centre, radius);
        face.addColorStop(0, "#fffdf1");
        face.addColorStop(0.62, "#e8e9dc");
        face.addColorStop(1, "#aeb7c1");
        context.fillStyle = face;
        context.fillRect(0, 0, size, size);
        context.globalAlpha = 0.18;
        context.fillStyle = "#73808b";
        for (const [x, y, r] of [[43, 44, 8], [78, 38, 5], [83, 72, 10], [50, 82, 5], [64, 59, 4]]) {
            context.beginPath();
            context.arc(x, y, r, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    });
}
function createCelestialSprite(THREE, texture, scale, name, additive = false) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material);
    sprite.name = name;
    sprite.scale.set(scale, scale, 1);
    return sprite;
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
    const sky = createSkyDome(THREE);
    const stars = createStars(THREE);
    const sunVisual = createCelestialSprite(THREE, createSunTexture(THREE), 15, "farm-sun", true);
    const moonVisual = createCelestialSprite(THREE, createMoonTexture(THREE), 8, "farm-moon");
    scene.add(sky);
    scene.add(stars);
    scene.add(sunVisual);
    scene.add(moonVisual);
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
    const moon = new THREE.DirectionalLight(0xbfd8ff, 0.8);
    moon.position.set(18, 22, -12);
    scene.add(moon);
    scene.add(moon.target);
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
    const scenery = createFarmScenery(THREE, scene);
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
    function setTime(minutes) {
        const profile = farmLightProfile(minutes);
        const horizon = new THREE.Color(profile.horizon);
        sky.material.uniforms.horizon.value.copy(horizon);
        sky.material.uniforms.zenith.value.set(profile.zenith);
        scene.background.copy(horizon);
        scene.fog.color.set(profile.fog);
        hemisphere.intensity = profile.hemisphere;
        sun.color.set(profile.sunColor);
        sun.intensity = profile.sun;
        moon.color.set(profile.moonColor);
        moon.intensity = profile.moon;
        for (const tier of stars.children)
            tier.material.opacity = profile.stars * tier.userData.nightOpacity;
        const orbit = celestialOrbit(minutes);
        sun.position.set(orbit.sun.x * 42, orbit.sun.y * 42, orbit.sun.z * 42);
        moon.position.set(orbit.moon.x * 42, orbit.moon.y * 42, orbit.moon.z * 42);
        sunVisual.position.set(orbit.sun.x * 126, orbit.sun.y * 126, orbit.sun.z * 126);
        moonVisual.position.set(orbit.moon.x * 126, orbit.moon.y * 126, orbit.moon.z * 126);
        sunVisual.visible = profile.sun > 0.02 && orbit.sun.y > -0.035;
        moonVisual.visible = profile.moon > 0.02 && orbit.moon.y > -0.035;
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
        setTime,
    });
}
