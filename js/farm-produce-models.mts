// The harvest basket as things: every crop and every fruit, built at true
// size from the shared item vocabulary (`farm-item-geometry.mts`). A tomato
// is a tomato — a red, ribbed globe under a green star — not a word in a
// list. The cooking view lays these on the chopping board, the Produce
// Merchant's panel and the Order Board show them, and the inventory's harvest
// basket is a shelf of them.
//
// `PRODUCE_BUILDERS` is keyed by harvest-basket id (farm-crops.mts,
// farm-catalog/trees.mts, and the herd's goods and meat in
// farm-catalog/livestock.mts); a test asserts every basket id has one.

import { calyx, lathe, leaf, place, stem, surface, tint, type ThreeNamespace } from "./farm-item-geometry.mjs";
import { FRUIT_TREES } from "./farm-catalog/trees.mjs";
import { paintedSurface, paintedTexture } from "./farm-item-geometry.mjs";

type Builder = (THREE: ThreeNamespace, group: any) => void;

const LEAF = "#4f9a3a";
const STALK = "#6b8a3a";
const WOOD_STEM = "#5d3a1f";

function globe(THREE: ThreeNamespace, group: any, color: string, radius: number, squash: readonly [number, number, number], y: number, options: { roughness?: number; segments?: readonly [number, number] } = {}): any {
  const [widthSegments, heightSegments] = options.segments ?? [12, 9];
  return place(THREE, group, new THREE.SphereGeometry(radius, widthSegments, heightSegments), surface(THREE, color, { roughness: options.roughness ?? 0.5 }), [0, y, 0], [0, 0, 0], squash);
}

/** A taproot: a cone from the shoulder down to a point, lying on its side like one pulled from the ground. */
function root(THREE: ThreeNamespace, group: any, color: string, radius: number, length: number, leaves: string, leafStems = LEAF): void {
  const body = new THREE.Group();
  const geometry = new THREE.ConeGeometry(radius, length, 9, 3);
  geometry.rotateZ(Math.PI);
  place(THREE, body, geometry, surface(THREE, color, { roughness: 0.7 }), [0, -length / 2, 0]);
  place(THREE, body, new THREE.SphereGeometry(radius, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, color, { roughness: 0.7 }), [0, 0, 0]);
  for (const [lean, turn] of [[-0.35, 0], [0.1, 2.1], [0.4, 4.2]] as const) {
    const blade = new THREE.Group();
    blade.rotation.set(lean, turn, 0);
    stem(THREE, blade, leafStems, radius * 0.12, length * 0.55, [0, 0, 0]);
    leaf(THREE, blade, leaves, length * 0.45, [0, length * 0.62, 0], [0, 0, Math.PI / 2]);
    body.add(blade);
  }
  body.rotation.z = Math.PI / 2 - 0.08;
  body.position.set(length * 0.15, radius, 0);
  group.add(body);
}

/** A bulb root (beet, radish): a globe with a tail and a tuft. */
function bulb(THREE: ThreeNamespace, group: any, color: string, radius: number, tail: string, leaves: string, leafStems: string): void {
  globe(THREE, group, color, radius, [1, 0.95, 1], radius * 0.95);
  const tailGeometry = new THREE.ConeGeometry(radius * 0.18, radius * 1.3, 6);
  place(THREE, group, tailGeometry, surface(THREE, tail), [radius * 0.9, radius * 0.35, 0], [0, 0, Math.PI / 2 + 0.5]);
  for (const turn of [0, 1.9, 3.8]) {
    const tuft = new THREE.Group();
    tuft.rotation.set(0.35, turn, 0);
    tuft.position.set(0, radius * 1.8, 0);
    stem(THREE, tuft, leafStems, radius * 0.07, radius * 1.1, [0, 0, 0]);
    leaf(THREE, tuft, leaves, radius * 1.4, [0, radius * 1.4, 0], [0, 0, Math.PI / 2]);
    group.add(tuft);
  }
}

