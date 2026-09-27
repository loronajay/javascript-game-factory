// Cooking, in the world: what the player sees happen on the Kitchen Range
// while they play the cooking games (farm-cooking.mts), so a cook is
// something done at a stove and not a bar on the screen.
//
//   begin    the recipe's ingredients — the real models — are laid out on the
//            chopping board, and the knife is taken up.
//   chop     every cut brings the knife down and turns its share of the
//            whole ingredients into pieces on the board; the last cut leaves
//            nothing whole.
//   stir     what is on the board goes into the pot, the lid comes off, the
//            pot is full of the dish's colour, and a wooden spoon goes round
//            it — faster on a good stir.
//   simmer   the firebox follows the heat the player holds: bubbles and steam
//            rise with it, and the lid rattles when it runs hot.
//   bake     the oven window glows with the bake's doneness.
//   finish   the board is cleared and the plated dish is set down on the
//            worktop cloth, steaming, where it stays until the next cook.
//
// Everything is placed in the range's own frame (KITCHEN_ANCHORS), and the
// range's fire, oven, lid and pot are changed only through the handle its
// model carries (farm-props-kitchen.mts).

import { KITCHEN_ANCHORS, type KitchenRow } from "./farm-kitchen.mjs";
import { createProduceModel } from "./farm-produce-models.mjs";
import { createDishModel } from "./farm-dish-models.mjs";
import { place, surface, type ThreeNamespace } from "./farm-item-geometry.mjs";
import { disposeModelTree } from "./space-editor/model-thumbnails.mjs";
import type { Recipe } from "./farm-catalog/recipes.mjs";
import type { KitchenRangeHandle } from "./farm-props-kitchen.mjs";

export type KitchenWorld = Readonly<{ modelFor: (instanceId: string) => any | undefined }>;

export type KitchenView = Readonly<{
  begin: (row: KitchenRow, recipe: Recipe) => void;
  /** A knife stroke; `hit` false is a glancing one. `cutsLeft` after it decides how much it chops. */
  cut: (hit: boolean, cutsLeft: number) => void;
  stirring: (on: boolean) => void;
  stir: (hit: boolean) => void;
  /** 0..1: the heat the player holds under a simmer. */
  heat: (level: number) => void;
  /** 0..1 doneness of a bake, or null when nothing is in the oven. */
  bake: (doneness: number | null) => void;
  finish: (recipe: Recipe, stars: number) => void;
  cancel: () => void;
  /** The farm's decor changed: follow the range if it moved, clear up if it went. */
  sync: (decor: readonly KitchenRow[]) => void;
  update: (dt: number) => void;
}>;

/** A soft white puff for steam, drawn once. */
function puffTexture(THREE: ThreeNamespace): any | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** An item model's first colour: what its chopped pieces look like. */
function colourOf(model: any): string {
  let colour = "#c9a06a";
  model.traverse?.((object: any) => {
    if (colour !== "#c9a06a" || !object.material?.color) return;
    colour = `#${object.material.color.getHexString()}`;
  });
  return colour;
}

/** Scale a model so its largest side is at most `size` metres; returns the scale used. */
function fitWithin(THREE: ThreeNamespace, model: any, size: number): number {
  const extent = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const largest = Math.max(extent.x, extent.y, extent.z, 1e-3);
  const scale = Math.min(1, size / largest);
  model.scale.setScalar(scale);
  return scale;
}

