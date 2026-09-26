// Crop recipes. Each crop draws four models into a MeshBuilder: three growth
// stages and the ripe plant (the farm's models[3], also the seed-card
// portrait). Units are roughly metres at the scale of the Grimnir pack; the
// farm refits every stage into its soil cell anyway, so proportions matter
// more than absolute size.

import {
  add, aim, arc, chain, disc, gem, heading, lathe, leaf, normalize, paint, palmLeaf, rotX, rotY, rotZ, scale, scaleM, translate, tube,
} from "./mesh-kit.mjs";

// ------------------------------------------------------------------ palette paints

const P = {
  leaf: paint(3, 4, 0.0, 0.92),
  leafLight: paint(3, 4, 0.0, 0.55),
  leafDark: paint(3, 4, 0.4, 1),
  sage: paint(5, 4, 0.05, 0.95),
  stem: paint(3, 4, 0.15, 0.7),
  melonDark: paint(3, 4, 0.68, 1),
  melonLight: paint(5, 4, 0.2, 0.8),
  tomato: paint(7, 4, 0, 1),
  berry: paint(1, 2, 0, 1),
  orange: paint(9, 4, 0, 1),
  ripening: paint(9, 4, 0.35, 1),
  yellow: paint(11, 2, 0, 1),
  amber: paint(13, 2, 0, 1),
  cream: paint(11, 0, 0, 0.55),
  white: paint(11, 0, 0, 0.3),
  bark: paint(1, 0, 0.15, 1),
  wood: paint(9, 0, 0, 1),
  seedBrown: paint(1, 0, 0.5, 1),
  rust: paint(5, 0, 0, 1),
  plum: paint(5, 3, 0.45, 1),
  lavender: paint(3, 1, 0, 0.55),
  blue: paint(9, 2, 0.25, 1),
  dusk: paint(7, 2, 0, 0.8),
  blush: paint(9, 3, 0, 0.7),
};

// ------------------------------------------------------------------ helpers

const at = (b, matrix, part, material, options) => b.with(matrix, () => b.addPart(part, material, options));
const TAU = Math.PI * 2;

function stemAlong(b, points, r0, r1, material, sides = 5) {
  b.addPart(tube(points, { radius: (s) => r0 + (r1 - r0) * s, sides, capEnd: true }), material);
  return points[points.length - 1];
}

/** Seed leaves on a short stem; returns the stem top. */
function seedling(b, r, { size = 0.045, height = 0.026, leafMat = P.leaf, trueLeaves = 0, trueLeafOpts = {}, round = false } = {}) {
  const points = arc([0, 0, 0], [0, 1, 0], height, { bend: [r.jitter(0.008), 0, r.jitter(0.008)], steps: 3 });
  const top = stemAlong(b, points, 0.0028, 0.002, P.stem);
  const yaw = r() * Math.PI;
  const profile = round ? (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s)), 0.5) : (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s)), 0.7);
  for (const side of [0, Math.PI]) {
    at(b, aim(top, heading(yaw + side + r.jitter(0.15), 0)), leaf({ length: size, width: size * (round ? 0.42 : 0.34), lift: 0.35, droop: 0.55, fold: 0.35, steps: 4, profile }), leafMat);
  }
  for (let i = 0; i < trueLeaves; i++) {
    const y = yaw + Math.PI / 2 + i * Math.PI;
    at(b, aim(add(top, [0, 0.004, 0]), heading(y, 0)), leaf({ length: size * 0.75, width: size * 0.22, lift: 1.0, droop: 0.7, steps: 4, serrate: 0.15, ...trueLeafOpts }), P.leafDark);
  }
  return top;
}

/** A trailing vine hugging the ground; returns its points. */
function vine(r, yaw, len, steps = 9) {
  const points = [];
  let p = [0, 0.012, 0];
  const phase = r() * TAU;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    points.push([...p]);
    const angle = yaw + 0.45 * Math.sin(s * 4.5 + phase);
    p = add(p, [Math.sin(angle) * (len / steps), 0, Math.cos(angle) * (len / steps)]);
    p[1] = 0.012 + 0.005 * Math.sin(s * 9 + phase);
  }
  return points;
}

function tendril(b, origin, yaw, size = 0.012) {
  const points = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14;
    const angle = s * TAU * 2.2;
    const radius = size * (1 - 0.55 * s);
    points.push(add(origin, [Math.sin(yaw) * s * size * 2.2 + Math.cos(angle) * radius * Math.cos(yaw), 0.004 + s * size * 1.6 + Math.sin(angle) * radius, Math.cos(yaw) * s * size * 2.2 - Math.cos(angle) * radius * Math.sin(yaw)]));
  }
  b.addPart(tube(points, { radius: () => 0.0012, sides: 3, capEnd: false }), P.stem);
}

/** A palmate leaf on an upright petiole at `origin`, blade facing outward along `yaw`. */
function palmOnPetiole(b, r, origin, yaw, { height = 0.035, radius = 0.05, tilt = 0.35, ...leafOptions } = {}) {
  const lean = heading(yaw, 1.15);
  const top = stemAlong(b, arc(origin, lean, height, { bend: [0, 0.004, 0], steps: 3 }), 0.0026, 0.002, P.stem, 4);
  at(b, chain(aim(top, heading(yaw + r.jitter(0.25), 0)), rotX(-tilt + r.jitter(0.12)), rotZ(r.jitter(0.2))), palmLeaf({ radius, ...leafOptions }), P.leaf, { shade: "height", mix: 0.4 });
}

