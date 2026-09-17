// The room shell — floor, four walls, ceiling, columns and skirting — built
// once and re-dressed whenever the layout's surfaces change.
//
// The page used to hardcode every material here. Now the shell owns the
// meshes and `applySurfaces` swaps their finishes from the catalog, which is
// what lets a floor swatch in build mode change the room under the cursor.

import { findSurface, type SurfaceKind } from "./arcade-room-catalog/surfaces.mjs";
import { applySurfaceMaterial, createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { DEFAULT_SURFACE_IDS } from "./arcade-room-catalog/surfaces.mjs";
import type { RoomSurfaces, WallSide } from "./arcade-room-layout.mjs";

type ThreeNamespace = Record<string, any>;

export type RoomShellDimensions = Readonly<{ width: number; depth: number; height: number; wallThickness: number }>;

export type RoomShell = Readonly<{
  floor: any;
  ceiling: any;
  walls: Readonly<Record<WallSide, any>>;
  /** The four wall meshes in one array for raycasting. */
  wallMeshes: readonly any[];
  applySurfaces: (surfaces: RoomSurfaces) => void;
}>;

export function createRoomShell(THREE: ThreeNamespace, scene: any, dimensions: RoomShellDimensions): RoomShell {
  const { width, depth, height, wallThickness } = dimensions;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const wallY = height / 2;
  const styleFor = (kind: SurfaceKind, id: string) => (findSurface(kind, id) ?? findSurface(kind, DEFAULT_SURFACE_IDS[kind])!).style;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth, 20, 20),
    createSurfaceMaterial(THREE, styleFor("floor", DEFAULT_SURFACE_IDS.floor), { u: width, v: depth }),
  );
  floor.name = "room-floor";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallStyle = styleFor("wall", DEFAULT_SURFACE_IDS.wall);
  const makeWall = (name: WallSide, size: readonly [number, number, number], position: readonly [number, number, number]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), createSurfaceMaterial(THREE, wallStyle, { u: Math.max(size[0], size[2]), v: height }));
    wall.name = `room-wall-${name}`;
    wall.userData = { wall: name };
    wall.position.set(...position);
    wall.receiveShadow = true;
    scene.add(wall);
    return wall;
  };
  const walls: Record<WallSide, any> = {
    north: makeWall("north", [width, height, wallThickness], [0, wallY, -halfDepth]),
    south: makeWall("south", [width, height, wallThickness], [0, wallY, halfDepth]),
    east: makeWall("east", [wallThickness, height, depth], [halfWidth, wallY, 0]),
    west: makeWall("west", [wallThickness, height, depth], [-halfWidth, wallY, 0]),
  };

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.18, depth),
    createSurfaceMaterial(THREE, styleFor("ceiling", DEFAULT_SURFACE_IDS.ceiling), { u: width, v: depth }),
  );
  ceiling.name = "room-ceiling";
  ceiling.position.set(0, height + 0.09, 0);
  ceiling.receiveShadow = true;
  scene.add(ceiling);

  // Trim: corner columns plus a skirting board along every wall, all one material.
  const trimMaterial = createSurfaceMaterial(THREE, styleFor("trim", DEFAULT_SURFACE_IDS.trim), { u: 1, v: 1 });
  const trimMeshes: any[] = [];
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
  ] as const) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(...size), trimMaterial);
    skirt.position.set(...position);
    scene.add(skirt);
    trimMeshes.push(skirt);
  }

  let current: RoomSurfaces = { ...DEFAULT_SURFACE_IDS };

  function applySurfaces(surfaces: RoomSurfaces): void {
    if (surfaces.floor !== current.floor) applySurfaceMaterial(THREE, floor, styleFor("floor", surfaces.floor), { u: width, v: depth });
    if (surfaces.wall !== current.wall) {
      const style = styleFor("wall", surfaces.wall);
      for (const wall of [walls.north, walls.south]) applySurfaceMaterial(THREE, wall, style, { u: width, v: height });
      for (const wall of [walls.east, walls.west]) applySurfaceMaterial(THREE, wall, style, { u: depth, v: height });
    }
    if (surfaces.ceiling !== current.ceiling) applySurfaceMaterial(THREE, ceiling, styleFor("ceiling", surfaces.ceiling), { u: width, v: depth });
    if (surfaces.trim !== current.trim) {
      const material = createSurfaceMaterial(THREE, styleFor("trim", surfaces.trim), { u: 1, v: 1 });
      const previous = trimMeshes[0]?.material;
      for (const mesh of trimMeshes) mesh.material = material;
      previous?.dispose?.();
    }
    current = { ...surfaces };
  }

  return Object.freeze({
    floor,
    ceiling,
    walls: Object.freeze(walls),
    wallMeshes: Object.freeze([walls.north, walls.south, walls.east, walls.west]),
    applySurfaces,
  });
}
