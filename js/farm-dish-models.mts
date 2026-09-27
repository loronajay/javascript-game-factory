// Cooked dishes as things. A recipe's `model` (farm-catalog/recipes.mts) says
// what it is served in and what is in it; this file turns that description
// into a dish at true size — a glazed bowl of stew with the potato showing, a
// jar of sauce under a gingham cloth with its name on the label, a lattice
// pie in a tin. The Kitchen Range sets the finished plate on its worktop, the
// Market's Kitchen stall stocks its counter with them, and every card that
// lists a dish shows this model.
//
// A vessel builder draws the vessel and answers where the food sits: a disc
// (a bowl's surface, a plate) or a rectangle (a baking dish), at a height.
// The bits are then scattered over it from a stream seeded by the recipe id,
// so a dish looks the same every time it is drawn. A three-star dish gets a
// sprig on top: the eye should be able to tell a careful cook from a rushed one.

import { lathe, leaf, paintedSurface, paintedTexture, place, seededRandom, surface, tint, type ThreeNamespace, type Vec3 } from "./farm-item-geometry.mjs";
import type { DishBit, DishModel, Recipe } from "./farm-catalog/recipes.mjs";

/** Where a vessel's contents are: a disc of `radius` or a `width` × `depth` rectangle, at height `y`. */
type Bed = Readonly<{ y: number; radius?: number; width?: number; depth?: number }>;
type VesselBuilder = (THREE: ThreeNamespace, group: any, model: DishModel, recipe: Recipe) => Bed;

/** One bit's unit: a centimetre and a bit. `size` on the bit scales it. */
const UNIT = 0.012;

function glaze(THREE: ThreeNamespace, color: string): any {
  return surface(THREE, color, { roughness: 0.28, metalness: 0.02, flat: false });
}

function glass(THREE: ThreeNamespace, color: string): any {
  return surface(THREE, color, { roughness: 0.08, metalness: 0.1, opacity: 0.38, flat: false, doubleSided: true });
}

/** A soup's, a sauce's, a filling's top: a disc lying flat, a little glossy. */
function pool(THREE: ThreeNamespace, group: any, color: string, radius: number, y: number, shine = 0.35): any {
  const geometry = new THREE.CircleGeometry(radius, 24);
  geometry.rotateX(-Math.PI / 2);
  return place(THREE, group, geometry, surface(THREE, color, { roughness: shine, flat: false }), [0, y, 0]);
}

const bowl: VesselBuilder = (THREE, group, model) => {
  const profile: [number, number][] = [[0, 0], [0.036, 0], [0.04, 0.007], [0.07, 0.028], [0.088, 0.058], [0.092, 0.064], [0.087, 0.066], [0.072, 0.036], [0.04, 0.016], [0, 0.016]];
  place(THREE, group, lathe(THREE, profile, 24), glaze(THREE, model.vesselColor), [0, 0, 0]);
  // A darker band inside the rim: a painted line, as on a farmhouse bowl.
  place(THREE, group, new THREE.TorusGeometry(0.089, 0.0022, 4, 28), glaze(THREE, tint(model.vesselColor, -0.35)), [0, 0.064, 0], [Math.PI / 2, 0, 0]);
  pool(THREE, group, model.fill, 0.08, 0.052);
  return { y: 0.053, radius: 0.066 };
};

function gingham(THREE: ThreeNamespace, color: string): any {
  const texture = paintedTexture(THREE, 64, 64, (context, w, h) => {
    context.fillStyle = "#f7f2e8";
    context.fillRect(0, 0, w, h);
    context.fillStyle = color;
    context.globalAlpha = 0.55;
    for (let index = 0; index < 8; index += 2) {
      context.fillRect((index * w) / 8, 0, w / 8, h);
      context.fillRect(0, (index * h) / 8, w, h / 8);
    }
  });
  if (texture) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 1);
  }
  return paintedSurface(THREE, color, texture, { roughness: 0.95, doubleSided: true });
}

function label(THREE: ThreeNamespace, title: string, ink: string): any {
  const texture = paintedTexture(THREE, 256, 96, (context, w, h) => {
    context.fillStyle = "#f4ecd6";
    context.fillRect(0, 0, w, h);
    context.strokeStyle = ink;
    context.lineWidth = 5;
    context.strokeRect(6, 6, w - 12, h - 12);
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 30px Georgia, serif";
    context.fillText(title, w / 2, h / 2, w - 28);
  });
  return paintedSurface(THREE, "#f4ecd6", texture, { roughness: 0.9, doubleSided: true });
}

