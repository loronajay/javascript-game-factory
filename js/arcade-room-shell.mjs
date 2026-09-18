// The room shell — floor, four walls, ceiling, columns and skirting — built
// once and re-dressed whenever the layout's surfaces change.
//
// The page used to hardcode every material here. Now the shell owns the
// meshes and `applySurfaces` swaps their finishes from the catalog, which is
// what lets a floor swatch in build mode change the room under the cursor.
import { findSurface, resolveSurfaceStyle } from "./arcade-room-catalog/surfaces.mjs";
import { applySurfaceMaterial, createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { DEFAULT_SURFACE_IDS } from "./arcade-room-catalog/surfaces.mjs";
export function createRoomShell(THREE, scene, dimensions) {
    const { width, depth, height, wallThickness } = dimensions;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const wallY = height / 2;
    const styleFor = (kind, id, colors = []) => resolveSurfaceStyle(findSurface(kind, id) ?? findSurface(kind, DEFAULT_SURFACE_IDS[kind]), colors);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 20, 20), createSurfaceMaterial(THREE, styleFor("floor", DEFAULT_SURFACE_IDS.floor), { u: width, v: depth }));
    floor.name = "room-floor";
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wallStyle = styleFor("wall", DEFAULT_SURFACE_IDS.wall);
    const makeWall = (name, size, position) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), createSurfaceMaterial(THREE, wallStyle, { u: Math.max(size[0], size[2]), v: height }));
        wall.name = `room-wall-${name}`;
        wall.userData = { wall: name };
        wall.position.set(...position);
        wall.receiveShadow = true;
        scene.add(wall);
        return wall;
    };
    const walls = {
        north: makeWall("north", [width, height, wallThickness], [0, wallY, -halfDepth]),
        south: makeWall("south", [width, height, wallThickness], [0, wallY, halfDepth]),
        east: makeWall("east", [wallThickness, height, depth], [halfWidth, wallY, 0]),
        west: makeWall("west", [wallThickness, height, depth], [-halfWidth, wallY, 0]),
    };
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), createSurfaceMaterial(THREE, styleFor("ceiling", DEFAULT_SURFACE_IDS.ceiling), { u: width, v: depth }));
    ceiling.name = "room-ceiling";
    ceiling.position.set(0, height + 0.09, 0);
    ceiling.receiveShadow = true;
    scene.add(ceiling);
    // Trim: corner columns plus a skirting board along every wall, all one material.
    const trimMaterial = createSurfaceMaterial(THREE, styleFor("trim", DEFAULT_SURFACE_IDS.trim), { u: 1, v: 1 });
    const trimMeshes = [];
    for (const x of [-halfWidth + 0.18, halfWidth - 0.18]) {
        for (const z of [-halfDepth + 0.18, halfDepth - 0.18]) {
            const column = new THREE.Mesh(new THREE.BoxGeometry(0.28, height, 0.28), trimMaterial);
            column.position.set(x, wallY, z);
            column.castShadow = true;
            scene.add(column);
            trimMeshes.push(column);
        }
    }
    const skirtHeight = 0.12;
    const skirtDepth = 0.04;
    for (const [size, position] of [
        [[width, skirtHeight, skirtDepth], [0, skirtHeight / 2, -halfDepth + wallThickness / 2 + skirtDepth / 2]],
        [[width, skirtHeight, skirtDepth], [0, skirtHeight / 2, halfDepth - wallThickness / 2 - skirtDepth / 2]],
        [[skirtDepth, skirtHeight, depth], [halfWidth - wallThickness / 2 - skirtDepth / 2, skirtHeight / 2, 0]],
        [[skirtDepth, skirtHeight, depth], [-halfWidth + wallThickness / 2 + skirtDepth / 2, skirtHeight / 2, 0]],
    ]) {
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(...size), trimMaterial);
        skirt.position.set(...position);
        scene.add(skirt);
        trimMeshes.push(skirt);
    }
    // A ghosted wall is a faint see-through pane rather than nothing: the room keeps
    // its outline, a wall item dragged onto it still has a surface to be read against,
    // and it stops writing depth so nothing behind it is lost. The set is kept so a
    // surface change (which swaps the material) does not silently un-ghost a wall.
    let ghosted = new Set();
    const GHOST_OPACITY = 0.14;
    function applyGhost(side) {
        const wall = walls[side];
        const ghost = ghosted.has(side);
        wall.material.transparent = ghost;
        wall.material.opacity = ghost ? GHOST_OPACITY : 1;
        wall.material.depthWrite = !ghost;
        wall.material.needsUpdate = true;
        wall.receiveShadow = !ghost;
        wall.castShadow = false;
    }
    function setCutawayWalls(hidden) {
        ghosted = new Set(hidden);
        for (const side of Object.keys(walls))
            applyGhost(side);
    }
    // What each face is dressed in right now — the finish id plus its paint — so a
    // re-dress only redraws the faces that changed.
    const NO_COLORS = Object.freeze({ floor: [], wall: [], ceiling: [], trim: [] });
    const dressing = (kind, surfaces, colors) => `${surfaces[kind]}|${colors[kind].join(",")}`;
    const current = {
        floor: dressing("floor", DEFAULT_SURFACE_IDS, NO_COLORS),
        wall: dressing("wall", DEFAULT_SURFACE_IDS, NO_COLORS),
        ceiling: dressing("ceiling", DEFAULT_SURFACE_IDS, NO_COLORS),
        trim: dressing("trim", DEFAULT_SURFACE_IDS, NO_COLORS),
    };
    function applySurfaces(surfaces, colors = NO_COLORS) {
        const changed = (kind) => {
            const next = dressing(kind, surfaces, colors);
            if (next === current[kind])
                return false;
            current[kind] = next;
            return true;
        };
        if (changed("floor"))
            applySurfaceMaterial(THREE, floor, styleFor("floor", surfaces.floor, colors.floor), { u: width, v: depth });
        if (changed("wall")) {
            const style = styleFor("wall", surfaces.wall, colors.wall);
            for (const wall of [walls.north, walls.south])
                applySurfaceMaterial(THREE, wall, style, { u: width, v: height });
            for (const wall of [walls.east, walls.west])
                applySurfaceMaterial(THREE, wall, style, { u: depth, v: height });
            for (const side of Object.keys(walls))
                applyGhost(side);
        }
        if (changed("ceiling"))
            applySurfaceMaterial(THREE, ceiling, styleFor("ceiling", surfaces.ceiling, colors.ceiling), { u: width, v: depth });
        if (changed("trim")) {
            const material = createSurfaceMaterial(THREE, styleFor("trim", surfaces.trim, colors.trim), { u: 1, v: 1 });
            const previous = trimMeshes[0]?.material;
            for (const mesh of trimMeshes)
                mesh.material = material;
            previous?.dispose?.();
        }
    }
    return Object.freeze({
        floor,
        ceiling,
        walls: Object.freeze(walls),
        wallMeshes: Object.freeze([walls.north, walls.south, walls.east, walls.west]),
        applySurfaces,
        setCutawayWalls,
    });
}