/** Five-ish petals round a centre, in the local frame (flower faces +Y). */
function flower(b, matrix, { petals = 5, petalLength = 0.018, petalWidth = 0.01, petalMat = P.yellow, centreMat = P.amber, centre = 0.005, cup = 0.35, droop = 0.25, round = true } = {}) {
  b.with(matrix, () => {
    for (let i = 0; i < petals; i++) {
      const yaw = (i / petals) * TAU;
      at(b, aim([0, 0, 0], heading(yaw, 0)), leaf({
        length: petalLength, width: petalWidth, lift: cup, droop, fold: 0.15, steps: 3,
        profile: round ? (s) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.8)), 0.5) : undefined,
        shadeBase: 0.5, shadeTip: 0.05,
      }), petalMat);
    }
    at(b, translate(0, 0.002, 0), disc({ radius: centre, segments: 6, dome: 0.6 }), centreMat);
  });
}

function starCalyx(b, matrix, radius = 0.012, points = 5, material = P.leaf) {
  at(b, matrix, disc({ radius, points, pointDepth: 0.55, dome: -0.25 }), material);
}

// ------------------------------------------------------------------ fruit bodies

function stripedMelon(b, matrix, { length: L = 0.26, radius: R = 0.1 } = {}) {
  const profile = [];
  const rings = 10;
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const y = -L / 2 + L * s;
    const r = i === 0 || i === rings ? 0 : R * Math.pow(Math.sin(Math.PI * s), 0.62);
    profile.push([r, y]);
  }
  b.with(matrix, () => {
    b.addPart(lathe(profile, {
      segments: 27,
      radial: (theta, y) => 1 + 0.015 * Math.sin(theta * 3 + y * 30),
      twist: 0.09,
      materialFor: (s) => (s % 3 === 0 ? P.melonLight : P.melonDark),
    }), P.melonDark, { shade: "height", mix: 0.2 });
    at(b, chain(translate(0, L / 2 - 0.002, 0), rotX(0.3)), tube(arc([0, 0, 0], [0, 1, 0.3], 0.018, { steps: 2 }), { radius: () => 0.003, sides: 4 }), P.stem);
  });
}

function ribbedPumpkin(b, matrix, { radius: R = 0.13, height: H = 0.17, ribs = 10 } = {}) {
  const profile = [[0, 0.004], [R * 0.55, 0], [R * 0.88, H * 0.18], [R, H * 0.45], [R * 0.93, H * 0.72], [R * 0.66, H * 0.93], [R * 0.3, H * 0.98], [0, H * 0.9]];
  b.with(matrix, () => {
    b.addPart(lathe(profile, {
      segments: ribs * 3,
      radial: (theta, y, ring) => (ring === 0 || ring === profile.length - 1 ? 1 : 0.9 + 0.1 * Math.pow(Math.abs(Math.cos((theta * ribs) / 2)), 0.6)),
    }), P.orange, { shade: "height", mix: 0.3 });
    const stem = arc([0, H * 0.88, 0], [0.25, 1, 0.1], H * 0.28, { bend: [0.03, -0.01, 0], steps: 4 });
    b.addPart(tube(stem, { radius: (s) => 0.014 * (1 - 0.45 * s), sides: 6, capEnd: false }), P.sage);
    at(b, translate(...stem[stem.length - 1]), disc({ radius: 0.0078, segments: 6, dome: 0.2 }), P.wood);
  });
}

function strawberryFruit(b, matrix, r, { size = 0.04, ripe = true } = {}) {
  const L = size, R = size * 0.52;
  const profile = [[0, -L], [R * 0.35, -L * 0.88], [R * 0.72, -L * 0.62], [R * 0.95, -L * 0.33], [R, -L * 0.12], [R * 0.72, 0], [0, 0.002]];
  const radiusAt = (y) => {
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
    }
    return 0;
  };
  b.with(matrix, () => {
    b.addPart(lathe(profile, { segments: 9, radial: (theta, y, ring) => 1 + (ring % 2 ? 0.04 : -0.02) * Math.cos(theta * 3) }), ripe ? P.berry : P.leafLight, { shade: "height", mix: 0.35 });
    if (ripe) {
      for (let i = 0; i < 14; i++) {
        const y = -L * (0.18 + 0.66 * ((i * 0.618) % 1));
        const theta = i * 2.4 + r.jitter(0.2);
        const rr = radiusAt(y) * 1.01;
        at(b, chain(translate(Math.cos(theta) * rr, y, Math.sin(theta) * rr), rotY(-theta), rotZ(Math.PI / 2)), gem(size * 0.045, 1.6), P.yellow);
      }
    }
    starCalyx(b, translate(0, 0.002, 0), size * 0.55, 6, P.leaf);
    at(b, translate(0, 0.002, 0), tube(arc([0, 0, 0], [0, 1, 0], size * 0.25, { steps: 1 }), { radius: () => 0.0018, sides: 3 }), P.stem);
  });
}