const tomato: Builder = (THREE, group) => {
  // Six soft lobes make the ribbed shoulder of a ripe tomato.
  globe(THREE, group, "#d8342a", 0.045, [1, 0.78, 1], 0.036, { roughness: 0.35 });
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    place(THREE, group, new THREE.SphereGeometry(0.024, 8, 6), surface(THREE, "#cf2f26", { roughness: 0.35 }), [Math.cos(angle) * 0.022, 0.045, Math.sin(angle) * 0.022]);
  }
  calyx(THREE, group, "#3f7f2a", 0.03, 0.069, 5, 0.25);
  stem(THREE, group, "#3f7f2a", 0.004, 0.014, [0, 0.068, 0]);
};

const carrot: Builder = (THREE, group) => root(THREE, group, "#f08a24", 0.022, 0.16, "#5aa83e");

const potato: Builder = (THREE, group) => {
  globe(THREE, group, "#b88a52", 0.05, [1.3, 0.72, 0.95], 0.034, { roughness: 0.95, segments: [8, 6] });
  for (const [x, y, z] of [[0.04, 0.05, 0.02], [-0.03, 0.058, -0.012], [0.012, 0.03, 0.045]] as const) {
    place(THREE, group, new THREE.SphereGeometry(0.004, 5, 4), surface(THREE, "#6e4d2c"), [x, y, z]);
  }
};

const pumpkin: Builder = (THREE, group) => {
  const orange = "#e8761c";
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    place(THREE, group, new THREE.SphereGeometry(0.075, 10, 8), surface(THREE, index % 2 ? orange : tint(orange, -0.06), { roughness: 0.55 }), [Math.cos(angle) * 0.055, 0.075, Math.sin(angle) * 0.055], [0, -angle, 0], [0.62, 0.95, 0.9]);
  }
  const stalk = new THREE.CylinderGeometry(0.01, 0.016, 0.06, 6);
  stalk.translate(0, 0.03, 0);
  place(THREE, group, stalk, surface(THREE, "#5f6b2a", { roughness: 0.9 }), [0, 0.14, 0], [0, 0, 0.3]);
  leaf(THREE, group, LEAF, 0.07, [0.03, 0.148, 0.02], [0.3, 0.6, -0.2]);
};

const watermelon: Builder = (THREE, group) => {
  globe(THREE, group, "#2f7a34", 0.09, [1.35, 0.95, 1], 0.085, { roughness: 0.4, segments: [16, 12] });
  // The pale stripes, as slim lenses laid over the rind from end to end.
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const stripe = new THREE.SphereGeometry(0.0905, 16, 12, angle, 0.16);
    place(THREE, group, stripe, surface(THREE, "#8cc56a", { roughness: 0.4 }), [0, 0.085, 0], [0, 0, Math.PI / 2], [0.95, 1.35, 1]);
  }
};

const corn: Builder = (THREE, group) => {
  const cob = new THREE.Group();
  const kernels = new THREE.CylinderGeometry(0.026, 0.021, 0.16, 10, 6);
  place(THREE, cob, kernels, surface(THREE, "#f2c83a", { roughness: 0.45 }), [0, 0, 0]);
  place(THREE, cob, new THREE.SphereGeometry(0.026, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, "#f2c83a", { roughness: 0.45 }), [0, 0.08, 0]);
  // The husk peeled back round the base.
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + 0.4;
    leaf(THREE, cob, "#9cbf5a", 0.13, [Math.cos(angle) * 0.03, -0.07, Math.sin(angle) * 0.03], [0, -angle, 1.2]);
  }
  cob.rotation.z = Math.PI / 2;
  cob.position.y = 0.03;
  group.add(cob);
};