const jar: VesselBuilder = (THREE, group, model, recipe) => {
  const profile: [number, number][] = [[0, 0.001], [0.042, 0.001], [0.046, 0.006], [0.046, 0.1], [0.041, 0.11], [0.037, 0.114], [0.037, 0.124]];
  place(THREE, group, lathe(THREE, profile, 20), glass(THREE, model.vesselColor), [0, 0, 0]);
  place(THREE, group, new THREE.CylinderGeometry(0.042, 0.042, 0.096, 20), surface(THREE, model.fill, { roughness: 0.3, flat: false }), [0, 0.052, 0]);
  // The name on a paper label round the front, the cloth over the lid, tied with twine.
  place(THREE, group, new THREE.CylinderGeometry(0.0468, 0.0468, 0.036, 20, 1, true, -0.95, 1.9), label(THREE, recipe.title, tint(model.fill, -0.2)), [0, 0.056, 0]);
  place(THREE, group, new THREE.CylinderGeometry(0.039, 0.039, 0.012, 18), surface(THREE, "#b9bec4", { roughness: 0.3, metalness: 0.7, flat: false }), [0, 0.127, 0]);
  if (model.cloth) {
    place(THREE, group, new THREE.CylinderGeometry(0.043, 0.043, 0.004, 18), gingham(THREE, model.cloth), [0, 0.135, 0]);
    place(THREE, group, new THREE.CylinderGeometry(0.043, 0.056, 0.03, 18, 1, true), gingham(THREE, model.cloth), [0, 0.121, 0]);
    place(THREE, group, new THREE.TorusGeometry(0.0435, 0.0022, 4, 22), surface(THREE, "#c9a66b", { roughness: 0.95 }), [0, 0.128, 0], [Math.PI / 2, 0, 0]);
  }
  // Garnish lies at the jar's foot, the way a jar is photographed.
  return { y: 0.001, width: 0.06, depth: 0.03 };
};

