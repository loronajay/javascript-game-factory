// A building's shell as geometry: where its walls stand in its own frame, how
// a round tower's faces go round, and how a point in the building's frame
// lands on the field.
//
// Pure — no THREE, no DOM — and imported by both `farm-scene.mts` (which turns
// the walls into obstacles) and `farm-fixtures.mts` (which puts furniture and
// catwalks against them), so it holds no field knowledge of its own. THIS is
// the one description of a building's walls: the builders draw exactly these
// boxes and the walker collides with them.

import type { BuildingShell } from "./farm-catalog/decor.mjs";

export type { BuildingShell };

type Pose = Readonly<{ x: number; z: number; rotationY: number }>;
type Building = Readonly<{ footprint: Readonly<{ width: number; depth: number }>; shell: BuildingShell | null }>;

/** A point in a building's frame → the field. Inverse of the walker's obstacle test, so the two agree. */
export function buildingLocalToWorld(row: Pose, local: Readonly<{ x: number; z: number }>): Readonly<{ x: number; z: number }> {
  const cosine = Math.cos(row.rotationY);
  const sine = Math.sin(row.rotationY);
  return { x: row.x + local.x * cosine + local.z * sine, z: row.z - local.x * sine + local.z * cosine };
}

/** A wall in the building's frame: centre, size along its own x, thickness, and its own turn about y. */
export type ShellWall = Readonly<{ name: string; x: number; z: number; length: number; thickness: number; rotationY: number }>;

/**
 * A face of a round shell: the flat wall `index` of `sides`, tangent to the
 * footprint's inscribed circle. Face 0 is the +z one (the door's), and the
 * faces go round toward +x. The polygon's corners poke a little past the
 * circle but stay inside the footprint box.
 */
export function roundFace(shell: BuildingShell, footprint: Readonly<{ width: number; depth: number }>, index: number): Readonly<{ angle: number; length: number; apothem: number; circumradius: number }> {
  const apothem = Math.min(footprint.width, footprint.depth) / 2;
  const angle = (index / shell.sides) * Math.PI * 2;
  return { angle, length: 2 * apothem * Math.tan(Math.PI / shell.sides), apothem, circumradius: apothem / Math.cos(Math.PI / shell.sides) };
}

/**
 * The walls a shell stands on, in the building's frame, with the doorway cut
 * out of the +z face (two jambs) and — while the door is shut — the door
 * itself as one more wall. The eye and the body read this same list: the
 * builders draw these boxes and the walker collides with them.
 */
export function shellWalls(building: Building, doorsOpen: boolean): ShellWall[] {
  const shell = building.shell;
  if (!shell) return [];
  const { width, depth } = building.footprint;
  const t = shell.wallThickness;
  const walls: ShellWall[] = [];
  const doorFace = (name: string, cx: number, cz: number, length: number, rotationY: number): void => {
    // The door face: jambs either side of the opening along the face's own x, and the shut door between them.
    const door = shell.door!;
    const jamb = (length - door.width) / 2;
    const along = { x: Math.cos(rotationY), z: -Math.sin(rotationY) };
    const at = (offset: number): Readonly<{ x: number; z: number }> => ({ x: cx + along.x * offset, z: cz + along.z * offset });
    const west = at(-door.width / 2 - jamb / 2);
    const east = at(door.width / 2 + jamb / 2);
    walls.push({ name: `${name}-jamb-west`, x: west.x, z: west.z, length: jamb, thickness: t, rotationY });
    walls.push({ name: `${name}-jamb-east`, x: east.x, z: east.z, length: jamb, thickness: t, rotationY });
    if (!doorsOpen) walls.push({ name: "door", x: cx, z: cz, length: door.width, thickness: t, rotationY });
  };
  if (shell.kind === "walls") {
    walls.push({ name: "north", x: 0, z: -depth / 2 + t / 2, length: width, thickness: t, rotationY: 0 });
    walls.push({ name: "east", x: width / 2 - t / 2, z: 0, length: depth, thickness: t, rotationY: Math.PI / 2 });
    walls.push({ name: "west", x: -width / 2 + t / 2, z: 0, length: depth, thickness: t, rotationY: Math.PI / 2 });
    if (shell.door) doorFace("south", 0, depth / 2 - t / 2, width, 0);
    else walls.push({ name: "south", x: 0, z: depth / 2 - t / 2, length: width, thickness: t, rotationY: 0 });
    return walls;
  }
  if (shell.kind === "round") {
    for (let index = 0; index < shell.sides; index += 1) {
      const face = roundFace(shell, building.footprint, index);
      const r = face.apothem - t / 2;
      const cx = Math.sin(face.angle) * r;
      const cz = Math.cos(face.angle) * r;
      if (index === 0 && shell.door) doorFace("face-0", cx, cz, face.length, 0);
      else walls.push({ name: `face-${index}`, x: cx, z: cz, length: face.length, thickness: t, rotationY: face.angle });
    }
    return walls;
  }
  // Open: a post in each corner, inside the footprint.
  const post = t;
  for (const [sx, sz, name] of [[-1, -1, "post-nw"], [1, -1, "post-ne"], [-1, 1, "post-sw"], [1, 1, "post-se"]] as const) {
    walls.push({ name, x: sx * (width / 2 - post / 2), z: sz * (depth / 2 - post / 2), length: post, thickness: post, rotationY: 0 });
  }
  return walls;
}