function roundFruit(b, matrix, { radius: R = 0.022, squash = 0.82, lobes = 5, material = P.tomato, calyx = true, segments = 10 } = {}) {
  const profile = [];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    profile.push([i === 0 || i === 6 ? 0 : Math.cos(a) * R, Math.sin(a) * R * squash]);
  }
  profile[6][1] -= R * 0.12; // shoulder dimple at the stem end
  b.with(matrix, () => {
    b.addPart(lathe(profile, { segments, radial: (theta, y) => 1 + (y > 0 ? 0.06 : 0.02) * Math.cos(theta * lobes) }), material, { shade: "height", mix: 0.3 });
    if (calyx) starCalyx(b, translate(0, R * squash * 0.86, 0), R * 0.7, 5, P.leaf);
  });
}

/** A hanging fruit: origin at the stem end, body down -Y. */
function eggplantFruit(b, matrix, { length: L = 0.12, radius: R = 0.026 } = {}) {
  const profile = [[0, -L], [R * 0.6, -L * 0.97], [R * 0.95, -L * 0.86], [R, -L * 0.68], [R * 0.86, -L * 0.42], [R * 0.62, -L * 0.18], [R * 0.45, -L * 0.04], [0, 0]];
  b.with(matrix, () => {
    b.addPart(lathe(profile, { segments: 10 }), P.plum, { shade: "height", mix: 0.2 });
    at(b, translate(0, -L * 0.035, 0), lathe([[R * 0.62, -L * 0.1], [R * 0.52, -L * 0.03], [R * 0.25, 0.004], [0, 0.006]], { segments: 5, radial: (theta, y, ring) => (ring === 0 ? 1 + 0.35 * Math.cos(theta * 5) : 1) }), P.leafDark);
    at(b, translate(0, 0.004, 0), tube(arc([0, 0, 0], [0, 1, 0], 0.014, { steps: 1 }), { radius: () => 0.003, sides: 4 }), P.stem);
  });
}

// ------------------------------------------------------------------ crops

function watermelon(b, r, stage) {
  if (stage === 0) {
    const top = seedling(b, r, { size: 0.05, round: true });
    palmOnPetiole(b, r, top, r() * TAU, { height: 0.006, radius: 0.018, lobeDepth: 0.5, sharp: 1 });
    return;
  }
  const vines = [3, 4, 5][stage - 1];
  const len = [0.12, 0.2, 0.19][stage - 1];
  const crown = r() * TAU;
  for (let v = 0; v < vines; v++) {
    const yaw = crown + (v / vines) * TAU + r.jitter(0.3);
    const points = vine(r, yaw, len * r.range(0.8, 1.1));
    stemAlong(b, points, 0.0045, 0.003, P.stem, 4);
    const leaves = Math.round(2 + stage * 0.7);
    for (let i = 0; i < leaves; i++) {
      const index = Math.min(points.length - 1, Math.round(((i + 0.6) / leaves) * (points.length - 1)));
      const side = i % 2 ? 1 : -1;
      palmOnPetiole(b, r, points[index], yaw + side * 0.9 + r.jitter(0.3), { height: 0.03 + r() * 0.015, radius: r.range(0.04, 0.052) * (stage === 1 ? 0.8 : 1), lobeDepth: 0.55, lobes: 5, sharp: 0.9, cup: 0.3 });
    }
    if (stage > 1) tendril(b, points[points.length - 1], yaw);
  }
  palmOnPetiole(b, r, [0, 0.01, 0], crown + 0.5, { height: 0.05, radius: 0.045, lobeDepth: 0.55, sharp: 0.9 });
  if (stage === 2) {
    for (let i = 0; i < 3; i++) {
      const yaw = crown + i * 2.1 + 0.6;
      const base = [Math.sin(yaw) * 0.09, 0.014, Math.cos(yaw) * 0.09];
      const top = stemAlong(b, arc(base, [0, 1, 0], 0.035, { bend: [0.006, 0, 0], steps: 2 }), 0.0018, 0.0015, P.stem, 3);
      flower(b, chain(translate(...top), rotX(-0.3)), { petalLength: 0.016, petalWidth: 0.009 });
    }
    stripedMelon(b, chain(translate(Math.sin(crown + 3.8) * 0.12, 0.026, Math.cos(crown + 3.8) * 0.12), rotY(crown), rotZ(Math.PI / 2)), { length: 0.07, radius: 0.026 });
  }
  if (stage === 3) {
    stripedMelon(b, chain(translate(0.015, 0.1, 0.02), rotY(crown + 0.7), rotZ(Math.PI / 2 - 0.05)), { length: 0.3, radius: 0.108 });
  }
}

