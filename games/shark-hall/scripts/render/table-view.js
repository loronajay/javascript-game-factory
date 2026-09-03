// The table, built from the same geometry the physics collides with.
//
// THIS FILE IMPORTS `sim/table.js`, and that is the point of it existing. In the
// demo the cushion meshes were laid out with their own hand-written half-lengths
// and the collider had its own, so a ball could pass through a rail the player
// could see or bounce off one they could not. Here every rubber box is built by
// walking `CUSHIONS`, every pocket by walking `POCKETS`, and the two cannot
// drift because there is only one of each.
//
// The sim is not allowed to know this file exists; this file reads the sim.
//
// COSMETICS CHANGE MATERIALS, NEVER GEOMETRY THE SIM SHARES. `apply` swaps
// colours and regenerates canvas textures on materials that already exist; the
// only things it rebuilds are the two pieces of pure decoration whose SHAPE is
// part of the choice — the rail sights and the apron decal — and neither is
// collided with, measured against, or known to `sim/`. Nothing in here can move
// a nose line, a pocket or a jaw, which is what makes "a cosmetic cannot change
// how the table plays" a structural fact rather than a promise.

import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, JAW_RADIUS, TABLE_LENGTH, TABLE_WIDTH } from "../sim/constants.js";
import { CUSHIONS, JAWS, POCKETS } from "../sim/table.js";
import { decalTexture, feltTexture, woodTexture } from "./textures.js";

/** Height of the playing surface in the table group's local space. */
export const CLOTH_Y = 0.095;
/** Thickness of the slate-and-cloth slab. Its TOP is the bed a ball rests on. */
const CLOTH_THICKNESS = 0.035;
/** The bed itself. Everything at table height is measured off this, never typed. */
export const CLOTH_TOP = CLOTH_Y + CLOTH_THICKNESS / 2;
/**
 * Where a ball's centre sits: exactly one radius above the bed.
 *
 * DERIVED, like the pointer plane in `scene.js` that reads it. It was typed as
 * `BALL_RADIUS + 0.112`, half a millimetre below the cloth, so every ball was
 * very slightly sunk into the table.
 */
export const BALL_Y = CLOTH_TOP + BALL_RADIUS;

/**
 * The cushion, and the reason these three numbers exist rather than literals.
 *
 * `HALF_WIDTH` and `HALF_LENGTH` are the NOSE LINE — the face of the rubber the
 * collider bounces a ball off, with the ball's centre stopping one radius short
 * of it. So the rubber box has to START there and run outward. It used to
 * straddle the line, putting its visible face 9mm inside the collider's, and a
 * ball resting on a rail sat visibly buried in the cushion.
 */
const CUSHION_DEPTH = 0.048;
const CUSHION_HEIGHT = 0.055;
const RAIL_WIDTH = 0.145;
/** Outer edge of the wood rail, measured from the nose line. */
const RAIL_OUTER = CUSHION_DEPTH + RAIL_WIDTH;
/** Top of the rails and the cushions. */
const RAIL_TOP = 0.15;
/** How far the cabinet body overhangs the nose line. The apron's outer face. */
const APRON_OVERHANG = 0.23;
/** Tallest a decal may be drawn: the apron is 0.22 deep and the mark must sit inside it. */
const DECAL_MAX_HEIGHT = 0.15;

/** Where the six-and-four sights sit along each rail. Geometry of the TABLE, not of the sight. */
const LONG_SIGHTS = [-0.95, -0.63, -0.31, 0.31, 0.63, 0.95];
const SHORT_SIGHTS = [-0.42, -0.21, 0.21, 0.42];

const SUITS = ["♠", "♥", "♦", "♣"];

