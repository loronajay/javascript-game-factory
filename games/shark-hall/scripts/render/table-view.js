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

import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, JAW_RADIUS, TABLE_LENGTH, TABLE_WIDTH } from "../sim/constants.js";
import { CUSHIONS, JAWS, POCKETS } from "../sim/table.js";

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
 *
 * The wood rail then starts where the rubber ends, and the whole frame is one
 * rectangle: see `railFrame` for why that matters more than it sounds.
 */
const CUSHION_DEPTH = 0.048;
const CUSHION_HEIGHT = 0.055;
const RAIL_WIDTH = 0.145;
/** Outer edge of the wood rail, measured from the nose line. */
const RAIL_OUTER = CUSHION_DEPTH + RAIL_WIDTH;
/** Top of the rails and the cushions. */
const RAIL_TOP = 0.15;

export function buildTable(THREE, scene, { feltTexture, woodTexture }) {
  const table = new THREE.Group();
  table.position.y = 0.15;
  scene.add(table);

  const materials = {
    wood: new THREE.MeshPhysicalMaterial({
      map: woodTexture,
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.05,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
    }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x180f09, roughness: 0.5 }),
    // Physical rather than Standard for ONE property: `specularIntensity`.
    // Baize is about the least reflective surface in a pool hall, and at the
    // default dielectric specular it caught a white sheen off the pendant that
    // washed the navy out to grey. This is the knob that turns a plastic-looking
    // bed back into cloth.
    felt: new THREE.MeshPhysicalMaterial({
      map: feltTexture,
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
      specularIntensity: 0.16,
    }),
    // The cushion rubber, under navy cloth rather than the demo's green, and a
    // shade darker than the bed: a real cushion faces the room at an angle the
    // fixture barely reaches, so it reads darker than the cloth beside it.
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x1d3450, roughness: 0.95, metalness: 0, specularIntensity: 0.2 }),
    // Brass, per the splash. The single most identifying colour in the hall.
    brass: new THREE.MeshStandardMaterial({ color: 0xc79a4f, metalness: 0.88, roughness: 0.28 }),
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

  // --- body --------------------------------------------------------------
  box(TABLE_LENGTH + 0.46, 0.22, TABLE_WIDTH + 0.46, 0, -0.08, 0, materials.darkWood);

  // THE RAIL FRAME IS MITRED, NOT CROSSED, and that is a bug fix rather than a
  // detail. Four boxes drawn at full length each overlapped the next at every
  // corner: two coplanar tops, same height, same wood material, different box
  // UVs, so the corners flickered between two mappings of the same texture as
  // the camera moved. The long rails now run the full outside and the short
  // rails span only the gap between them, so no two pieces occupy the same
  // millimetre. Anything customizable added to this frame later inherits that.
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
  // square edge floating over the mouth. One cylinder each, at the radius the
  // physics uses, capped in cloth so they read as the end of the rubber.
  for (const jaw of JAWS) {
    const post = new THREE.Mesh(
      // A hair taller than the rubber it caps, so the two tops are not
      // coplanar. Same material, so the difference is invisible; coplanar and
      // it would z-fight along every mouth.
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

  // --- diamond sights, in brass -------------------------------------------
  for (const x of [-0.95, -0.63, -0.31, 0.31, 0.63, 0.95]) {
    for (const z of [HALF_WIDTH + railMid, -HALF_WIDTH - railMid]) {
      const sight = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), materials.brass);
      sight.scale.set(1, 0.35, 1);
      sight.position.set(x, RAIL_TOP + 0.001, z);
      table.add(sight);
    }
  }
  for (const z of [-0.42, -0.21, 0.21, 0.42]) {
    for (const x of [HALF_LENGTH + railMid, -HALF_LENGTH - railMid]) {
      const sight = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), materials.brass);
      sight.scale.set(1, 0.35, 1);
      sight.position.set(x, RAIL_TOP + 0.001, z);
      table.add(sight);
    }
  }

  // --- corner caps and legs ------------------------------------------------
  // The brass corner caps are the splash's signature detail, so they are the one
  // piece of pure decoration in this file that earns its polygons. They sit on
  // the APRON — the cabinet body below the rails — rather than at rail height,
  // because at rail height a cap large enough to read would sit over the corner
  // pocket mouth and cover the hole the player is aiming at.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(0.17, 0.2, 0.17, sx * (HALF_LENGTH + RAIL_OUTER), -0.06, sz * (HALF_WIDTH + RAIL_OUTER), materials.brass);
    }
  }

  for (const [x, z] of [
    [-0.98, -0.44],
    [-0.98, 0.44],
    [0.98, -0.44],
    [0.98, 0.44],
  ]) {
    box(0.18, 0.72, 0.18, x, -0.54, z, materials.darkWood);
  }

  return { group: table, materials };
}