const eggplant: Builder = (THREE, group) => {
  const body = new THREE.Group();
  const profile: [number, number][] = [[0, 0], [0.03, 0.01], [0.042, 0.04], [0.044, 0.07], [0.034, 0.11], [0.022, 0.14], [0.016, 0.155], [0, 0.16]];
  place(THREE, body, lathe(THREE, profile, 12), surface(THREE, "#4a2358", { roughness: 0.25 }), [0, 0, 0]);
  calyx(THREE, body, "#4f7a2a", 0.035, 0.15, 5, -0.4);
  stem(THREE, body, "#4f7a2a", 0.006, 0.03, [0, 0.155, 0]);
  body.rotation.z = Math.PI / 2 - 0.15;
  body.position.set(0.075, 0.04, 0);
  group.add(body);
};

const garlic: Builder = (THREE, group) => {
  const white = "#f3ecd8";
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    place(THREE, group, new THREE.SphereGeometry(0.018, 8, 6), surface(THREE, index % 3 ? white : "#e8d9e6", { roughness: 0.75 }), [Math.cos(angle) * 0.016, 0.026, Math.sin(angle) * 0.016], [0, -angle, 0], [0.8, 1.35, 1]);
  }
  const neck = new THREE.CylinderGeometry(0.003, 0.009, 0.022, 7);
  place(THREE, group, neck, surface(THREE, "#e6dcc2"), [0, 0.058, 0]);
  // The roots in a tuft underneath.
  place(THREE, group, new THREE.CylinderGeometry(0.01, 0.006, 0.006, 8), surface(THREE, "#c9b98f", { roughness: 1 }), [0, 0.004, 0]);
};

const radish: Builder = (THREE, group) => bulb(THREE, group, "#d8455a", 0.022, "#f2ebe0", "#6aa84f", "#8ab55a");
const beetroot: Builder = (THREE, group) => bulb(THREE, group, "#7a1f3d", 0.03, "#5a1530", "#4f8a3a", "#a8304f");

const cabbage: Builder = (THREE, group) => {
  globe(THREE, group, "#b8dc86", 0.058, [1, 0.92, 1], 0.058, { roughness: 0.6 });
  // Outer leaves cup the heart.
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const shell = new THREE.SphereGeometry(0.066, 12, 8, 0, Math.PI * 0.8, 0.35, Math.PI * 0.55);
    place(THREE, group, shell, surface(THREE, index % 2 ? "#8cc25e" : "#7fb552", { roughness: 0.6, doubleSided: true }), [0, 0.056, 0], [0, angle, 0]);
  }
};

const cauliflower: Builder = (THREE, group) => {
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    leaf(THREE, group, "#5f9a3c", 0.11, [Math.cos(angle) * 0.03, 0.03, Math.sin(angle) * 0.03], [0, -angle, -0.55]);
  }
  const florets: [number, number, number][] = [[0, 0.075, 0], [0.028, 0.064, 0], [-0.028, 0.064, 0], [0, 0.064, 0.028], [0, 0.064, -0.028], [0.02, 0.058, 0.02], [-0.02, 0.058, -0.02], [0.02, 0.058, -0.02], [-0.02, 0.058, 0.02]];
  for (const [x, y, z] of florets) place(THREE, group, new THREE.IcosahedronGeometry(0.023, 1), surface(THREE, "#f4ecd2", { roughness: 0.85 }), [x, y, z]);
};

const bean: Builder = (THREE, group) => {
  // Three pods, curved, each swelling over the beans inside and tapering to a tip.
  for (const [offset, turn, lift] of [[-0.026, 0.2, 0], [0.002, -0.1, 0.004], [0.028, 0.35, 0]] as const) {
    const pod = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.075, 0.014, 0), new THREE.Vector3(-0.025, 0.02, 0.008), new THREE.Vector3(0.03, 0.018, 0.004), new THREE.Vector3(0.075, 0.026, -0.01),
    ]);
    place(THREE, pod, new THREE.TubeGeometry(curve, 20, 0.009, 7, false), surface(THREE, "#5f9a3c", { roughness: 0.55 }), [0, 0, 0]);
    for (let bean = 0; bean < 5; bean += 1) {
      const at = curve.getPoint(0.12 + bean * 0.19);
      place(THREE, pod, new THREE.SphereGeometry(0.0115, 8, 6), surface(THREE, "#6aa84f", { roughness: 0.55 }), [at.x, at.y, at.z], [0, 0, 0], [1.3, 0.95, 1]);
    }
    place(THREE, pod, new THREE.ConeGeometry(0.004, 0.02, 5), surface(THREE, "#4f7a2a"), [0.083, 0.028, -0.012], [0, 0, -Math.PI / 2]);
    pod.position.set(0, lift, offset);
    pod.rotation.y = turn;
    group.add(pod);
  }
};

