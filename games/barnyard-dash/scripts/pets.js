const SPECIES = Object.freeze({
  "pet.corgi": Object.freeze({ title: "Corgi", color: "#d99542" }),
  "pet.duck": Object.freeze({ title: "Duck", color: "#f5d547" }),
  "pet.red-panda": Object.freeze({ title: "Red Panda", color: "#d05d35" }),
  "pet.platypus": Object.freeze({ title: "Platypus", color: "#8b6854" }),
  "pet.hippo": Object.freeze({ title: "Hippo", color: "#8d829e" }),
  "pet.rhino": Object.freeze({ title: "Rhino", color: "#858d91" }),
  "pet.bat": Object.freeze({ title: "Bat", color: "#554e73" }),
  "pet.shark": Object.freeze({ title: "Shark", color: "#4887a8" }),
  "pet.anglerfish": Object.freeze({ title: "Anglerfish", color: "#3d617d" }),
  "pet.jellyfish": Object.freeze({ title: "Jellyfish", color: "#c47ccf" }),
});

export const BORROWED_PET = Object.freeze({
  instanceId: "borrowed-corgi",
  speciesId: "pet.corgi",
  name: "Borrowed Biscuit",
  paletteId: "standard",
  stats: Object.freeze({ speed: 50, strength: 50, size: 1 }),
});

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** The cabinet reads farm identity; it never writes or owns it. */
export function playablePets(layout) {
  const rows = Array.isArray(layout?.pets) ? layout.pets : [];
  const pets = rows.flatMap((pet) => {
    if (!pet?.profile || !SPECIES[pet.speciesId] || typeof pet.instanceId !== "string") return [];
    return [{
      instanceId: pet.instanceId,
      speciesId: pet.speciesId,
      name: String(pet.name || SPECIES[pet.speciesId].title).slice(0, 20),
      paletteId: typeof pet.profile.paletteId === "string" ? pet.profile.paletteId : "standard",
      stats: {
        speed: finite(pet.profile.stats?.speed, 50),
        strength: finite(pet.profile.stats?.strength, 50),
        size: finite(pet.profile.size?.current, 1),
      },
    }];
  });
  return pets.length ? pets : [BORROWED_PET];
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}

const CPU_SPECIES = Object.freeze(Object.keys(SPECIES));
const CPU_NAMES = Object.freeze(["Pepper", "Maple", "Comet", "Tumble", "Mochi", "Dash", "Clover"]);

function cpuPetFor(selected, index) {
  const seed = hash(`${selected.instanceId}:${selected.speciesId}:${index}`);
  const speedOffset = (seed % 13) - 6;
  const strengthOffset = ((seed >>> 8) % 13) - 6;
  return {
    instanceId: `cpu-${selected.instanceId}-${index + 1}`,
    speciesId: CPU_SPECIES[(seed + index * 3) % CPU_SPECIES.length],
    name: CPU_NAMES[index % CPU_NAMES.length],
    paletteId: "standard",
    stats: {
      speed: Math.min(100, Math.max(0, selected.stats.speed + speedOffset)),
      strength: Math.min(100, Math.max(0, selected.stats.strength + strengthOffset)),
      size: Math.min(1.12, Math.max(0.62, selected.stats.size + (((seed >>> 16) % 7) - 3) / 100)),
    },
  };
}

/** Fill an offline race with stable opponents. One player plus at most seven CPUs. */
export function cpuFieldFor(selected, count) {
  const total = Math.min(7, Math.max(1, Math.floor(Number(count) || 1)));
  return Array.from({ length: total }, (_, index) => cpuPetFor(selected, index));
}

export function speciesStyle(speciesId) {
  return SPECIES[speciesId] ?? SPECIES["pet.corgi"];
}
