// What the Cove's stalls have on their counters: the Fishmonger's catch laid
// out on ice, and Bait & Tackle's rods, lures and tubs of worms. Real models
// from the fishing pack, so the stalls sell what the player will be holding.
// Handed to the market's stall model as its `stock` (farm-market-props.mts).

import { loadFish, loadFishingProp } from "./farm-fish-models.mjs";
import { FISHING_LURES, FISHING_RODS } from "./farm-catalog/fish.mjs";
import { tbox, tcylinder, farmMaterial, type ThreeNamespace } from "./farm-materials.mjs";
import type { StallStock } from "./farm-market-props.mjs";

/** The Fishmonger: a tray of crushed ice with the day's catch laid across it, and a hanging scale. */
export function fishmongerStock(THREE: ThreeNamespace): StallStock {
  return (group, frame) => {
    const ice = new THREE.MeshStandardMaterial({ color: "#e6f4fa", roughness: 0.35, metalness: 0.05 });
    const tray = farmMaterial(THREE, "galvanised", { colors: ["#b9c2c8", "#8c969c"] });
    const y = frame.counterHeight + 0.06;
    tbox(THREE, group, [frame.width - 0.3, 0.08, 0.5], [0, y, frame.front - 0.32], tray);
    tbox(THREE, group, [frame.width - 0.42, 0.04, 0.42], [0, y + 0.05, frame.front - 0.32], ice);
    const laid: readonly (readonly [string, number, number])[] = [
      ["fish.red-snapper", -1.05, 0.34], ["fish.tuna", -0.35, 0.5], ["fish.koi", 0.35, 0.34], ["fish.parrot-fish", 1.02, 0.32],
    ];
    for (const [speciesId, x, length] of laid) {
      void loadFish(THREE, speciesId, length).then((fish) => {
        // Laid on its side on the ice, nose to the customer's left.
        fish.root.rotation.set(0, Math.PI / 2, Math.PI / 2);
        fish.root.position.set(x, y + 0.13, frame.front - 0.32);
        group.add(fish.root);
      }).catch(() => undefined);
    }
    // The back shelf: a couple of bigger fish hung on hooks.
    const iron = new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.4, metalness: 0.7 });
    for (const [speciesId, x] of [["fish.swordfish", -0.7], ["fish.coral-grouper", 0.8]] as const) {
      tcylinder(THREE, group, 0.01, 0.01, 0.3, [x, frame.postHeight - 0.45, frame.back + 0.2], iron, 6, false);
      void loadFish(THREE, speciesId, 0.7).then((fish) => {
        fish.root.rotation.set(-Math.PI / 2, 0, 0);
        fish.root.position.set(x, frame.postHeight - 0.95, frame.back + 0.22);
        group.add(fish.root);
      }).catch(() => undefined);
    }
    tcylinder(THREE, group, 0.012, 0.012, 0.5, [frame.width / 2 - 0.3, frame.postHeight - 0.7, frame.front - 0.2], iron, 6, false);
    tcylinder(THREE, group, 0.16, 0.12, 0.04, [frame.width / 2 - 0.3, frame.postHeight - 0.97, frame.front - 0.2], iron, 16);
  };
}

/** Bait & Tackle: rods racked against the back wall, lures on a pegboard, tubs of worms on the counter. */
export function tackleStock(THREE: ThreeNamespace): StallStock {
  return (group, frame) => {
    const wood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128"] });
    const y = frame.counterHeight + 0.06;
    // Worm tubs: tin cans with earth in them.
    const tin = new THREE.MeshStandardMaterial({ color: "#8f9aa2", roughness: 0.45, metalness: 0.6 });
    const earth = new THREE.MeshStandardMaterial({ color: "#4a3322", roughness: 1 });
    for (const x of [-1.2, -0.9, -0.6]) {
      tcylinder(THREE, group, 0.1, 0.1, 0.14, [x, y + 0.07, frame.front - 0.3], tin, 14);
      tcylinder(THREE, group, 0.092, 0.092, 0.01, [x, y + 0.14, frame.front - 0.3], earth, 14);
    }
    void loadFishingProp("worm.glb").then((worm) => {
      worm.scale.setScalar(0.35);
      worm.position.set(-0.9, y + 0.15, frame.front - 0.3);
      group.add(worm);
    }).catch(() => undefined);
    // A pegboard of lures on the counter's right.
    tbox(THREE, group, [1.1, 0.6, 0.04], [0.8, y + 0.3, frame.front - 0.45], wood);
    FISHING_LURES.forEach((lure, index) => {
      void loadFishingProp(lure.file).then((model) => {
        model.scale.setScalar(0.07);
        model.position.set(0.45 + (index % 3) * 0.35, y + 0.46 - Math.floor(index / 3) * 0.28, frame.front - 0.41);
        group.add(model);
      }).catch(() => undefined);
    });
    // Rods leaning on the back wall, the best on the right.
    FISHING_RODS.forEach((rod, index) => {
      void loadFishingProp(rod.file).then((model) => {
        const box = new THREE.Box3().setFromObject(model);
        const height = Math.max(0.01, box.max.y - box.min.y);
        model.scale.setScalar(2.05 / height);
        model.position.set(-1.2 + index * 0.6, 0.02 - box.min.y * (2.05 / height), frame.back + 0.22);
        model.rotation.x = -0.1;
        group.add(model);
      }).catch(() => undefined);
    });
  };
}