const blueberry: Builder = (THREE, group) => {
  const berries: [number, number, number][] = [[0, 0.011, 0], [0.02, 0.011, 0.004], [-0.018, 0.011, 0.008], [0.004, 0.011, -0.02], [0.006, 0.028, 0.004]];
  for (const [x, y, z] of berries) {
    place(THREE, group, new THREE.SphereGeometry(0.011, 10, 8), surface(THREE, "#3b4a8f", { roughness: 0.45 }), [x, y, z]);
    place(THREE, group, new THREE.CylinderGeometry(0.003, 0.004, 0.003, 5), surface(THREE, "#23284f"), [x, y + 0.011, z]);
  }
};

const strawberry: Builder = (THREE, group) => {
  const profile: [number, number][] = [[0, 0], [0.012, 0.008], [0.022, 0.022], [0.026, 0.036], [0.022, 0.046], [0, 0.05]];
  place(THREE, group, lathe(THREE, profile, 10), surface(THREE, "#d02e3a", { roughness: 0.4 }), [0, 0, 0]);
  for (let index = 0; index < 12; index += 1) {
    const angle = index * 2.4;
    const height = 0.01 + (index % 4) * 0.009;
    const radius = 0.012 + (height / 0.05) * 0.012;
    place(THREE, group, new THREE.SphereGeometry(0.0022, 4, 3), surface(THREE, "#f2d35a"), [Math.cos(angle) * radius, height, Math.sin(angle) * radius]);
  }
  calyx(THREE, group, "#3f8a3a", 0.022, 0.049, 6, 0.1);
};

const sunflower: Builder = (THREE, group) => {
  const head = new THREE.Group();
  place(THREE, head, new THREE.CylinderGeometry(0.045, 0.05, 0.014, 18), surface(THREE, "#4a2f18", { roughness: 0.95 }), [0, 0, 0]);
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    leaf(THREE, head, index % 2 ? "#f6c22a" : "#ffd33d", 0.06, [Math.cos(angle) * 0.07, -0.002, Math.sin(angle) * 0.07], [0, -angle, 0]);
  }
  stem(THREE, head, STALK, 0.006, 0.07, [0, -0.007, 0], Math.PI);
  head.rotation.x = -1.1;
  head.position.y = 0.065;
  group.add(head);
};

// ---------------------------------------------------------------- fruit

function fruitStem(THREE: ThreeNamespace, group: any, top: number, withLeaf = true): void {
  stem(THREE, group, WOOD_STEM, 0.0035, 0.022, [0, top - 0.004, 0], 0.25);
  if (withLeaf) leaf(THREE, group, LEAF, 0.045, [0.02, top + 0.012, 0], [0.2, 0.4, 0.3]);
}

function fruitColor(id: string, fallback: string): string {
  return FRUIT_TREES.find((species) => species.fruitId === id)?.fruitColor ?? fallback;
}

const apple: Builder = (THREE, group) => {
  // An apple is a sphere pinched in at both poles.
  const profile: [number, number][] = [[0, 0.008], [0.02, 0.002], [0.036, 0.016], [0.042, 0.036], [0.038, 0.056], [0.024, 0.068], [0.006, 0.064], [0, 0.058]];
  place(THREE, group, lathe(THREE, profile, 14), surface(THREE, fruitColor("apple", "#d43a3a"), { roughness: 0.3 }), [0, 0, 0]);
  fruitStem(THREE, group, 0.064);
};