function pumpkin(b, r, stage) {
  if (stage === 0) {
    const top = seedling(b, r, { size: 0.055, round: true });
    palmOnPetiole(b, r, top, r() * TAU, { height: 0.006, radius: 0.02, lobeDepth: 0.18, sharp: 2 });
    return;
  }
  const vines = [2, 3, 3][stage - 1];
  const len = [0.1, 0.19, 0.2][stage - 1];
  const crown = r() * TAU;
  for (let v = 0; v < vines; v++) {
    const yaw = crown + (v / vines) * TAU + r.jitter(0.3);
    const points = vine(r, yaw, len * r.range(0.85, 1.1));
    stemAlong(b, points, 0.006, 0.004, P.stem, 5);
    const leaves = stage === 1 ? 2 : 3;
    for (let i = 0; i < leaves; i++) {
      const index = Math.min(points.length - 1, Math.round(((i + 0.7) / leaves) * (points.length - 1)));
      palmOnPetiole(b, r, points[index], yaw + (i % 2 ? 1 : -1) * 0.8 + r.jitter(0.3), { height: 0.05 + r() * 0.03, radius: r.range(0.06, 0.075) * (stage === 1 ? 0.8 : 1), lobeDepth: 0.2, lobes: 5, sharp: 2, cup: 0.35, droop: 0.3 });
    }
    if (stage > 1) tendril(b, points[points.length - 1], yaw, 0.014);
  }
  palmOnPetiole(b, r, [0, 0.01, 0], crown + 0.4, { height: 0.08, radius: 0.07, lobeDepth: 0.2, sharp: 2, cup: 0.35 });
  if (stage === 2) {
    for (let i = 0; i < 2; i++) {
      const yaw = crown + i * 2.6 + 1.2;
      const base = [Math.sin(yaw) * 0.1, 0.014, Math.cos(yaw) * 0.1];
      const top = stemAlong(b, arc(base, [0, 1, 0], 0.03, { steps: 2 }), 0.0025, 0.002, P.stem, 4);
      b.with(chain(translate(...top), rotX(-0.35)), () => {
        b.addPart(lathe([[0, 0], [0.006, 0.006], [0.012, 0.024], [0.024, 0.036]], { segments: 10, radial: (theta, y, ring) => (ring === 3 ? 1 + 0.2 * Math.cos(theta * 5) : 1) }), P.amber);
      });
    }
    ribbedPumpkin(b, translate(Math.sin(crown + 3.6) * 0.12, 0.004, Math.cos(crown + 3.6) * 0.12), { radius: 0.035, height: 0.042, ribs: 8 });
    at(b, translate(Math.sin(crown + 3.6) * 0.12, 0, Math.cos(crown + 3.6) * 0.12), disc({ radius: 0.001 }), P.leaf);
  }
  if (stage === 3) {
    b.with(translate(0.015, 0, 0.02), () => ribbedPumpkin(b, rotY(crown), { radius: 0.15, height: 0.18, ribs: 10 }));
  }
}

function trifoliate(b, r, base, yaw, { height = 0.08, leaflet = 0.045, outward = 0.5 } = {}) {
  const direction = heading(yaw, 1.05);
  const tip = stemAlong(b, arc(base, direction, height, { bend: [Math.sin(yaw) * height * outward, -height * 0.25, Math.cos(yaw) * height * outward], steps: 4 }), 0.0022, 0.0017, P.stem, 4);
  for (const offset of [-0.85, 0, 0.85]) {
    at(b, aim(tip, heading(yaw + offset + r.jitter(0.1), 0)), leaf({ length: leaflet * (offset ? 0.9 : 1), width: leaflet * 0.36, lift: 0.3, droop: 0.55, fold: 0.45, steps: 4, serrate: 0.22, simple: true, profile: (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.05)), 0.55) }), P.leaf);
  }
}

function strawberry(b, r, stage) {
  if (stage === 0) {
    const top = seedling(b, r, { size: 0.032, round: true });
    trifoliate(b, r, top, r() * TAU, { height: 0.025, leaflet: 0.022 });
    return;
  }
  const leaves = [4, 6, 7][stage - 1];
  const crown = r() * TAU;
  for (let i = 0; i < leaves; i++) {
    const yaw = crown + (i / leaves) * TAU + r.jitter(0.25);
    trifoliate(b, r, [0, 0.005, 0], yaw, { height: (0.05 + r() * 0.03) * (stage === 1 ? 0.8 : 1), leaflet: (0.038 + r() * 0.012) * (stage === 1 ? 0.8 : 1), outward: 0.45 + r() * 0.3 });
  }
  if (stage >= 2) {
    const count = stage === 2 ? 4 : 5;
    for (let i = 0; i < count; i++) {
      const yaw = crown + (i / count) * TAU + TAU / (leaves * 2) + r.jitter(0.2);
      const reach = stage === 3 ? r.range(0.07, 0.1) : r.range(0.05, 0.07);
      const flowerHere = stage === 2 && i % 2 === 0;
      const drop = flowerHere ? -0.012 : -0.045;
      const top = stemAlong(b, arc([0, 0.005, 0], heading(yaw, 0.9), 0.06, { bend: [Math.sin(yaw) * reach, drop, Math.cos(yaw) * reach], steps: 5 }), 0.0017, 0.0014, P.stem, 3);
      if (flowerHere) flower(b, chain(translate(...top), rotX(-0.5), rotY(yaw)), { petals: 5, petalLength: 0.014, petalWidth: 0.009, petalMat: P.white, centreMat: P.yellow, centre: 0.0045, cup: 0.2 });
      else strawberryFruit(b, chain(translate(...top), rotY(yaw), rotX(0.35)), r, { size: stage === 3 ? r.range(0.036, 0.046) : 0.022, ripe: stage === 3 });
    }
  }
}

