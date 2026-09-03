// The table MESH, checked against the table the collider bounces balls off.
//
// `sim/table.js` is the single source of the geometry and `render/table-view.js`
// walks it, which is what stops the two drifting. But "built from the same list"
// is not the same as "in the same place", and the two bugs this file exists for
// were both about placement rather than about the list:
//
//   THE CUSHION FACE. The rubber straddled the nose line instead of starting at
//   it, so its visible surface sat 9mm inside the surface the physics stops a
//   ball against, and every ball resting on a rail was drawn sunk into it.
//
//   THE RAIL CORNERS. Four wood boxes drawn at full length overlapped at every
//   corner: identical heights, identical material, different box UVs, so the
//   corners flickered between two mappings of the same texture as the camera
//   moved. The frame is mitred now, and this file is what keeps it mitred.
//
// `buildTable` takes THREE as a parameter — the rule that keeps the render layer
// swappable — so it can be built here against a stub and measured. Nothing in
// this file draws anything.

import { assert, assertClose, assertEqual, finish, suite, test } from "./harness.js";
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH } from "../scripts/sim/constants.js";
import { BALL_Y, CLOTH_TOP, buildTable } from "../scripts/render/table-view.js";
import { resolveLoadout, defaultLoadout, applyPreset } from "../scripts/cosmetics/loadout.js";
import { installCanvasStub } from "./canvas-stub.js";

suite("the table mesh");

/** Just enough of THREE to record what `buildTable` asks for. */
function stubThree() {
  const vector = () => ({
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
  });

  class Node {
    constructor() {
      this.position = vector();
      this.rotation = vector();
      this.scale = vector();
      this.children = [];
    }
    add(...children) {
      this.children.push(...children);
    }
  }

  const geometry = (type, size) => ({ type, ...size, scale() { return this; }, dispose() {} });

  return {
    Group: Node,
    Mesh: class extends Node {
      constructor(geo, material) {
        super();
        this.geometry = geo;
        this.material = material;
      }
    },
    BoxGeometry: function (w, h, d) {
      return geometry("box", { w, h, d });
    },
    CylinderGeometry: function (radius, _bottom, h) {
      return geometry("cylinder", { w: radius * 2, h, d: radius * 2 });
    },
    TorusGeometry: function (radius, tube) {
      return geometry("torus", { w: (radius + tube) * 2, h: tube * 2, d: (radius + tube) * 2 });
    },
    OctahedronGeometry: function (radius) {
      return geometry("octahedron", { w: radius * 2, h: radius * 2, d: radius * 2 });
    },
    PlaneGeometry: function (w, h) {
      return geometry("plane", { w, h, d: 0 });
    },
    CircleGeometry: function (radius) {
      return geometry("circle", { w: radius * 2, h: 0, d: radius * 2 });
    },
    CanvasTexture: function () {
      return { repeat: { set() {} }, dispose() {} };
    },
    RepeatWrapping: 1000,
    SRGBColorSpace: "srgb",
    MeshPhysicalMaterial: function (options) {
      return { ...options, color: { set() {} } };
    },
    MeshStandardMaterial: function (options) {
      return { ...options, color: { set() {} } };
    },
  };
}

/**
 * Build the table.
 *
 * Passing no cosmetics is deliberate for the geometry checks: the mesh is what
 * is being measured, and the whole point of the cosmetic layer is that it cannot
 * move any of it. `cosmeticsMoveNothing` below proves that by measuring the
 * table twice with two very different loadouts.
 */
function build(cosmetics) {
  const THREE = stubThree();
  const scene = { add() {} };
  const table = buildTable(THREE, scene, cosmetics ? { cosmetics } : undefined);
  // Groups (the sights and the decal) have no geometry of their own; only their
  // children do, and neither is part of the table a ball touches.
  const parts = table.group.children.filter((mesh) => mesh.geometry).map((mesh) => ({
    material: mesh.material,
    type: mesh.geometry.type,
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
    hw: mesh.geometry.w / 2,
    hh: mesh.geometry.h / 2,
    hd: mesh.geometry.d / 2,
  }));
  return { parts, materials: table.materials };
}

const of = (parts, material) => parts.filter((part) => part.material === material);
const overlaps = (a, b, axis, half) => Math.abs(a[axis] - b[axis]) < a[half] + b[half] - 1e-9;

// --- the ball sits on the cloth ---------------------------------------------

test("a ball rests exactly on top of the bed, not sunk into it", () => {
  assertClose(BALL_Y, CLOTH_TOP + BALL_RADIUS, 1e-12, "the ball height is derived from the bed, or it drifts");
});

// --- the cushion face -------------------------------------------------------

test("every cushion's playing face is exactly the line the collider stops a ball at", () => {
  const { parts, materials } = build();
  const rubber = of(parts, materials.rubber).filter((part) => part.type === "box");
  assert(rubber.length > 0, "no cushions were built at all");

  for (const cushion of rubber) {
    // A long-rail cushion is wide in x and thin in z; a short-rail one the
    // reverse. The thin axis is the one that faces the cloth.
    const acrossZ = cushion.hd < cushion.hw;
    const [centre, half, nose] = acrossZ ? [cushion.z, cushion.hd, HALF_WIDTH] : [cushion.x, cushion.hw, HALF_LENGTH];
    const face = Math.abs(centre) - half;
    assertClose(
      face,
      nose,
      1e-9,
      `a cushion face sits at ${face.toFixed(4)} but the collider stops balls at ${nose} — balls will clip into it`,
    );
  }
});