const pear: Builder = (THREE, group) => {
  const profile: [number, number][] = [[0, 0.004], [0.026, 0.008], [0.038, 0.028], [0.034, 0.05], [0.022, 0.07], [0.016, 0.09], [0.008, 0.102], [0, 0.104]];
  place(THREE, group, lathe(THREE, profile, 14), surface(THREE, fruitColor("pear", "#c9c23a"), { roughness: 0.45 }), [0, 0, 0]);
  fruitStem(THREE, group, 0.104);
};

const cherry: Builder = (THREE, group) => {
  const red = fruitColor("cherry", "#9a1028");
  for (const x of [-0.016, 0.016]) {
    place(THREE, group, new THREE.SphereGeometry(0.016, 12, 10), surface(THREE, red, { roughness: 0.2 }), [x, 0.016, 0], [0, 0, 0], [1, 0.92, 1]);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0.03, 0), new THREE.Vector3(x * 0.5, 0.06, 0), new THREE.Vector3(0, 0.075, 0));
    place(THREE, group, new THREE.TubeGeometry(curve, 8, 0.0018, 4, false), surface(THREE, "#5f7a2a"), [0, 0, 0]);
  }
  leaf(THREE, group, LEAF, 0.05, [0.018, 0.078, 0], [0, 0.3, 0.4]);
};

const peach: Builder = (THREE, group) => {
  globe(THREE, group, fruitColor("peach", "#f59a5b"), 0.04, [1, 0.95, 1], 0.038, { roughness: 0.8 });
  // The blush on one cheek and the crease down the side.
  place(THREE, group, new THREE.SphereGeometry(0.041, 12, 9, -0.6, 1.4, 0.4, 1.6), surface(THREE, "#e0603a", { roughness: 0.8 }), [0, 0.038, 0], [0, 0, 0], [1, 0.95, 1]);
  place(THREE, group, new THREE.TorusGeometry(0.038, 0.0025, 4, 16, Math.PI), surface(THREE, "#d8743f"), [0, 0.038, 0], [0, Math.PI / 2, 0]);
  fruitStem(THREE, group, 0.076);
};

const orange: Builder = (THREE, group) => {
  globe(THREE, group, fruitColor("orange", "#f08a1c"), 0.042, [1, 0.94, 1], 0.04, { roughness: 0.75, segments: [14, 10] });
  place(THREE, group, new THREE.CylinderGeometry(0.004, 0.005, 0.004, 6), surface(THREE, "#4f6b2a"), [0, 0.079, 0]);
  leaf(THREE, group, "#2f7a36", 0.05, [0.02, 0.082, 0.004], [0.1, 0.4, 0.25]);
};

// ---------------------------------------------------------------- livestock goods

/** A glass milk bottle, full, with a foil cap: the cap's colour says whose milk it is. */
function milkBottle(cap: string, label: string): Builder {
  return (THREE, group) => {
    const profile: [number, number][] = [[0, 0], [0.034, 0], [0.036, 0.008], [0.036, 0.1], [0.03, 0.125], [0.02, 0.15], [0.019, 0.17], [0.021, 0.175]];
    const texture = paintedTexture(THREE, 256, 128, (context, w, h) => {
      context.fillStyle = "#f7f4ea";
      context.fillRect(0, 0, w, h);
      context.fillStyle = cap;
      context.fillRect(0, h * 0.38, w, h * 0.26);
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "800 22px Georgia, serif";
      context.fillText(label, w * 0.12, h / 2, w * 0.22);
    });
    place(THREE, group, lathe(THREE, profile, 18), paintedSurface(THREE, "#f7f4ea", texture, { roughness: 0.25 }), [0, 0, 0]);
    place(THREE, group, new THREE.CylinderGeometry(0.023, 0.023, 0.01, 16), surface(THREE, cap, { roughness: 0.3, metalness: 0.6, flat: false }), [0, 0.178, 0]);
  };
}