function compoundLeaf(b, r, base, yaw, { length: L = 0.1, leaflet = 0.03, pitch = 0.5 } = {}) {
  const points = arc(base, heading(yaw, pitch), L, { bend: [0, -L * 0.45, 0], steps: 5 });
  stemAlong(b, points, 0.0022, 0.0014, P.stem, 3);
  const pairs = 3;
  for (let i = 0; i < pairs; i++) {
    const point = points[Math.round(((i + 1) / (pairs + 1)) * (points.length - 1))];
    for (const side of [-1, 1]) {
      at(b, aim(point, heading(yaw + side * 1.1, 0)), leaf({ length: leaflet * (0.8 + i * 0.1), width: leaflet * 0.38, lift: 0.2, droop: 0.7, fold: 0.3, steps: 4, serrate: 0.2, simple: true }), i % 2 ? P.leafDark : P.leaf);
    }
  }
  at(b, aim(points[points.length - 1], heading(yaw, -0.2)), leaf({ length: leaflet * 1.15, width: leaflet * 0.4, lift: 0.1, droop: 0.6, fold: 0.3, steps: 4, serrate: 0.2, simple: true }), P.leaf);
}

function stake(b, height, offset = [0.022, 0, -0.012]) {
  at(b, translate(...offset), lathe([[0, -0.01], [0.007, 0], [0.007, height], [0.004, height + 0.006], [0, height + 0.008]], { segments: 4, shade: (ring) => [0.9, 0.8, 0.2, 0.1, 0.1][ring] }), P.wood);
}

function tomato(b, r, stage) {
  if (stage === 0) {
    seedling(b, r, { size: 0.042, trueLeaves: 1 });
    return;
  }
  const height = [0.14, 0.3, 0.36][stage - 1];
  const points = arc([0, 0, 0], [0, 1, 0], height, { bend: [r.jitter(0.02), 0, r.jitter(0.02)], steps: 7 });
  stemAlong(b, points, 0.0058, 0.0035, P.stem, 5);
  if (stage >= 2) stake(b, height + 0.02);
  const nodes = [4, 7, 8][stage - 1];
  let yaw = r() * TAU;
  for (let i = 0; i < nodes; i++) {
    const point = points[Math.min(points.length - 1, 1 + Math.round((i / nodes) * (points.length - 2)))];
    yaw += 2.4 + r.jitter(0.3);
    compoundLeaf(b, r, point, yaw, { length: (stage === 1 ? 0.075 : 0.11) * (1 - i * 0.04), leaflet: stage === 1 ? 0.03 : 0.04, pitch: 0.5 + i * 0.05 });
  }
  at(b, aim(points[points.length - 1], heading(yaw + 1, 1.2)), leaf({ length: 0.03, width: 0.01, lift: 0.4, droop: 0.4, serrate: 0.2, steps: 4 }), P.leafLight);
  if (stage >= 2) {
    const trusses = stage === 2 ? 3 : 4;
    for (let t = 0; t < trusses; t++) {
      const point = points[2 + t];
      const tyaw = yaw + t * 1.9 + 1.2;
      const truss = arc(point, heading(tyaw, 0.2), 0.04, { bend: [0, -0.03, 0], steps: 3 });
      const end = stemAlong(b, truss, 0.0018, 0.0014, P.stem, 3);
      const fruit = stage === 2 ? 2 : 3;
      for (let k = 0; k < fruit; k++) {
        const around = tyaw + (k - (fruit - 1) / 2) * 1.2;
        const spot = add(end, [Math.sin(around) * 0.014, -0.016 - k * 0.006, Math.cos(around) * 0.014]);
        if (stage === 2 && k === 0) {
          flower(b, chain(translate(...add(end, [0, -0.004, 0])), rotX(Math.PI * 0.8)), { petals: 5, petalLength: 0.012, petalWidth: 0.004, round: false, petalMat: P.yellow, centreMat: P.amber, centre: 0.003, cup: -0.2, droop: 0.6 });
          continue;
        }
        const ripe = stage === 3;
        const material = ripe ? ((t + k) % 5 === 3 ? P.ripening : P.tomato) : P.leafLight;
        roundFruit(b, chain(translate(...spot), rotY(r() * TAU)), { radius: ripe ? r.range(0.019, 0.024) : 0.011, material });
      }
    }
  }
}

function cornBlade(b, r, base, yaw, { length: L = 0.26, width = 0.02, lift = 1.05, droop = 2.4 } = {}) {
  at(b, aim(base, heading(yaw, 0)), leaf({
    length: L, width, lift, droop, fold: 0.25, steps: 9, twist: r.jitter(0.5),
    profile: (s) => Math.min(1, s * 7) * Math.pow(1 - s, 0.55),
  }), P.leaf);
}

function tassel(b, r, top, size) {
  stemAlong(b, arc(top, [0, 1, 0], size, { steps: 3 }), 0.0025, 0.0012, P.amber, 3);
  for (let i = 0; i < 6; i++) {
    const yaw = (i / 6) * TAU + r.jitter(0.3);
    const origin = add(top, [0, size * (0.2 + 0.12 * (i % 3)), 0]);
    stemAlong(b, arc(origin, heading(yaw, 0.7), size * 0.9, { bend: [0, -size * 0.5, 0], steps: 4 }), 0.0016, 0.0008, P.amber, 3);
  }
}

