// The hall around the table.
//
// Floor, walls, pictures, props and the pendant lamps. None of it is ever
// collided with or read by the sim — it exists to give the table somewhere to
// be, and to put the warm pool of light over it that the whole look depends on.
//
// IT IS BUILT FROM A COSMETIC CONFIGURATION, slot by slot, and `apply` is the
// only way anything in here changes. A hall cosmetic therefore has no path to
// the table at all: this module never imports `table-view.js`, never touches a
// ball, and the payload it is handed (`resolved.hall`) is a different object
// from the table's with no keys in common.
//
// EVERY PROP IS OPTIONAL. A slot holding null draws nothing, which is the state
// most of them ship in — an empty room with one good lamp beats a furnished one,
// and the player fills it deliberately.

import { signTexture, floorTexture } from "./textures.js";

/** Where the room's surfaces are. Props hang off these, so they are named once. */
const FLOOR_Y = -0.72;
const BACK_WALL_Z = -3.3;
const SIDE_WALL_X = -4;

/** The default hall, for a scene built before any loadout has resolved. */
export const DEFAULT_ROOM = Object.freeze({
  walls: Object.freeze({ color: 0x17181b, sideColor: 0x121316, roughness: 0.96 }),
  coolRim: 0x6f8fc0,
  amberRim: 0xd7aa79,
});

/**
 * The key light's playable band, in candela.
 *
 * A light cosmetic may set the mood; it may not make the cloth unreadable. This
 * clamp is the line between the two, and it is in the renderer rather than in
 * the catalog so no future item can talk its way past it.
 */
const KEY_MIN = 20;
const KEY_MAX = 44;
const clampKey = (value) => Math.max(KEY_MIN, Math.min(KEY_MAX, Number(value) || 30));