/** A shorn fleece rolled up and tied: lumpy wool in the fleece's own colour. */
function fleece(color: string): Builder {
  return (THREE, group) => {
    const lumps: readonly (readonly [number, number, number, number])[] = [[0, 0.05, 0, 0.06], [0.05, 0.045, 0.02, 0.048], [-0.05, 0.045, -0.015, 0.05], [0.015, 0.085, -0.02, 0.045], [-0.02, 0.08, 0.025, 0.042], [0.04, 0.035, -0.035, 0.038]];
    for (const [x, y, z, radius] of lumps) place(THREE, group, new THREE.IcosahedronGeometry(radius, 1), surface(THREE, tint(color, (x + z) * 2), { roughness: 1 }), [x, y, z]);
    place(THREE, group, new THREE.TorusGeometry(0.066, 0.005, 6, 18), surface(THREE, "#8a5a2b", { roughness: 0.9 }), [0, 0.055, 0], [Math.PI / 2, 0, 0]);
  };
}

/** A hen's eggs: three brown eggs sitting in a moulded pulp tray. */
const egg: Builder = (THREE, group) => {
  const pulp = surface(THREE, "#c9b28c", { roughness: 1 });
  place(THREE, group, new THREE.BoxGeometry(0.13, 0.018, 0.058), pulp, [0, 0.009, 0]);
  for (const [x, tilt] of [[-0.04, 0.12], [0, -0.08], [0.04, 0.05]] as const) {
    const shell = surface(THREE, tint("#d9a877", x * 3), { roughness: 0.55, flat: false });
    place(THREE, group, new THREE.SphereGeometry(0.019, 16, 12), shell, [x, 0.038, 0], [tilt, 0, tilt], [1, 1.32, 1]);
  }
};

// ---------------------------------------------------------------- the Butcher's meat

type CutSpec = Readonly<{ flesh: string; fat: string; width: number; depth: number; thickness: number; bone: "none" | "t" | "rib" }>;

/**
 * A raw cut on a square of butcher's paper: a marbled slab with a rind of fat
 * round one side and, for a chop or a T-bone, the bone. The flesh colour says
 * whose meat it is.
 */