const pie: VesselBuilder = (THREE, group, model) => {
  const profile: [number, number][] = [[0, 0], [0.084, 0], [0.101, 0.028], [0.108, 0.031], [0.105, 0.034], [0.098, 0.031], [0.082, 0.004], [0, 0.004]];
  place(THREE, group, lathe(THREE, profile, 28), surface(THREE, model.vesselColor, { roughness: 0.3, metalness: 0.75, flat: false }), [0, 0, 0]);
  pool(THREE, group, model.fill, 0.096, 0.025, 0.5);
  place(THREE, group, new THREE.TorusGeometry(0.095, 0.009, 6, 32), surface(THREE, model.crustColor, { roughness: 0.8 }), [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  if (model.crust === "lattice") {
    const crust = surface(THREE, model.crustColor, { roughness: 0.8 });
    for (const turn of [0, Math.PI / 2]) {
      for (let index = -2; index <= 2; index += 1) {
        const offset = index * 0.034;
        const length = 2 * Math.sqrt(Math.max(0, 0.095 ** 2 - offset ** 2));
        const strip = new THREE.BoxGeometry(length, 0.005, 0.014);
        strip.translate(0, 0, offset);
        place(THREE, group, strip, crust, [0, 0.031 + (turn ? 0.004 : 0), 0], [0, turn, 0]);
      }
    }
  }
  return { y: 0.027, radius: 0.07 };
};

const bakingDish: VesselBuilder = (THREE, group, model) => {
  const [width, depth, height, wall] = [0.2, 0.14, 0.05, 0.008];
  const clay = glaze(THREE, model.vesselColor);
  place(THREE, group, new THREE.BoxGeometry(width, wall, depth), clay, [0, wall / 2, 0]);
  place(THREE, group, new THREE.BoxGeometry(width, height, wall), clay, [0, height / 2, depth / 2 - wall / 2]);
  place(THREE, group, new THREE.BoxGeometry(width, height, wall), clay, [0, height / 2, -depth / 2 + wall / 2]);
  place(THREE, group, new THREE.BoxGeometry(wall, height, depth), clay, [width / 2 - wall / 2, height / 2, 0]);
  place(THREE, group, new THREE.BoxGeometry(wall, height, depth), clay, [-width / 2 + wall / 2, height / 2, 0]);
  for (const side of [-1, 1]) place(THREE, group, new THREE.BoxGeometry(0.018, 0.01, 0.06), clay, [side * (width / 2 + 0.008), height - 0.012, 0]);
  place(THREE, group, new THREE.BoxGeometry(width - wall * 2, 0.034, depth - wall * 2), surface(THREE, model.fill, { roughness: 0.55, flat: false }), [0, wall + 0.017, 0]);
  return { y: wall + 0.034, width: width - 0.04, depth: depth - 0.036 };
};

const plate: VesselBuilder = (THREE, group, model) => {
  const profile: [number, number][] = [[0, 0], [0.085, 0], [0.118, 0.012], [0.125, 0.015], [0.119, 0.017], [0.086, 0.007], [0, 0.007]];
  place(THREE, group, lathe(THREE, profile, 28), glaze(THREE, model.vesselColor), [0, 0, 0]);
  place(THREE, group, new THREE.TorusGeometry(0.108, 0.0016, 4, 32), glaze(THREE, "#3f6f9a"), [0, 0.0125, 0], [Math.PI / 2, 0, 0]);
  return { y: 0.007, radius: 0.07 };
};

const cup: VesselBuilder = (THREE, group, model) => {
  const profile: [number, number][] = [[0, 0.001], [0.034, 0.001], [0.034, 0.005], [0.006, 0.012], [0.006, 0.058], [0.024, 0.066], [0.052, 0.084], [0.06, 0.1]];
  place(THREE, group, lathe(THREE, profile, 22), glass(THREE, model.vesselColor), [0, 0, 0]);
  place(THREE, group, new THREE.SphereGeometry(0.052, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), surface(THREE, model.fill, { roughness: 0.6, flat: false }), [0, 0.1, 0], [0, 0, 0], [1, 0.62, 1]);
  return { y: 0.1, radius: 0.028 };
};

const pumpkinBowl: VesselBuilder = (THREE, group, model) => {
  const lobeRadius = 0.1;
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    // Each lobe is cut off flat where the top was sliced away.
    const lobe = new THREE.SphereGeometry(lobeRadius, 12, 9, 0, Math.PI * 2, Math.PI * 0.22, Math.PI * 0.78);
    place(THREE, group, lobe, surface(THREE, index % 2 ? model.vesselColor : tint(model.vesselColor, -0.08), { roughness: 0.55, doubleSided: true }), [Math.cos(angle) * 0.07, 0.09, Math.sin(angle) * 0.07], [0, -angle, 0], [0.62, 0.9, 0.9]);
  }
  place(THREE, group, new THREE.CylinderGeometry(0.098, 0.098, 0.008, 24), surface(THREE, "#f6c46a", { roughness: 0.7 }), [0, 0.162, 0]);
  pool(THREE, group, model.fill, 0.086, 0.167);
  // The lid it was cut from, stalk and all, leaning at its side.
  const lid = new THREE.Group();
  place(THREE, lid, new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), surface(THREE, model.vesselColor, { roughness: 0.55 }), [0, -0.05, 0]);
  place(THREE, lid, new THREE.CylinderGeometry(0.008, 0.012, 0.04, 6), surface(THREE, "#5f6b2a"), [0, 0.02, 0], [0, 0, 0.25]);
  lid.position.set(0.14, 0.028, 0.03);
  lid.rotation.set(0.2, 0, -1.1);
  group.add(lid);
  return { y: 0.168, radius: 0.06 };
};