test("no cushion reaches in over the cloth where a ball can rest against it", () => {
  const { parts, materials } = build();
  const restTop = BALL_Y + BALL_RADIUS;
  for (const cushion of of(parts, materials.rubber)) {
    assert(cushion.y - cushion.hh < restTop, "a cushion a ball can pass under is not a cushion");
    // And no cushion may reach in far enough to contain a ball's centre.
    const inZ = Math.abs(cushion.z) - cushion.hd < HALF_WIDTH - BALL_RADIUS - 1e-9;
    const inX = Math.abs(cushion.x) - cushion.hw < HALF_LENGTH - BALL_RADIUS - 1e-9;
    assert(!(inZ && inX), "a cushion overhangs the cloth far enough to swallow a ball centre");
  }
});

// --- the rail frame ---------------------------------------------------------

test("no two rails occupy the same space, so the corners cannot z-fight", () => {
  const { parts, materials } = build();
  const wood = of(parts, materials.wood);
  assert(wood.length === 4, `expected four rails, found ${wood.length}`);

  for (let i = 0; i < wood.length; i++) {
    for (let j = i + 1; j < wood.length; j++) {
      const a = wood[i];
      const b = wood[j];
      const clash = overlaps(a, b, "x", "hw") && overlaps(a, b, "y", "hh") && overlaps(a, b, "z", "hd");
      assert(
        !clash,
        `two rails overlap — same wood, same height, different UVs, so the corner flickers ` +
          `(${a.x},${a.z} and ${b.x},${b.z})`,
      );
    }
  }
});

test("the rail frame still closes at the corners, with no gap to see through", () => {
  const { parts, materials } = build();
  const wood = of(parts, materials.wood);
  const outerX = Math.max(...wood.map((rail) => Math.abs(rail.x) + rail.hw));
  const outerZ = Math.max(...wood.map((rail) => Math.abs(rail.z) + rail.hd));

  // Sample just inside each of the four outer corners: some rail must cover it.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (outerX - 0.005);
      const z = sz * (outerZ - 0.005);
      const covered = wood.some((rail) => Math.abs(x - rail.x) <= rail.hw && Math.abs(z - rail.z) <= rail.hd);
      assert(covered, `the rail frame has a hole at its ${sx},${sz} corner`);
    }
  }
});

// --- the pockets ------------------------------------------------------------

test("nothing at a pocket rises above the cloth far enough to cut through a ball", () => {
  // The black mouth and the leather rim used to sit 18mm and 31mm proud of the
  // bed — above the equator of a ball — so they sliced across any ball resting
  // near a pocket. A pocket is a hole in the cloth, and it reads as one only a
  // fraction of a millimetre above the bed.
  const { parts, materials } = build();
  const pocketPieces = [...of(parts, materials.pocket), ...of(parts, materials.leather)];
  assert(pocketPieces.length >= 12, "expected a mouth and a rim for each of the six pockets");

  for (const piece of pocketPieces) {
    const top = piece.y + piece.hh;
    assert(
      top < CLOTH_TOP + BALL_RADIUS * 0.5,
      `a pocket piece rises ${((top - CLOTH_TOP) * 1000).toFixed(1)}mm above the bed and cuts across balls`,
    );
    assert(top > CLOTH_TOP - 0.02, "and it must not vanish under the cloth either");
  }
});

// --- cosmetics may not move anything ----------------------------------------

test("switching cosmetics moves no part of the table a ball can touch", () => {
  // THE LOAD-BEARING TEST OF THE WHOLE COSMETIC LAYER. Two loadouts that share
  // nothing — different cloth, timber, cushion, hardware, liner, sights, decal
  // and ball set — must produce byte-identical geometry. If a cosmetic could
  // move a cushion face by a millimetre it would be a cheat with a swatch on it,
  // and it would pass every other test in this suite.
  const restore = installCanvasStub();
  try {
    const plain = resolveLoadout(defaultLoadout()).table;
    const loud = resolveLoadout(applyPreset(defaultLoadout(), "preset.table.tournament-traditional")).table;

    const before = build(plain).parts;
    const after = build(loud).parts;
    assertEqual(after.length, before.length, "a cosmetic added or removed a piece of the table");
    for (let i = 0; i < before.length; i++) {
      for (const key of ["type", "x", "y", "z", "hw", "hh", "hd"]) {
        assertEqual(after[i][key], before[i][key], `cosmetics moved part ${i}'s ${key}`);
      }
    }
  } finally {
    restore();
  }
});

test("no cosmetic payload carries a value the simulation reads", () => {
  // The catalog check lives in `cosmetics.test.js`; this is the render-side half:
  // what actually reaches `buildTable` has no physics in it either.
  const restore = installCanvasStub();
  try {
    const table = resolveLoadout(applyPreset(defaultLoadout(), "preset.table.casino")).table;
    const banned = /radius|mass|friction|restitution|gravity|damping|elastic|velocity|inertia/i;
    const walk = (value, path) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        assert(!banned.test(key), `${path}.${key} is a simulation value in a cosmetic payload`);
        walk(child, `${path}.${key}`);
      }
    };
    for (const [slot, payload] of Object.entries(table)) walk(payload, slot);
  } finally {
    restore();
  }
});

finish();