function cornCob(b, r, matrix, { length: L = 0.13, ripe = true } = {}) {
  const R = L * 0.19;
  b.with(matrix, () => {
    // Husk wrapping the lower half; kernels showing above it.
    b.addPart(lathe([[0, 0], [R * 0.7, L * 0.04], [R * 1.12, L * 0.2], [R * 1.14, L * 0.45], [R * 0.95, L * 0.62]], { segments: 7, radial: (theta, y, ring) => 1 + (ring === 4 ? 0.12 * Math.cos(theta * 3) : 0) }), P.sage, { shade: "height", mix: 0.4 });
    if (ripe) {
      b.addPart(lathe([[R * 0.92, L * 0.4], [R, L * 0.55], [R * 0.95, L * 0.75], [R * 0.72, L * 0.9], [0, L * 0.98]], {
        segments: 10, radial: (theta, y, ring) => 1 + 0.07 * (ring % 2 ? Math.cos(theta * 10) : -Math.cos(theta * 10)),
      }), P.yellow, { shade: "height", mix: 0.5 });
      for (const yaw of [0.4, 2.5, 4.4]) {
        at(b, chain(rotY(yaw), translate(0, L * 0.5, R * 0.95), rotX(-0.25)), leaf({ length: L * 0.4, width: R * 0.9, lift: 1.3, droop: -0.9, fold: -0.2, steps: 4, profile: (s) => Math.pow(1 - s, 0.4) }), P.sage);
      }
    } else {
      b.addPart(lathe([[R * 0.95, L * 0.6], [R * 0.72, L * 0.85], [0, L * 1.02]], { segments: 7 }), P.sage);
    }
    for (let i = 0; i < 6; i++) {
      const yaw = (i / 6) * TAU;
      stemAlong(b, arc([0, L * (ripe ? 0.96 : 1), 0], heading(yaw, 0.9), L * 0.18, { bend: [0, -L * 0.14, 0], steps: 3 }), 0.0012, 0.0008, ripe ? P.rust : P.cream, 3);
    }
  });
}

function corn(b, r, stage) {
  if (stage === 0) {
    const yaw = r() * TAU;
    for (let i = 0; i < 2; i++) cornBlade(b, r, [0, 0, 0], yaw + i * Math.PI + r.jitter(0.2), { length: 0.06 + i * 0.015, width: 0.007, lift: 1.3, droop: 1.8 });
    return;
  }
  const height = [0.08, 0.4, 0.5][stage - 1];
  const points = arc([0, 0, 0], [0, 1, 0], height, { bend: [r.jitter(0.012), 0, r.jitter(0.012)], steps: 6 });
  stemAlong(b, points, 0.011, 0.006, P.stem, 6);
  const blades = [5, 9, 10][stage - 1];
  const yaw0 = r() * TAU;
  for (let i = 0; i < blades; i++) {
    const s = (i + 0.3) / blades;
    const index = Math.min(points.length - 1, Math.floor(s * (points.length - 1)));
    const base = add(points[index], [0, (s * (points.length - 1) - index) * (height / (points.length - 1)), 0]);
    const yaw = yaw0 + i * Math.PI + r.jitter(0.35);
    const scaleBy = stage === 1 ? 0.55 : 1 - s * 0.35;
    cornBlade(b, r, base, yaw, { length: 0.26 * scaleBy, width: 0.018 * Math.max(0.6, scaleBy), lift: 1.0 + s * 0.3, droop: 2.2 + s });
  }
  if (stage >= 2) tassel(b, r, points[points.length - 1], stage === 2 ? 0.05 : 0.08);
  if (stage >= 2) {
    const cobs = stage === 2 ? 1 : 2;
    for (let c = 0; c < cobs; c++) {
      const base = points[2 + c];
      const yaw = yaw0 + Math.PI / 2 + c * Math.PI;
      cornCob(b, r, chain(translate(...base), rotY(yaw), rotX(0.42), translate(0, 0, 0.008)), { length: stage === 2 ? 0.08 : 0.13, ripe: stage === 3 });
    }
  }
}

function eggplant(b, r, stage) {
  if (stage === 0) {
    seedling(b, r, { size: 0.042, trueLeaves: 1, trueLeafOpts: { serrate: 0.05, width: 0.013 } });
    return;
  }
  const height = [0.1, 0.2, 0.24][stage - 1];
  const points = arc([0, 0, 0], [0, 1, 0], height, { bend: [r.jitter(0.015), 0, r.jitter(0.015)], steps: 5 });
  stemAlong(b, points, 0.008, 0.005, P.stem, 5);
  const branches = stage === 1 ? 0 : 3;
  const tips = [points[points.length - 1]];
  const yaw0 = r() * TAU;
  for (let i = 0; i < branches; i++) {
    const yaw = yaw0 + (i / branches) * TAU;
    const base = points[2 + (i % 2)];
    const branch = arc(base, heading(yaw, 0.7), 0.1, { bend: [0, 0.01, 0], steps: 4 });
    tips.push(stemAlong(b, branch, 0.005, 0.003, P.stem, 4));
  }
  const leafSpots = [];
  for (const tip of tips) for (let k = 0; k < (stage === 1 ? 3 : 3); k++) leafSpots.push(tip);
  for (let i = 1; i < points.length - 1; i++) leafSpots.push(points[i]);
  leafSpots.forEach((spot, i) => {
    const yaw = yaw0 + i * 2.39;
    at(b, aim(spot, heading(yaw, 0)), leaf({ length: (stage === 1 ? 0.07 : 0.1) * r.range(0.85, 1.1), width: 0.03, lift: 0.5, droop: 1.0, fold: 0.3, steps: 6, serrate: 0.08, profile: (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.9 + 0.08)), 0.7) }), P.leafDark);
  });
  if (stage >= 2) {
    tips.slice(1).forEach((tip, i) => {
      const yaw = yaw0 + (i / branches) * TAU;
      const hang = stemAlong(b, arc(tip, heading(yaw, -0.2), 0.03, { bend: [0, -0.02, 0], steps: 3 }), 0.003, 0.0025, P.stem, 4);
      if (stage === 2) {
        if (i === 0) eggplantFruit(b, chain(translate(...hang), rotZ(0.25)), { length: 0.045, radius: 0.012 });
        else flower(b, chain(translate(...hang), rotX(Math.PI * 0.75)), { petals: 6, petalLength: 0.016, petalWidth: 0.009, petalMat: P.lavender, centreMat: P.yellow, cup: 0.1 });
      } else {
        eggplantFruit(b, chain(translate(...hang), rotY(-yaw), rotZ(0.15 + r.jitter(0.1))), { length: r.range(0.11, 0.13), radius: 0.026 });
      }
    });
  }
}