const bag: VesselBuilder = (THREE, group, model) => {
  const paper = surface(THREE, model.vesselColor, { roughness: 0.95 });
  const [width, depth, height] = [0.075, 0.052, 0.1];
  place(THREE, group, new THREE.BoxGeometry(width, 0.004, depth), paper, [0, 0.002, 0]);
  for (const [w, x, z, turn] of [[width, 0, depth / 2, 0], [width, 0, -depth / 2, 0], [depth, width / 2, 0, Math.PI / 2], [depth, -width / 2, 0, Math.PI / 2]] as const) {
    place(THREE, group, new THREE.BoxGeometry(w, height, 0.003), paper, [x, height / 2, z], [0, turn, 0]);
  }
  // The top rolled down once.
  place(THREE, group, new THREE.BoxGeometry(width + 0.006, 0.018, depth + 0.006), surface(THREE, tint(model.vesselColor, -0.12), { roughness: 0.95 }), [0, height - 0.006, 0]);
  place(THREE, group, new THREE.SphereGeometry(0.045, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, model.fill, { roughness: 0.9 }), [0, height - 0.01, 0], [0, 0, 0], [0.8, 0.5, 0.56]);
  // A stamped sunflower on the front of the bag.
  const stamp = paintedTexture(THREE, 64, 64, (context, w, h) => {
    context.fillStyle = model.vesselColor;
    context.fillRect(0, 0, w, h);
    context.fillStyle = "#e0a91e";
    for (let petal = 0; petal < 10; petal += 1) {
      const angle = (petal / 10) * Math.PI * 2;
      context.beginPath();
      context.ellipse(w / 2 + Math.cos(angle) * 14, h / 2 + Math.sin(angle) * 14, 9, 4, angle, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "#4a2f18";
    context.beginPath();
    context.arc(w / 2, h / 2, 10, 0, Math.PI * 2);
    context.fill();
  });
  if (stamp) place(THREE, group, new THREE.PlaneGeometry(0.05, 0.05), paintedSurface(THREE, model.vesselColor, stamp, { roughness: 0.95 }), [0, height * 0.45, depth / 2 + 0.002]);
  return { y: height + 0.008, width: 0.05, depth: 0.03 };
};

const VESSELS: Readonly<Record<DishModel["vessel"], VesselBuilder>> = Object.freeze({
  bowl, jar, pie, "baking-dish": bakingDish, plate, cup, pumpkin: pumpkinBowl, bag,
});

// ---------------------------------------------------------------- the food on it

function bitMesh(THREE: ThreeNamespace, group: any, entry: DishBit, model: DishModel, position: Vec3, turn: number, random: () => number): void {
  const size = UNIT * entry.size;
  const material = surface(THREE, entry.color, { roughness: 0.55 });
  const tumble: Vec3 = [random() * 0.6 - 0.3, turn, random() * 0.6 - 0.3];
  switch (entry.shape) {
    case "cube":
      place(THREE, group, new THREE.BoxGeometry(size, size * 0.85, size), material, [position[0], position[1] + size * 0.3, position[2]], [random(), turn, random()]);
      return;
    case "round":
      place(THREE, group, new THREE.SphereGeometry(size * 0.6, 10, 8), material, [position[0], position[1] + size * 0.45, position[2]], tumble);
      return;
    case "leaf":
      leaf(THREE, group, entry.color, size * 1.8, [position[0], position[1] + 0.003, position[2]], [random() * 0.3, turn, 0.15]);
      return;
    case "bean":
      place(THREE, group, new THREE.SphereGeometry(size * 0.45, 8, 6), material, [position[0], position[1] + size * 0.2, position[2]], tumble, [1.6, 0.8, 0.9]);
      return;
    case "kernel":
      place(THREE, group, new THREE.BoxGeometry(size * 0.5, size * 0.42, size * 0.5), material, [position[0], position[1] + size * 0.15, position[2]], tumble);
      return;
    case "wedge":
      place(THREE, group, new THREE.CylinderGeometry(size * 0.75, size * 0.75, size * 1.4, 3), material, [position[0], position[1] + size * 0.35, position[2]], [Math.PI / 2, turn, 0]);
      return;
    case "slice":
      place(THREE, group, new THREE.CylinderGeometry(size * 1.3, size * 1.3, size * 0.22, 12, 1, false, 0, Math.PI), material, [position[0], position[1] + size * 0.12, position[2]], [0, turn, 0.12]);
      return;
    case "seed":
      place(THREE, group, new THREE.SphereGeometry(size * 0.24, 6, 4), material, [position[0], position[1] + size * 0.08, position[2]], tumble, [1.8, 0.6, 1]);
      return;
    case "half": {
      // A halved vegetable, cut face down; a big one is a boat with the filling heaped in it.
      const boat = entry.size >= 2;
      place(THREE, group, new THREE.SphereGeometry(size * 0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), material, position, [0, turn, 0], boat ? [1.7, 0.7, 1] : [1, 0.8, 1]);
      if (boat) place(THREE, group, new THREE.SphereGeometry(size * 0.62, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, model.fill, { roughness: 0.7 }), [position[0], position[1] + size * 0.46, position[2]], [0, turn, 0], [1.6, 0.45, 0.85]);
      return;
    }
  }
}

/** Scatter the bits over the bed; a bed's own shape decides where a bit may land. */
function scatter(THREE: ThreeNamespace, group: any, model: DishModel, bed: Bed, random: () => number): void {
  for (const entry of model.bits) {
    for (let index = 0; index < entry.count; index += 1) {
      let x = 0;
      let z = 0;
      if (bed.radius !== undefined) {
        // A single large bit sits in the middle; a handful fan out round it.
        const radius = entry.count === 1 ? 0 : bed.radius * Math.sqrt(0.15 + random() * 0.85);
        const angle = entry.count <= 4 ? (index / entry.count) * Math.PI * 2 + random() * 0.4 : random() * Math.PI * 2;
        x = Math.cos(angle) * radius * (entry.count <= 4 ? 0.6 : 1);
        z = Math.sin(angle) * radius * (entry.count <= 4 ? 0.6 : 1);
      } else {
        const columns = Math.ceil(Math.sqrt(entry.count));
        const rows = Math.ceil(entry.count / columns);
        // Keep a big bit's whole body inside the dish, not just its centre.
        const margin = UNIT * entry.size * 0.7;
        const width = Math.max(0, (bed.width ?? 0.1) - margin * 2);
        const depth = Math.max(0, (bed.depth ?? 0.1) - margin * 2);
        x = columns > 1 ? ((index % columns) / (columns - 1) - 0.5) * width + (random() - 0.5) * 0.008 : 0;
        z = rows > 1 ? (Math.floor(index / columns) / (rows - 1) - 0.5) * depth + (random() - 0.5) * 0.008 : 0;
      }
          // A cup's garnish rides on top of its scoops.
      const lift = model.vessel === "cup" && entry.shape === "round" && entry.size < 2 ? UNIT * 3 : 0;
      bitMesh(THREE, group, entry, model, [x, bed.y + lift, z], random() * Math.PI * 2, random);
    }
  }
}

/** The sprig a three-star dish is finished with. */
function sprig(THREE: ThreeNamespace, group: any, bed: Bed, vessel: DishModel["vessel"]): void {
  const y = vessel === "jar" ? 0.14 : bed.y + 0.012;
  const x = vessel === "jar" ? 0 : (bed.radius ?? (bed.width ?? 0.1) / 2) * 0.35;
  for (const turn of [0.3, 1.9, 3.4]) leaf(THREE, group, "#2f8a3a", 0.03, [x + Math.cos(turn) * 0.008, y, Math.sin(turn) * 0.008], [0.2, turn, 0.35]);
  place(THREE, group, new THREE.SphereGeometry(0.004, 6, 4), surface(THREE, "#c8302c", { roughness: 0.3 }), [x, y + 0.006, 0]);
}

/** A cooked dish of `recipe`, at true size, base on y = 0. `stars` 3 adds the finishing sprig. */
export function createDishModel(THREE: ThreeNamespace, recipe: Recipe, stars = 2): any {
  const group = new THREE.Group();
  group.name = `dish-${recipe.id}`;
  const model = recipe.model;
  const bed = VESSELS[model.vessel](THREE, group, model, recipe);
  scatter(THREE, group, model, bed, seededRandom(recipe.id));
  if (model.crust === "crumble") {
    const random = seededRandom(`${recipe.id}:crumble`);
    const crumb = surface(THREE, model.crustColor, { roughness: 0.85 });
    const width = bed.width ?? (bed.radius ?? 0.07) * 1.6;
    const depth = bed.depth ?? (bed.radius ?? 0.07) * 1.6;
    for (let index = 0; index < 34; index += 1) {
      place(THREE, group, new THREE.IcosahedronGeometry(0.008 + random() * 0.006, 0), crumb, [(random() - 0.5) * width, bed.y + 0.003, (random() - 0.5) * depth], [random() * 3, random() * 3, random() * 3]);
    }
  }
  if (stars >= 3) sprig(THREE, group, bed, model.vessel);
  return group;
}

export const DISH_VESSELS = Object.freeze(Object.keys(VESSELS)) as readonly DishModel["vessel"][];