export function buildRoom(THREE, scene, { cosmetics = {} } = {}) {
  const group = new THREE.Group();
  scene.add(group);

  // --- lights ------------------------------------------------------------
  // A hemisphere for the ambient bounce, one warm point over the table doing all
  // the real work, and two dim rims so the rails read against the dark.
  //
  // The hemisphere is kept LOW and only faintly blue. It is the light that hits
  // every surface from every direction, so it is also the light that flattens a
  // room: at the intensity a bright interior would use it lifted the navy cloth
  // to a pale grey-blue and erased the pendants' pool of warm light entirely,
  // which is the whole look. The hall is dark and lit from one fixture; the
  // ambient exists to keep the shadows from going to pure black, nothing more.
  const ambient = new THREE.HemisphereLight(0x7d90a8, 0x100b07, 0.34);
  scene.add(ambient);

  // Intensity is in candela and falls off with the square of the distance, so
  // this number is not a brightness slider — it is how strong the bulb is two
  // metres above the cloth.
  const key = new THREE.PointLight(0xffdfac, 30, 6, 2);
  key.position.set(0, 2.35, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const coolRim = new THREE.PointLight(DEFAULT_ROOM.coolRim, 16, 5, 2);
  coolRim.position.set(-2.6, 1.5, -1.7);
  scene.add(coolRim);

  const amberRim = new THREE.PointLight(DEFAULT_ROOM.amberRim, 12, 4, 2);
  amberRim.position.set(2.3, 1.3, 1.5);
  scene.add(amberRim);

  // --- surfaces ----------------------------------------------------------
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  group.add(floor);

  const backMaterial = new THREE.MeshStandardMaterial({ color: DEFAULT_ROOM.walls.color, roughness: 0.96 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.4), backMaterial);
  backWall.position.set(0, 1.45, BACK_WALL_Z);
  group.add(backWall);

  const sideMaterial = new THREE.MeshStandardMaterial({ color: DEFAULT_ROOM.walls.sideColor, roughness: 1 });
  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), sideMaterial);
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(SIDE_WALL_X, 1.45, 0);
  group.add(sideWall);

  // --- prop groups --------------------------------------------------------
  // One group per slot, rebuilt when that slot changes and left alone otherwise.
  // Rebuilding a handful of boxes is far cheaper than the alternative every
  // cosmetic system reaches for first — tearing down and re-composing the scene
  // on each selection — and it keeps the lights, the walls and the table
  // untouched while a prop swaps.
  const slots = [
    "hangingLight", "wallArtLeft", "wallArtRight", "cueRack", "trophyShelf",
    "accentSign", "furnitureLeft", "furnitureRight", "rug", "window",
    "awardLeft", "awardRight",
  ];
  /** @type {Record<string, THREE.Group>} */
  const groups = {};
  /** What each slot is currently drawing, by payload identity. */
  const current = { walls: null, floor: null };
  for (const slot of slots) {
    groups[slot] = new THREE.Group();
    group.add(groups[slot]);
    current[slot] = null;
  }

  /** Textures this module generated, so a swap does not leak them. */
  const owned = { floorMap: null, signMap: null };

  function clear(target) {
    for (const child of [...target.children]) {
      target.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  const box = (target, w, h, d, x, y, z, material, cast = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    target.add(mesh);
    return mesh;
  };

  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...options });
  const metal = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3 });

  // --- the fixture -------------------------------------------------------
  // Shades on a bar, with an unlit emissive sphere in each. The spheres do not
  // light anything — the single point light above does — because three real
  // shadow-casting lights over a table of sixteen shadow casters is a frame-rate
  // decision, not a lighting one.
  //
  // It is its own group for one reason beyond cosmetics: it hangs between the
  // overhead camera and the table, and from straight up the shades fill the
  // screen. `scene.js` hides this group in the overhead shot. Only the geometry
  // goes — the point light above stays lit, so the pool of warm light and every
  // shadow under it are identical in both views.
  function buildFixture(spec) {
    const target = groups.hangingLight;
    clear(target);
    if (!spec) return;

    key.color.set(spec.warm);
    key.intensity = clampKey(spec.intensity);

    const barMaterial = new THREE.MeshStandardMaterial({ color: spec.bar, metalness: 0.65, roughness: 0.32 });
    const count = Math.max(1, Math.min(3, spec.count || 3));
    const spread = count === 1 ? 0 : 0.48;
    if (count > 1) box(target, spread * (count - 1) + 0.4, 0.07, 0.14, 0, 2.12, 0, barMaterial);
    else box(target, 0.14, 0.24, 0.14, 0, 2.2, 0, barMaterial);

    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spread;
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.shadeSpan * 0.68, spec.shadeSpan, 0.18, 32, 1, true),
        new THREE.MeshStandardMaterial({ color: spec.shade, metalness: spec.shadeMetal, roughness: 0.34, side: THREE.DoubleSide }),
      );
      shade.position.set(x, 1.98, 0);
      shade.castShadow = true;
      target.add(shade);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshBasicMaterial({ color: spec.bulb }));
      bulb.position.set(x, 1.91, 0);
      target.add(bulb);
    }
  }

  /** A row of framed pictures on the back wall, centred on its half of it. */
  function buildArt(target, spec, centreX) {
    clear(target);
    if (!spec) return;
    const count = Math.max(1, Math.min(4, spec.count || 3));
    // Fitted to the half-wall rather than drawn at the authored size: a trio at
    // full span would run into the other slot's pictures.
    const width = Math.min(spec.span[0], 1.9 / count);
    const height = spec.span[1] * (width / spec.span[0]);
    const frameMaterial = standard(spec.frame, { roughness: 0.55 });

    for (let i = 0; i < count; i++) {
      const x = centreX + (i - (count - 1) / 2) * (width * 1.08);
      box(target, width, height, 0.035, x, 1.42, BACK_WALL_Z + 0.04, frameMaterial, false);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.9, height * 0.88),
        new THREE.MeshStandardMaterial({
          color: spec.art[i % spec.art.length],
          roughness: 0.75,
          emissive: spec.emissive ? spec.art[i % spec.art.length] : 0x000000,
          emissiveIntensity: spec.emissive ?? 0,
        }),
      );
      art.position.set(x, 1.42, BACK_WALL_Z + 0.056);
      target.add(art);
    }
  }

  /** Cues leaning in a wall rack, on the side wall where they are out of the shot. */
  function buildCueRack(spec) {
    const target = groups.cueRack;
    clear(target);
    if (!spec) return;
    const wood = standard(spec.wood, { roughness: 0.5 });
    const fittings = metal(spec.metal);
    const x = SIDE_WALL_X + 0.12;

    box(target, 0.1, 1.5, 0.9, x, 0.24, -0.9, wood);
    for (const y of [0.86, -0.36]) box(target, 0.13, 0.05, 0.94, x + 0.05, y, -0.9, fittings);

    spec.cues.forEach((color, index) => {
      const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 1.42, 10), standard(color, { roughness: 0.35 }));
      cue.position.set(x + 0.09, 0.26, -1.28 + index * 0.145);
      cue.rotation.z = 0.04;
      cue.castShadow = true;
      target.add(cue);
    });

    if (spec.glass) {
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 1.5),
        new THREE.MeshPhysicalMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0 }),
      );
      glass.rotation.y = Math.PI / 2;
      glass.position.set(x + 0.14, 0.24, -0.9);
      target.add(glass);
    }
  }

  /** A shelf on the back wall. What awards stand on, when there is one. */
  function buildShelf(spec) {
    const target = groups.trophyShelf;
    clear(target);
    if (!spec) return;
    const wood = standard(spec.wood, { roughness: 0.5 });
    const fittings = metal(spec.metal);
    const tiers = Math.max(1, Math.min(3, spec.tiers || 2));
    for (let i = 0; i < tiers; i++) {
      const y = 0.95 + i * 0.44;
      box(target, 1.3, 0.05, 0.28, 2.55, y, BACK_WALL_Z + 0.16, wood);
      for (const x of [2.02, 3.08]) box(target, 0.05, 0.12, 0.22, x, y - 0.08, BACK_WALL_Z + 0.16, fittings);
    }
  }

  function buildSign(spec) {
    const target = groups.accentSign;
    clear(target);
    if (!spec) return;
    owned.signMap?.dispose();
    owned.signMap = signTexture(THREE, spec);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.47),
      new THREE.MeshStandardMaterial({
        map: owned.signMap,
        emissiveMap: owned.signMap,
        emissive: 0xffffff,
        emissiveIntensity: spec.glow,
        roughness: 0.6,
      }),
    );
    face.position.set(0, 2.62, BACK_WALL_Z + 0.05);
    target.add(face);
    box(target, 1.6, 0.57, 0.06, 0, 2.62, BACK_WALL_Z + 0.02, standard(spec.backing, { roughness: 0.8 }), false);
  }

  /** One piece of furniture, in whichever of the five shapes the item names. */
  function buildFurniture(target, spec, x) {
    clear(target);
    if (!spec) return;
    const wood = standard(spec.wood, { roughness: 0.55 });
    const cloth = standard(spec.upholstery, { roughness: 0.9 });
    const fittings = metal(spec.metal);
    const z = 1.5;
    const foot = FLOOR_Y;

    if (spec.kind === "stool") {
      for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
        box(target, 0.035, 0.62, 0.035, x + dx, foot + 0.31, z + dz, fittings);
      }
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 20), cloth);
      seat.position.set(x, foot + 0.66, z);
      seat.castShadow = true;
      target.add(seat);
    } else if (spec.kind === "chair") {
      box(target, 0.62, 0.4, 0.58, x, foot + 0.2, z, cloth);
      box(target, 0.62, 0.68, 0.14, x, foot + 0.62, z - 0.22, cloth);
      for (const dx of [-0.26, 0.26]) box(target, 0.1, 0.62, 0.5, x + dx, foot + 0.6, z, cloth);
      box(target, 0.66, 0.06, 0.62, x, foot + 0.03, z, wood);
    } else if (spec.kind === "table") {
      box(target, 0.5, 0.05, 0.5, x, foot + 0.62, z, wood);
      box(target, 0.09, 0.6, 0.09, x, foot + 0.3, z, wood);
      box(target, 0.36, 0.04, 0.36, x, foot + 0.02, z, fittings);
    } else if (spec.kind === "bench") {
      box(target, 1.5, 0.12, 0.44, x, foot + 0.44, z, cloth);
      box(target, 1.5, 0.4, 0.12, x, foot + 0.68, z - 0.18, cloth);
      for (const dx of [-0.6, 0.6]) box(target, 0.1, 0.44, 0.4, x + dx, foot + 0.22, z, wood);
    } else {
      box(target, 0.9, 1.05, 0.42, x, foot + 0.53, z, wood);
      for (const dy of [0.28, 0.72]) box(target, 0.82, 0.03, 0.03, x, foot + dy, z + 0.22, fittings);
      box(target, 0.16, 0.05, 0.05, x, foot + 0.5, z + 0.24, fittings);
    }
  }

  /** A rug under the table. Flat, on the floor, and never in a ball's way. */
  function buildRug(spec) {
    const target = groups.rug;
    clear(target);
    if (!spec) return;
    const [w, d] = spec.span;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), standard(spec.color, { roughness: 0.98 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, FLOOR_Y + 0.004, 0.35);
    rug.receiveShadow = true;
    target.add(rug);

    const border = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.06, d * 1.09), standard(spec.border, { roughness: 0.98 }));
    border.rotation.x = -Math.PI / 2;
    border.position.set(0, FLOOR_Y + 0.002, 0.35);
    target.add(border);
  }

  /** A window on the back wall, with a cold glow behind it. */
  function buildWindow(spec) {
    const target = groups.window;
    clear(target);
    if (!spec) return;
    const x = -2.85;
    box(target, 1.35, 1.6, 0.07, x, 1.6, BACK_WALL_Z + 0.03, standard(spec.frame, { roughness: 0.7 }), false);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.16, 1.42),
      new THREE.MeshStandardMaterial({ color: spec.glass, emissive: spec.glass, emissiveIntensity: spec.glow, roughness: 0.3 }),
    );
    glass.position.set(x, 1.6, BACK_WALL_Z + 0.075);
    target.add(glass);

    if (spec.blinds) {
      const slat = standard(spec.frame, { roughness: 0.8 });
      for (let i = 0; i < 9; i++) box(target, 1.16, 0.035, 0.02, x, 0.98 + i * 0.15, BACK_WALL_Z + 0.1, slat, false);
    }
  }

  /**
   * An award, standing on the shelf.
   *
   * Four types share this path, and that is fine — a trophy and a plaque are
   * drawn from the same handful of primitives. What must NOT be shared is
   * whether the player may equip one, and that is decided long before here.
   */
  function buildAward(target, spec, x) {
    clear(target);
    if (!spec) return;
    const shine = metal(spec.metal);
    const base = standard(spec.plate, { roughness: 0.5 });
    const accent = metal(spec.accent);
    const y = 1.02;

    // The award's own bracket, so it stands on something even with no shelf.
    box(target, 0.34, 0.03, 0.24, x, y - 0.02, BACK_WALL_Z + 0.16, base, false);

    if (spec.form === "cup") {
      box(target, 0.2, 0.07, 0.16, x, y + 0.04, BACK_WALL_Z + 0.16, base);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 0.2, 18), shine);
      bowl.position.set(x, y + 0.18, BACK_WALL_Z + 0.16);
      bowl.castShadow = true;
      target.add(bowl);
      for (const dx of [-0.13, 0.13]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), accent);
        handle.position.set(x + dx, y + 0.2, BACK_WALL_Z + 0.16);
        target.add(handle);
      }
    } else if (spec.form === "plaque") {
      box(target, 0.32, 0.24, 0.03, x, y + 0.16, BACK_WALL_Z + 0.14, base, false);
      box(target, 0.26, 0.16, 0.01, x, y + 0.17, BACK_WALL_Z + 0.16, shine, false);
    } else if (spec.form === "frame") {
      box(target, 0.3, 0.36, 0.03, x, y + 0.22, BACK_WALL_Z + 0.14, shine, false);
      box(target, 0.24, 0.3, 0.01, x, y + 0.22, BACK_WALL_Z + 0.16, base, false);
    } else {
      box(target, 0.4, 0.34, 0.24, x, y + 0.19, BACK_WALL_Z + 0.16, base);
      const dome = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.28, 0.2),
        new THREE.MeshPhysicalMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.2, roughness: 0.06 }),
      );
      dome.position.set(x, y + 0.2, BACK_WALL_Z + 0.16);
      target.add(dome);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.16, 14), shine);
      cup.position.set(x, y + 0.17, BACK_WALL_Z + 0.16);
      target.add(cup);
    }
  }

  /**
   * Repaint the room.
   *
   * Slot by slot, comparing payload identity, so a click that changes the cloth
   * touches nothing in here at all.
   */
  function apply(next = {}) {
    if (next.walls && next.walls !== current.walls) {
      backMaterial.color.set(next.walls.color);
      backMaterial.roughness = next.walls.roughness;
      sideMaterial.color.set(next.walls.sideColor);
      current.walls = next.walls;
    }
    if (next.floor && next.floor !== current.floor) {
      owned.floorMap?.dispose();
      owned.floorMap = floorTexture(THREE, next.floor);
      floorMaterial.map = owned.floorMap;
      floorMaterial.roughness = next.floor.roughness;
      floorMaterial.needsUpdate = true;
      current.floor = next.floor;
    }
    const rebuild = (slot, build) => {
      const spec = next[slot] ?? null;
      if (spec === current[slot]) return;
      build(spec);
      current[slot] = spec;
    };
    rebuild("hangingLight", buildFixture);
    rebuild("wallArtLeft", (spec) => buildArt(groups.wallArtLeft, spec, -1.9));
    rebuild("wallArtRight", (spec) => buildArt(groups.wallArtRight, spec, 1.9));
    rebuild("cueRack", buildCueRack);
    rebuild("trophyShelf", buildShelf);
    rebuild("accentSign", buildSign);
    rebuild("furnitureLeft", (spec) => buildFurniture(groups.furnitureLeft, spec, -2.35));
    rebuild("furnitureRight", (spec) => buildFurniture(groups.furnitureRight, spec, 2.35));
    rebuild("rug", buildRug);
    rebuild("window", buildWindow);
    rebuild("awardLeft", (spec) => buildAward(groups.awardLeft, spec, 2.25));
    rebuild("awardRight", (spec) => buildAward(groups.awardRight, spec, 2.85));
  }

  apply(cosmetics);

  return { group, key, ambient, coolRim, amberRim, fixture: groups.hangingLight, apply };
}