function sunflowerHead(b, r, matrix, { radius: R = 0.06, open = true } = {}) {
  b.with(matrix, () => {
    if (!open) {
      b.addPart(lathe([[0, -0.02], [0.02, -0.012], [0.028, 0.004], [0.02, 0.018], [0, 0.024]], { segments: 10 }), P.leafLight, { shade: "height" });
      for (let i = 0; i < 10; i++) {
        at(b, chain(rotY((i / 10) * TAU), translate(0, 0.0, 0.024), rotX(-1.1)), leaf({ length: 0.022, width: 0.006, lift: 0, droop: 0.2, steps: 3 }), P.leaf);
      }
      return;
    }
    // Back: green bract star + cushion.
    at(b, translate(0, -0.006, 0), lathe([[0, -0.02], [R * 0.45, -0.014], [R * 0.72, -0.004], [R * 0.72, 0]], { segments: 14 }), P.leafDark);
    at(b, chain(translate(0, -0.004, 0), rotX(Math.PI)), disc({ radius: R * 0.95, points: 14, pointDepth: 0.35, dome: 0.1 }), P.leaf);
    // Petals: two offset rings.
    for (const [count, length, lift, mat, y, offset] of [[16, R * 0.95, 0.06, P.yellow, 0.001, 0], [16, R * 0.8, 0.22, P.amber, 0.004, 0.5]]) {
      for (let i = 0; i < count; i++) {
        const yaw = ((i + offset) / count) * TAU + r.jitter(0.05);
        at(b, aim([Math.sin(yaw) * R * 0.55, y, Math.cos(yaw) * R * 0.55], heading(yaw, 0), r.jitter(0.25)), leaf({ length: length * r.range(0.9, 1.05), width: R * 0.16, lift, droop: 0.25, fold: 0.3, steps: 3, shadeBase: 0.55, shadeTip: 0.05 }), mat);
      }
    }
    // Seed disc: raised rim of rust, dark centre dome.
    at(b, translate(0, 0.004, 0), lathe([[R * 0.62, 0], [R * 0.6, 0.008], [R * 0.4, 0.012], [0, 0.016]], { segments: 16, shade: (ring) => [0.1, 0.2, 0.6, 0.9][ring] }), P.rust);
    at(b, translate(0, 0.012, 0), disc({ radius: R * 0.4, segments: 12, dome: 0.18 }), P.seedBrown);
  });
}

function sunflower(b, r, stage) {
  if (stage === 0) {
    seedling(b, r, { size: 0.05, round: true, height: 0.045, trueLeaves: 2, trueLeafOpts: { serrate: 0.1, width: 0.016, length: 0.035 } });
    return;
  }
  const height = [0.16, 0.42, 0.56][stage - 1];
  const nod = stage === 3 ? 0.06 : stage === 2 ? 0.03 : 0;
  const points = arc([0, 0, 0], [0, 1, 0], height, { bend: [0, 0, nod], steps: 8 });
  stemAlong(b, points, 0.011, 0.0065, P.stem, 6);
  const leaves = [4, 8, 9][stage - 1];
  const yaw0 = r() * TAU;
  for (let i = 0; i < leaves; i++) {
    const s = (i + 0.5) / leaves;
    const point = points[Math.min(points.length - 2, Math.max(1, Math.round(s * (points.length - 1) * 0.92)))];
    const yaw = yaw0 + i * 2.39;
    const size = (stage === 1 ? 0.07 : 0.1) * (1.15 - s * 0.5);
    const petiole = stemAlong(b, arc(point, heading(yaw, 0.6), size * 0.35, { bend: [0, -size * 0.1, 0], steps: 2 }), 0.0028, 0.0022, P.stem, 3);
    at(b, aim(petiole, heading(yaw, 0)), leaf({ length: size, width: size * 0.42, lift: 0.3, droop: 1.1, fold: 0.3, steps: 6, serrate: 0.1, profile: (s2) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(s2, 0.75))), 0.65) }), P.leaf);
  }
  if (stage >= 2) {
    const top = points[points.length - 1];
    const face = normalize([0, 0.55, 1]);
    const tilt = Math.acos(face[1]);
    sunflowerHead(b, r, chain(translate(...add(top, [0, 0.006, 0])), rotX(tilt)), { radius: 0.07, open: stage === 3 });
  }
}

