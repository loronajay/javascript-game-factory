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

import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, TABLE_LENGTH, TABLE_WIDTH } from "../sim/constants.js";
import { CUSHIONS, POCKETS } from "../sim/table.js";

/** Height of the playing surface in the table group's local space. */
export const CLOTH_Y = 0.095;
/** Where a ball's centre sits: on the cloth. Used by `balls-view.js` too. */
export const BALL_Y = BALL_RADIUS + 0.112;

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
  box(TABLE_LENGTH + 0.3, 0.14, 0.15, 0, 0.08, HALF_WIDTH + 0.09, materials.wood);
  box(TABLE_LENGTH + 0.3, 0.14, 0.15, 0, 0.08, -HALF_WIDTH - 0.09, materials.wood);
  box(0.15, 0.14, TABLE_WIDTH + 0.12, HALF_LENGTH + 0.09, 0.08, 0, materials.wood);
  box(0.15, 0.14, TABLE_WIDTH + 0.12, -HALF_LENGTH - 0.09, 0.08, 0, materials.wood);
  box(TABLE_LENGTH, 0.035, TABLE_WIDTH, 0, CLOTH_Y, 0, materials.felt, false);

  // --- cushions, straight off the collider's own segment list --------------
  for (const cushion of CUSHIONS) {
    const span = cushion.to - cushion.from;
    const middle = (cushion.from + cushion.to) / 2;
    if (cushion.rail === "long") {
      box(span, 0.055, 0.045, middle, 0.145, cushion.side * (HALF_WIDTH - 0.015), materials.rubber);
    } else {
      box(0.045, 0.055, span, cushion.side * (HALF_LENGTH - 0.015), 0.145, middle, materials.rubber);
    }
  }

  // --- pockets, straight off the collider's own pocket list ----------------
  for (const pocket of POCKETS) {
    const mouth = pocket.radius * 1.09;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(mouth, mouth, 0.032, 32), materials.pocket);
    hole.position.set(pocket.x, 0.115, pocket.z);
    table.add(hole);

    const liner = new THREE.Mesh(new THREE.TorusGeometry(mouth * 0.82, 0.012, 10, 28), materials.leather);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(pocket.x, 0.132, pocket.z);
    table.add(liner);
  }

  // --- diamond sights, in brass -------------------------------------------
  for (const x of [-0.95, -0.63, -0.31, 0.31, 0.63, 0.95]) {
    for (const z of [HALF_WIDTH + 0.09, -HALF_WIDTH - 0.09]) {
      const sight = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), materials.brass);
      sight.scale.set(1, 0.35, 1);
      sight.position.set(x, 0.165, z);
      table.add(sight);
    }
  }
  for (const z of [-0.42, -0.21, 0.21, 0.42]) {
    for (const x of [HALF_LENGTH + 0.09, -HALF_LENGTH - 0.09]) {
      const sight = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), materials.brass);
      sight.scale.set(1, 0.35, 1);
      sight.position.set(x, 0.165, z);
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
      box(0.17, 0.2, 0.17, sx * (HALF_LENGTH + 0.19), -0.06, sz * (HALF_WIDTH + 0.19), materials.brass);
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