export function buildTable(THREE, scene, { cosmetics = {} } = {}) {
  const table = new THREE.Group();
  table.position.y = 0.15;
  scene.add(table);

  // What is currently drawn. Presentation payloads are frozen catalog
  // singletons, so identity comparison is an exact "did this slot change?" —
  // which is what keeps `apply` from regenerating four canvases per click.
  const current = { cloth: null, rail: null, apron: null, cushion: null, hardware: null, pockets: null, sights: null, decal: null };

  const materials = {
    wood: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
    apron: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0.05, clearcoat: 0.22, clearcoatRoughness: 0.3 }),
    // Physical rather than Standard for ONE property: `specularIntensity`.
    // Baize is about the least reflective surface in a pool hall, and at the
    // default dielectric specular it caught a white sheen off the pendant that
    // washed the navy out to grey. This is the knob that turns a plastic-looking
    // bed back into cloth.
    felt: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.98, metalness: 0, specularIntensity: 0.16 }),
    // The cushion rubber, a shade darker than the bed: a real cushion faces the
    // room at an angle the fixture barely reaches.
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x1d3450, roughness: 0.95, metalness: 0, specularIntensity: 0.2 }),
    // The corner caps and any other metal fitting. The single most identifying
    // colour in the hall, and the one the hardware slot owns.
    hardware: new THREE.MeshStandardMaterial({ color: 0xc79a4f, metalness: 0.88, roughness: 0.28 }),
    sight: new THREE.MeshStandardMaterial({ color: 0xc79a4f, metalness: 0.88, roughness: 0.28 }),
    pocket: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x11100f, roughness: 0.96 }),
  };

  const box = (w, h, d, x, y, z, material, cast = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    table.add(mesh);
    return mesh;
  };

  // --- body ---------------------------------------------------------------
  box(TABLE_LENGTH + 2 * APRON_OVERHANG, 0.22, TABLE_WIDTH + 2 * APRON_OVERHANG, 0, -0.08, 0, materials.apron);

  // THE RAIL FRAME IS MITRED, NOT CROSSED, and that is a bug fix rather than a
  // detail. Four boxes drawn at full length each overlapped the next at every
  // corner: two coplanar tops, same height, same wood material, different box
  // UVs, so the corners flickered between two mappings of the same texture as
  // the camera moved. The long rails now run the full outside and the short
  // rails span only the gap between them, so no two pieces occupy the same
  // millimetre. Every customizable finish added to this frame inherits that.
  const railMid = (RAIL_OUTER + CUSHION_DEPTH) / 2;
  const railY = RAIL_TOP - 0.07;
  for (const side of [-1, 1]) {
    box(TABLE_LENGTH + 2 * RAIL_OUTER, 0.14, RAIL_WIDTH, 0, railY, side * (HALF_WIDTH + railMid), materials.wood);
    box(RAIL_WIDTH, 0.14, TABLE_WIDTH + 2 * CUSHION_DEPTH, side * (HALF_LENGTH + railMid), railY, 0, materials.wood);
  }

  box(TABLE_LENGTH, CLOTH_THICKNESS, TABLE_WIDTH, 0, CLOTH_Y, 0, materials.felt, false);

  // --- cushions, straight off the collider's own segment list --------------
  // The rubber runs OUTWARD from the nose line, so its visible face is exactly
  // the surface the collider stops a ball against. See CUSHION_DEPTH.
  const cushionMid = CUSHION_DEPTH / 2;
  const cushionY = RAIL_TOP - CUSHION_HEIGHT / 2;
  for (const cushion of CUSHIONS) {
    const span = cushion.to - cushion.from;
    const middle = (cushion.from + cushion.to) / 2;
    if (cushion.rail === "long") {
      box(span, CUSHION_HEIGHT, CUSHION_DEPTH, middle, cushionY, cushion.side * (HALF_WIDTH + cushionMid), materials.rubber);
    } else {
      box(CUSHION_DEPTH, CUSHION_HEIGHT, span, cushion.side * (HALF_LENGTH + cushionMid), cushionY, middle, materials.rubber);
    }
  }

  // --- the pocket jaws, which the collider has always had and nobody drew ----
  // `JAWS` are the rounded facings a ball rattles off. Without a mesh the ball
  // bounced off nothing the player could see, and the cushion runs ended in a
  // square edge floating over the mouth.
  for (const jaw of JAWS) {
    const post = new THREE.Mesh(
      // A hair taller than the rubber it caps, so the two tops are not coplanar.
      // Same material, so the difference is invisible; coplanar and it would
      // z-fight along every mouth.
      new THREE.CylinderGeometry(JAW_RADIUS, JAW_RADIUS, CUSHION_HEIGHT + 0.0006, 16),
      materials.rubber,
    );
    post.position.set(jaw.x, cushionY, jaw.z);
    post.castShadow = true;
    post.receiveShadow = true;
    table.add(post);
  }

  // --- pockets, straight off the collider's own pocket list ----------------
  // Both pieces are pinned to CLOTH_TOP rather than to a typed height. They used
  // to sit 18mm and 31mm proud of the bed — above the equator of a ball — so the
  // black mouth and the leather rim sliced across any ball resting near a
  // pocket. A pocket is a hole in the cloth: it reads correctly a fraction of a
  // millimetre above the bed and nowhere else.
  for (const pocket of POCKETS) {
    const mouth = pocket.radius * 1.09;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(mouth, mouth, 0.034, 32), materials.pocket);
    hole.position.set(pocket.x, CLOTH_TOP + 0.0006 - 0.017, pocket.z);
    table.add(hole);

    const liner = new THREE.Mesh(new THREE.TorusGeometry(mouth * 0.86, 0.007, 10, 28), materials.leather);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(pocket.x, CLOTH_TOP - 0.002, pocket.z);
    table.add(liner);
  }

  // --- corner caps and legs ------------------------------------------------
  // The corner caps are the splash's signature detail, so they are the one piece
  // of pure decoration in this file that earns its polygons. They sit on the
  // APRON — the cabinet body below the rails — rather than at rail height,
  // because at rail height a cap large enough to read would sit over the corner
  // pocket mouth and cover the hole the player is aiming at.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(0.17, 0.2, 0.17, sx * (HALF_LENGTH + RAIL_OUTER), -0.06, sz * (HALF_WIDTH + RAIL_OUTER), materials.hardware);
    }
  }

  for (const [x, z] of [
    [-0.98, -0.44],
    [-0.98, 0.44],
    [0.98, -0.44],
    [0.98, 0.44],
  ]) {
    box(0.18, 0.72, 0.18, x, -0.54, z, materials.apron);
  }

  // --- the two rebuildable decorations ------------------------------------
  // Sights and decals are the only cosmetics whose SHAPE changes with the
  // choice, so they get a group each and are torn down and redrawn rather than
  // recoloured. Both are decoration on the rail cap and the cabinet face: no
  // ball touches either, and no `sim/` value is derived from either.
  const sightGroup = new THREE.Group();
  const decalGroup = new THREE.Group();
  table.add(sightGroup, decalGroup);

  /** Everything this view generated and must dispose when it is replaced. */
  const owned = { feltMap: null, railMap: null, apronMap: null, decalMaps: [], suitMaps: [] };

  function clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.geometry?.dispose();
      if (child.material && child.material !== materials.sight) child.material.dispose();
    }
  }

  function buildSights(spec) {
    clearGroup(sightGroup);
    for (const map of owned.suitMaps) map.dispose();
    owned.suitMaps = [];
    if (!spec) return;

    materials.sight.color.set(spec.color);
    materials.sight.metalness = spec.metalness;
    materials.sight.roughness = spec.roughness;

    const geometryFor = (index) => {
      if (spec.shape === "circle") return new THREE.CylinderGeometry(0.013, 0.013, 0.004, 20);
      if (spec.shape === "bar") return new THREE.BoxGeometry(0.04, 0.004, 0.012);
      if (spec.shape === "suits") return new THREE.CircleGeometry(0.017, 20);
      const diamond = new THREE.OctahedronGeometry(0.014, 0);
      diamond.scale(1, 0.35, 1);
      return diamond;
    };

    let index = 0;
    const place = (x, z) => {
      const geometry = geometryFor(index);
      let material = materials.sight;
      if (spec.shape === "suits") {
        // A pip per position, cycling the four suits. This is the one sight set
        // whose faces differ from each other, so it cannot share one material.
        const map = suitTexture(THREE, SUITS[index % SUITS.length], spec.color);
        owned.suitMaps.push(map);
        material = new THREE.MeshStandardMaterial({ map, transparent: true, metalness: spec.metalness, roughness: spec.roughness });
      }
      const sight = new THREE.Mesh(geometry, material);
      if (spec.shape === "suits") sight.rotation.x = -Math.PI / 2;
      sight.position.set(x, RAIL_TOP + 0.001, z);
      sightGroup.add(sight);
      index += 1;
    };

    for (const x of LONG_SIGHTS) for (const z of [HALF_WIDTH + railMid, -HALF_WIDTH - railMid]) place(x, z);
    for (const z of SHORT_SIGHTS) for (const x of [HALF_LENGTH + railMid, -HALF_LENGTH - railMid]) place(x, z);
  }

  function buildDecal(spec) {
    clearGroup(decalGroup);
    for (const map of owned.decalMaps) map.dispose();
    owned.decalMaps = [];
    if (!spec) return;

    const { texture, aspect } = decalTexture(THREE, spec);
    owned.decalMaps.push(texture);
    // Fitted rather than scaled: `span` is a MAXIMUM width, and the height is
    // clamped to what the apron can hold. A decal that overhangs the cabinet
    // face reads as a sticker somebody put on crooked.
    const height = Math.min(spec.span * aspect, DECAL_MAX_HEIGHT);
    const width = height / aspect;
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.5, metalness: 0.25 });

    const faces = spec.zone === "apron-short"
      ? [
        { x: HALF_LENGTH + APRON_OVERHANG + 0.002, z: 0, rotation: Math.PI / 2 },
        { x: -(HALF_LENGTH + APRON_OVERHANG + 0.002), z: 0, rotation: -Math.PI / 2 },
      ]
      : [
        { x: 0, z: HALF_WIDTH + APRON_OVERHANG + 0.002, rotation: 0 },
        { x: 0, z: -(HALF_WIDTH + APRON_OVERHANG + 0.002), rotation: Math.PI },
      ];

    for (const face of faces) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(face.x, -0.08, face.z);
      mesh.rotation.y = face.rotation;
      decalGroup.add(mesh);
    }
  }

  /**
   * Repaint the table.
   *
   * Idempotent and cheap: every slot compares its payload against what is drawn
   * and does nothing when they match, so the editor can call this on every
   * pointer move without regenerating a canvas per frame.
   */
  function apply(next = {}) {
    if (next.cloth && next.cloth !== current.cloth) {
      owned.feltMap?.dispose();
      owned.feltMap = feltTexture(THREE, next.cloth);
      materials.felt.map = owned.feltMap;
      materials.felt.specularIntensity = next.cloth.sheen ?? 0.16;
      materials.felt.needsUpdate = true;
      current.cloth = next.cloth;
    }
    if (next.rail && next.rail !== current.rail) {
      owned.railMap?.dispose();
      owned.railMap = woodTexture(THREE, next.rail);
      applyWood(materials.wood, owned.railMap, next.rail);
      current.rail = next.rail;
    }
    if (next.apron && next.apron !== current.apron) {
      owned.apronMap?.dispose();
      owned.apronMap = woodTexture(THREE, next.apron);
      applyWood(materials.apron, owned.apronMap, next.apron);
      current.apron = next.apron;
    }
    if (next.cushion && next.cushion !== current.cushion) {
      materials.rubber.color.set(next.cushion.color);
      materials.rubber.roughness = next.cushion.roughness;
      materials.rubber.specularIntensity = next.cushion.sheen ?? 0.2;
      current.cushion = next.cushion;
    }
    if (next.hardware && next.hardware !== current.hardware) {
      materials.hardware.color.set(next.hardware.color);
      materials.hardware.metalness = next.hardware.metalness;
      materials.hardware.roughness = next.hardware.roughness;
      current.hardware = next.hardware;
    }
    if (next.pockets && next.pockets !== current.pockets) {
      materials.leather.color.set(next.pockets.liner);
      materials.leather.roughness = next.pockets.roughness;
      materials.pocket.color.set(next.pockets.mouth);
      current.pockets = next.pockets;
    }
    if (next.sights !== current.sights) {
      buildSights(next.sights);
      current.sights = next.sights ?? null;
    }
    if (next.decal !== current.decal) {
      buildDecal(next.decal);
      current.decal = next.decal ?? null;
    }
  }

  function applyWood(material, map, spec) {
    material.map = map;
    material.roughness = spec.roughness;
    material.metalness = spec.metalness;
    material.clearcoat = spec.clearcoat;
    material.clearcoatRoughness = spec.clearcoatRoughness;
    material.needsUpdate = true;
  }

  apply(cosmetics);

  return { group: table, materials, apply };
}

/** One suit pip, drawn transparent so it sits on the rail cap rather than in a disc. */
function suitTexture(THREE, glyph, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = color;
  ctx.font = "52px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 32, 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