export function createKitchenView(THREE: ThreeNamespace, scene: any, world: KitchenWorld): KitchenView {
  const root = new THREE.Group();
  root.name = "kitchen-work";
  scene.add(root);
  const puff = puffTexture(THREE);
  const steam: { sprite: any; age: number; life: number; drift: number }[] = [];
  const bubbles: { mesh: any; age: number; life: number }[] = [];
  let row: KitchenRow | null = null;
  let recipe: Recipe | null = null;
  let whole: any[] = [];
  let pieces: any[] = [];
  let plated: any = null;
  let platedSteam = 0;
  let spoon: any = null;
  let stirSpeed = 0;
  let spoonAngle = 0;
  let knifeDrop = 0;
  let heatLevel = 0;
  let simmering = false;
  let random = 0.37;
  const next = () => (random = (random * 9301 + 49297) % 233280) / 233280;

  const handle = (): KitchenRangeHandle | null => (row ? world.modelFor(row.instanceId)?.userData?.kitchen ?? null : null);
  const knife = (): any => (row ? world.modelFor(row.instanceId)?.getObjectByName?.("kitchen-knife") ?? null : null);
  const knifeRest = { x: KITCHEN_ANCHORS.board.x + 0.05, y: KITCHEN_ANCHORS.board.y + 0.01, z: KITCHEN_ANCHORS.board.z + 0.16, turn: -0.2 };

  function place0(object: any, x: number, y: number, z: number): any {
    object.position.set(x, y, z);
    root.add(object);
    return object;
  }

  /** Take a model out of the world and free what it was built from. */
  function drop(object: any): void {
    root.remove(object);
    disposeModelTree(object);
  }

  function clear(list: any[]): void {
    for (const object of list) drop(object);
    list.length = 0;
  }

  function resetKnife(): void {
    const blade = knife();
    if (!blade) return;
    blade.position.set(knifeRest.x, knifeRest.y, knifeRest.z);
    blade.rotation.set(0, knifeRest.turn, 0);
  }

  function reset(): void {
    clear(whole);
    clear(pieces);
    if (spoon) drop(spoon);
    spoon = null;
    stirSpeed = 0;
    simmering = false;
    heatLevel = 0;
    knifeDrop = 0;
    resetKnife();
    const range = handle();
    range?.setHeat(0);
    range?.setOven(0);
    range?.setLidOpen(false);
    range?.setPotFill("");
  }

  function poseRoot(): void {
    if (!row) return;
    root.position.set(row.x, 0, row.z);
    root.rotation.set(0, row.rotationY, 0);
  }

  function begin(nextRow: KitchenRow, nextRecipe: Recipe): void {
    reset();
    row = nextRow;
    recipe = nextRecipe;
    poseRoot();
    if (plated) {
      drop(plated);
      plated = null;
    }
    // Up to three of each ingredient, laid across the board in a row.
    const models: any[] = [];
    for (const [id, count] of Object.entries(nextRecipe.ingredients)) {
      for (let index = 0; index < Math.min(3, count); index += 1) {
        const model = createProduceModel(THREE, id);
        if (model) models.push(model);
      }
    }
    const { board } = KITCHEN_ANCHORS;
    const across = 0.34;
    // Two rows when there are many: the tallest things at the back, so nothing flat hides behind a tomato.
    for (const model of models) fitWithin(THREE, model, models.length > 5 ? 0.075 : 0.1);
    const height = (model: any) => new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
    if (models.length > 5) models.sort((a, b) => height(b) - height(a));
    models.forEach((model, index) => {
      const column = models.length > 5 ? index % Math.ceil(models.length / 2) : index;
      const columns = models.length > 5 ? Math.ceil(models.length / 2) : models.length;
      const rowOffset = models.length > 5 ? (index < columns ? -0.065 : 0.065) : 0;
      model.rotation.y = next() * Math.PI * 2;
      place0(model, board.x - across / 2 + (across * (column + 0.5)) / columns, board.y, board.z + rowOffset);
      whole.push(model);
    });
    handle()?.setPotFill("");
    // Take up the knife: it hovers over the board, ready.
    const blade = knife();
    if (blade) {
      blade.position.set(board.x, board.y + 0.09, board.z + 0.02);
      blade.rotation.set(0, 0.4, -0.35);
    }
  }

  function cut(hit: boolean, cutsLeft: number): void {
    knifeDrop = 1;
    // Share the board out over the cuts left, so the last cut leaves nothing whole.
    const share = cutsLeft <= 0 ? whole.length : Math.ceil(whole.length / (cutsLeft + 1));
    for (const target of whole.splice(0, share)) {
      const colour = colourOf(target);
      const at = target.position.clone();
      drop(target);
      // Pieces fall where the whole thing was: neat dice for a clean cut, rough chunks for a poor one.
      const material = surface(THREE, colour, { roughness: 0.6 });
      const count = hit ? 6 : 3;
      for (let index = 0; index < count; index += 1) {
        const size = hit ? 0.014 : 0.024;
        const piece = place(THREE, root, new THREE.BoxGeometry(size, size * 0.8, size), material, [at.x + (next() - 0.5) * 0.06, at.y + size * 0.4, at.z + (next() - 0.5) * 0.05], [next(), next() * 3, next()]);
        pieces.push(piece);
      }
    }
  }

  /** Whatever is on the board — whole or chopped — goes into the pot or the oven. */
  function clearBoard(): void {
    clear(whole);
    clear(pieces);
    resetKnife();
  }

  function stirring(on: boolean): void {
    if (on) clearBoard();
    const range = handle();
    range?.setLidOpen(on || simmering);
    if (on && recipe) range?.setPotFill(recipe.model.fill);
    if (on && !spoon) {
      spoon = new THREE.Group();
      const wood = surface(THREE, "#c9a06a", { roughness: 0.8, flat: false });
      place(THREE, spoon, new THREE.CylinderGeometry(0.006, 0.008, 0.3, 6), wood, [0, 0.15, 0]);
      place(THREE, spoon, new THREE.SphereGeometry(0.022, 10, 6), wood, [0, 0, 0], [0, 0, 0], [1, 0.35, 1.4]);
      spoon.rotation.z = 0.35;
      root.add(spoon);
    }
    if (!on && spoon) {
      drop(spoon);
      spoon = null;
    }
  }

  function stir(hit: boolean): void {
    stirSpeed = hit ? 9 : 2;
  }

  function heat(level: number): void {
    if (!simmering) clearBoard();
    simmering = true;
    heatLevel = Math.min(1, Math.max(0, level));
    const range = handle();
    range?.setHeat(heatLevel);
    range?.setLidOpen(true);
    if (recipe) range?.setPotFill(recipe.model.fill);
  }

  function bake(doneness: number | null): void {
    if (doneness !== null) clearBoard();
    simmering = false;
    const range = handle();
    range?.setLidOpen(false);
    if (doneness === null) {
      range?.setOven(0);
      return;
    }
    range?.setOven(Math.min(1, 0.25 + doneness * 0.75));
    range?.setHeat(0.55);
  }

  function finish(done: Recipe, stars: number): void {
    reset();
    recipe = null;
    if (!row) return;
    poseRoot();
    plated = createDishModel(THREE, done, stars);
    plated.scale.setScalar(1.25);
    const { plate } = KITCHEN_ANCHORS;
    place0(plated, plate.x, plate.y, plate.z);
    platedSteam = 6;
  }

  function cancel(): void {
    reset();
    recipe = null;
  }

  function sync(decor: readonly KitchenRow[]): void {
    if (!row) return;
    const moved = decor.find((entry) => entry.instanceId === row!.instanceId);
    if (moved) {
      row = moved;
      poseRoot();
      return;
    }
    reset();
    recipe = null;
    if (plated) drop(plated);
    plated = null;
    row = null;
  }

  function emitSteam(x: number, y: number, z: number, scale: number): void {
    if (!puff || steam.length > 40) return;
    const material = new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.5 });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x + (next() - 0.5) * 0.08, y, z + (next() - 0.5) * 0.08);
    sprite.scale.setScalar(0.08 * scale);
    root.add(sprite);
    steam.push({ sprite, age: 0, life: 1.4 + next() * 0.8, drift: (next() - 0.5) * 0.06 });
  }

  function emitBubble(): void {
    if (bubbles.length > 14 || !recipe) return;
    const { hob } = KITCHEN_ANCHORS;
    const angle = next() * Math.PI * 2;
    const radius = next() * 0.08;
    const mesh = place(THREE, root, new THREE.SphereGeometry(0.008 + next() * 0.008, 8, 6), surface(THREE, recipe.model.fill, { roughness: 0.2, flat: false }), [hob.x + Math.cos(angle) * radius, 1.05, hob.z + Math.sin(angle) * radius]);
    bubbles.push({ mesh, age: 0, life: 0.35 + next() * 0.3 });
  }

  let steamClock = 0;
  function update(dt: number): void {
    if (!row) return;
    const { hob, plate } = KITCHEN_ANCHORS;
    // The knife comes down on a cut and lifts back up.
    const blade = knife();
    if (blade && recipe && whole.length + pieces.length > 0) {
      knifeDrop = Math.max(0, knifeDrop - dt * 7);
      blade.position.y = KITCHEN_ANCHORS.board.y + 0.02 + 0.07 * (1 - knifeDrop);
      blade.rotation.z = -0.35 + knifeDrop * 0.3;
    }
    if (spoon) {
      stirSpeed = Math.max(1.2, stirSpeed - dt * 6);
      spoonAngle += dt * stirSpeed;
      spoon.position.set(hob.x + Math.cos(spoonAngle) * 0.05, 1.04, hob.z + Math.sin(spoonAngle) * 0.05);
      spoon.rotation.y = -spoonAngle;
    }
    steamClock += dt;
    const potSteam = simmering ? heatLevel : spoon ? 0.35 : 0;
    const interval = potSteam > 0 ? 0.5 / (0.3 + potSteam * 2) : Infinity;
    if (steamClock > interval) {
      steamClock = 0;
      emitSteam(hob.x, 1.1, hob.z, 1 + potSteam);
      if (simmering && heatLevel > 0.3) emitBubble();
    }
    if (plated && platedSteam > 0) {
      platedSteam -= dt;
      if (next() < dt * 3) emitSteam(plate.x, plate.y + 0.12, plate.z, 0.7);
    }
    for (let index = steam.length - 1; index >= 0; index -= 1) {
      const puffy = steam[index]!;
      puffy.age += dt;
      const t = puffy.age / puffy.life;
      puffy.sprite.position.y += dt * 0.22;
      puffy.sprite.position.x += dt * puffy.drift;
      puffy.sprite.scale.setScalar(puffy.sprite.scale.x + dt * 0.08);
      puffy.sprite.material.opacity = 0.5 * (1 - t);
      if (t >= 1) {
        root.remove(puffy.sprite);
        puffy.sprite.material.dispose();
        steam.splice(index, 1);
      }
    }
    for (let index = bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = bubbles[index]!;
      bubble.age += dt;
      bubble.mesh.scale.setScalar(1 + bubble.age * 2);
      if (bubble.age >= bubble.life) {
        drop(bubble.mesh);
        bubbles.splice(index, 1);
      }
    }
  }

  return Object.freeze({ begin, cut, stirring, stir, heat, bake, finish, cancel, sync, update });
}
