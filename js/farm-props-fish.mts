// The Trophy Mount: a fish from the Cove, mounted on a walnut board on two
// posts, with a brass plate. The catalog builds only the stand; the fish and
// the plate's words are the fish's own and arrive at run time
// (farm-angler-link.mts), because a mount row names a fish id and nothing else.
// The board is a named group the run time widens to the fish's length, so a
// Record Swordfish gets a board it fits on.

import { box, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder } from "./farm-materials.mjs";
import type { FarmDecorDefinition } from "./farm-catalog/decor.mjs";

/** Where the board and the plate are, in the mount's frame (front is +z). */
export const MOUNT_BOARD = Object.freeze({ y: 1.2, z: 0.07, width: 0.9, height: 0.62, depth: 0.05 });
export const MOUNT_PLATE = Object.freeze({ y: 0.84, z: 0.075, width: 0.36, height: 0.1 });
/** The widest a board grows, however long the fish. */
export const MOUNT_BOARD_MAX = 3.9;

function trophyMount(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  void definition;
  const group = new THREE.Group();
  const walnut = farmMaterial(THREE, "wood", { colors: ["#4a2d18", "#2a180b", "#6b4428"], metresPerTile: 0.5 });
  const post = farmMaterial(THREE, "wood", { colors: ["#6b4a2e", "#4a3220"] });
  // Two turned posts on feet.
  for (const side of [-1, 1]) {
    tcylinder(THREE, group, 0.035, 0.045, 1.5, [side * 0.34, 0.75, 0], post, 10);
    tbox(THREE, group, [0.2, 0.05, 0.3], [side * 0.34, 0.025, 0], post);
  }
  tbox(THREE, group, [0.76, 0.05, 0.06], [0, 0.62, 0], post);
  // The board, widened at run time to the fish.
  const board = new THREE.Group();
  board.name = "trophy-board";
  board.position.set(0, MOUNT_BOARD.y, MOUNT_BOARD.z - MOUNT_BOARD.depth / 2);
  tbox(THREE, board, [MOUNT_BOARD.width, MOUNT_BOARD.height, MOUNT_BOARD.depth], [0, 0, 0], walnut);
  tbox(THREE, board, [MOUNT_BOARD.width + 0.06, 0.04, MOUNT_BOARD.depth + 0.02], [0, MOUNT_BOARD.height / 2, 0], post);
  tbox(THREE, board, [MOUNT_BOARD.width + 0.06, 0.04, MOUNT_BOARD.depth + 0.02], [0, -MOUNT_BOARD.height / 2, 0], post);
  group.add(board);
  // The brass plate, blank until the fish's words are laid on it.
  box(THREE, group, [MOUNT_PLATE.width, MOUNT_PLATE.height, 0.012], [0, MOUNT_PLATE.y, MOUNT_PLATE.z - 0.006], standard(THREE, "#b8923a", 0.35, 0.6), false);
  return group;
}

export const FARM_FISH_PROP_BUILDERS: Readonly<Record<string, (THREE: ThreeNamespace, definition: FarmDecorDefinition) => any>> = Object.freeze({
  "trophy-mount": trophyMount,
});