function meatCut(spec: CutSpec): Builder {
  return (THREE, group) => {
    const paper = spec.width * 1.35;
    place(THREE, group, new THREE.BoxGeometry(paper, 0.003, paper), surface(THREE, "#eadfc8", { roughness: 0.95 }), [0, 0.0015, 0], [0, 0.35, 0]);
    // Marbling on the cut face only: wandering veins of fat and a few flecks, the same on every cut of a kind.
    const marbled = paintedTexture(THREE, 128, 128, (context, w, h) => {
      context.fillStyle = spec.flesh;
      context.fillRect(0, 0, w, h);
      let seed = 7;
      const next = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      context.strokeStyle = "rgba(250,236,226,.5)";
      context.lineCap = "round";
      for (let vein = 0; vein < 7; vein += 1) {
        context.lineWidth = 1 + next() * 2.5;
        context.beginPath();
        let x = next() * w;
        let y = next() * h;
        context.moveTo(x, y);
        for (let step = 0; step < 4; step += 1) {
          x += (next() - 0.5) * 50;
          y += (next() - 0.5) * 50;
          context.lineTo(x, y);
        }
        context.stroke();
      }
      context.fillStyle = "rgba(250,236,226,.55)";
      for (let fleck = 0; fleck < 26; fleck += 1) {
        context.beginPath();
        context.ellipse(next() * w, next() * h, 1 + next() * 3, 1 + next() * 2, next() * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    });
    const y = 0.003 + spec.thickness / 2;
    const side = surface(THREE, tint(spec.flesh, -0.18), { roughness: 0.6, flat: false });
    place(THREE, group, new THREE.CylinderGeometry(0.5, 0.5, spec.thickness, 20), [side, paintedSurface(THREE, spec.flesh, marbled, { roughness: 0.55 }), side], [0, y, 0], [0, 0, 0], [spec.width, 1, spec.depth]);
    // The rind of fat along the far side.
    place(THREE, group, new THREE.CylinderGeometry(0.5, 0.5, spec.thickness * 0.96, 20, 1, false, Math.PI * 0.55, Math.PI * 0.9), surface(THREE, spec.fat, { roughness: 0.6 }), [0, y, 0], [0, 0, 0], [spec.width * 1.08, 1, spec.depth * 1.12]);
    if (spec.bone === "t") {
      const bone = surface(THREE, "#efe6d2", { roughness: 0.7 });
      place(THREE, group, new THREE.BoxGeometry(spec.width * 0.08, spec.thickness * 1.05, spec.depth * 0.9), bone, [spec.width * 0.08, y, 0]);
      place(THREE, group, new THREE.BoxGeometry(spec.width * 0.45, spec.thickness * 1.05, spec.depth * 0.08), bone, [-spec.width * 0.12, y, -spec.depth * 0.2]);
    } else if (spec.bone === "rib") {
      place(THREE, group, new THREE.CylinderGeometry(spec.thickness * 0.28, spec.thickness * 0.34, spec.width * 0.75, 8), surface(THREE, "#efe6d2", { roughness: 0.7 }), [spec.width * 0.62, y, 0], [0, 0, Math.PI / 2]);
    }
  };
}

/** A chicken leg: a plump drumstick of pale raw meat with its bone showing at the knuckle. */
const drumstick: Builder = (THREE, group) => {
  const skin = surface(THREE, "#f0c2a8", { roughness: 0.6, flat: false });
  place(THREE, group, new THREE.SphereGeometry(0.034, 18, 14), skin, [0.02, 0.028, 0], [0, 0, 0.1], [1.45, 0.82, 1]);
  const bone = surface(THREE, "#f1e8d6", { roughness: 0.7, flat: false });
  place(THREE, group, new THREE.CylinderGeometry(0.007, 0.009, 0.06, 10), bone, [-0.046, 0.026, 0], [0, 0, Math.PI / 2 - 0.1]);
  place(THREE, group, new THREE.SphereGeometry(0.012, 12, 10), bone, [-0.078, 0.023, 0.005]);
  place(THREE, group, new THREE.SphereGeometry(0.011, 12, 10), bone, [-0.078, 0.023, -0.008]);
};

export const PRODUCE_BUILDERS: Readonly<Record<string, Builder>> = Object.freeze({
  bean, beetroot, blueberry, cabbage, carrot, cauliflower, corn, eggplant, garlic, potato, pumpkin, radish, strawberry, sunflower, tomato, watermelon,
  apple, pear, cherry, peach, orange,
  milk: milkBottle("#3a7fc2", "MILK"), "milk-sheep": milkBottle("#6aa84f", "EWE"),
  wool: fleece("#f2ede2"), "wool-llama": fleece("#b98a5e"),
  beef: meatCut({ flesh: "#a3262a", fat: "#f2e6d0", width: 0.16, depth: 0.12, thickness: 0.03, bone: "t" }),
  pork: meatCut({ flesh: "#e59a8e", fat: "#faf1e4", width: 0.13, depth: 0.1, thickness: 0.025, bone: "rib" }),
  mutton: meatCut({ flesh: "#9c3a36", fat: "#f4ead6", width: 0.1, depth: 0.08, thickness: 0.028, bone: "rib" }),
  "llama-meat": meatCut({ flesh: "#7e2626", fat: "#efe2cc", width: 0.14, depth: 0.1, thickness: 0.03, bone: "none" }),
  egg,
  "chicken-meat": drumstick,
});

/** A harvest-basket item as a model, or null for an id the basket does not hold. */
export function createProduceModel(THREE: ThreeNamespace, id: string): any | null {
  const build = PRODUCE_BUILDERS[id];
  if (!build) return null;
  const group = new THREE.Group();
  group.name = `produce-${id}`;
  build(THREE, group);
  return group;
}