function blueberryBush(b, r, stems, len) {
  const tips = [];
  const yaw0 = r() * TAU;
  for (let i = 0; i < stems; i++) {
    const yaw = yaw0 + (i / stems) * TAU + r.jitter(0.25);
    const size = len * r.range(0.8, 1.1);
    const main = arc([r.jitter(0.006), 0, r.jitter(0.006)], heading(yaw, 1.05 + r.jitter(0.12)), size, { bend: [Math.sin(yaw) * size * 0.35, -size * 0.08, Math.cos(yaw) * size * 0.35], steps: 6 });
    stemAlong(b, main, 0.0042, 0.002, P.bark, 4);
    tips.push({ yaw, path: main });
    const twigYaw = yaw + (i % 2 ? 0.8 : -0.8);
    const twig = arc(main[3], heading(twigYaw, 0.75), size * 0.45, { bend: [0, size * 0.04, 0], steps: 3 });
    stemAlong(b, twig, 0.0022, 0.0014, P.bark, 3);
    tips.push({ yaw: twigYaw, path: twig });
  }
  return tips;
}

function blueberryLeaf(b, r, point, yaw, material, size = 1) {
  at(b, aim(point, heading(yaw, 0)), leaf({ length: r.range(0.026, 0.034) * size, width: 0.012 * size, lift: 0.55, droop: 0.5, fold: 0.4, steps: 3, simple: true }), material);
}

function blueberry(b, r, stage) {
  if (stage === 0) {
    const points = arc([0, 0, 0], [0, 1, 0], 0.04, { bend: [0.005, 0, 0], steps: 3 });
    stemAlong(b, points, 0.0026, 0.0018, P.bark, 4);
    [1, 2, 3, 3].forEach((index, i) => blueberryLeaf(b, r, points[index], i * 2.3, P.leaf, 0.85));
    return;
  }
  const tips = blueberryBush(b, r, [3, 6, 7][stage - 1], [0.09, 0.14, 0.16][stage - 1]);
  let n = 0;
  for (const tip of tips) {
    const path = tip.path;
    for (let k = 1; k < path.length; k++) {
      n++;
      const blush = stage === 3 && n % 13 === 0;
      blueberryLeaf(b, r, path[k], tip.yaw + (k % 2 ? 1.4 : -1.4) + r.jitter(0.4), blush ? P.blush : n % 3 ? P.leaf : P.leafDark);
    }
    const end = path[path.length - 1];
    for (const spread of [-0.7, 0.7]) blueberryLeaf(b, r, end, tip.yaw + spread + r.jitter(0.2), n++ % 2 ? P.leafLight : P.leaf, 0.9);
  }
  if (stage >= 2) {
    tips.forEach((tip, i) => {
      if (i % 2 && stage === 2) return;
      const hang = add(tip.path[Math.max(1, tip.path.length - 2)], [0, -0.004, 0]);
      const count = stage === 2 ? 3 : 4;
      for (let k = 0; k < count; k++) {
        const around = (k / count) * TAU + i;
        const spot = add(hang, [Math.sin(around) * 0.0085, -0.007 - (k % 2) * 0.005, Math.cos(around) * 0.0085]);
        if (stage === 2) {
          at(b, chain(translate(...spot), rotX(Math.PI)), lathe([[0, -0.001], [0.004, 0.001], [0.0055, 0.006], [0.0045, 0.01]], { segments: 5, radial: (theta, y, ring) => (ring === 3 ? 1 + 0.3 * Math.cos(theta * 5) : 1) }), P.white);
        } else {
          const unripe = (i + k) % 7 === 3;
          at(b, translate(...spot), lathe([[0, -0.0075], [0.0065, -0.005], [0.0078, 0], [0.0058, 0.0048], [0, 0.0058]], { segments: 6 }), unripe ? P.blush : P.blue, { shade: "height", mix: 0.4 });
        }
      }
    });
  }
}

// ------------------------------------------------------------------ catalog of generated crops

/**
 * Seed price, grow days and yield are proposals in the same bands as the
 * shipped eight (6-14 tickets, 2-4 days, 2-5 produce); they only matter once
 * a crop is promoted into js/farm-crops.mts.
 */
export const GENERATED_CROPS = [
  { id: "strawberry", title: "Strawberry", draw: strawberry, proposal: { seedPrice: 9, days: 2.5, yield: 5 } },
  { id: "tomato", title: "Tomato", draw: tomato, proposal: { seedPrice: 10, days: 3, yield: 4 } },
  { id: "corn", title: "Corn", draw: corn, proposal: { seedPrice: 11, days: 3.5, yield: 2 } },
  { id: "eggplant", title: "Eggplant", draw: eggplant, proposal: { seedPrice: 12, days: 3.5, yield: 3 } },
  { id: "blueberry", title: "Blueberry", draw: blueberry, proposal: { seedPrice: 13, days: 4, yield: 6 } },
  { id: "sunflower", title: "Sunflower", draw: sunflower, proposal: { seedPrice: 12, days: 4, yield: 1 } },
  { id: "pumpkin", title: "Pumpkin", draw: pumpkin, proposal: { seedPrice: 16, days: 4, yield: 1 } },
  { id: "watermelon", title: "Watermelon", draw: watermelon, proposal: { seedPrice: 18, days: 4, yield: 1 } },
];

export const stageFile = (title, stage) => `Crop_${title.replace(/\s+/g, "")}_${stage < 3 ? `STAGE_${stage + 1}` : "RIPE"}_01.glb`;
