import { pickRivals, rivalAsPet } from "./sim/rivals.js";

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

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Translate farm-owned identity into a read-only match view model. */
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

/**
 * CPU rivals for a local field, drawn from the shared rival pool
 * (sim/rivals.js). The draw is seeded by the selected pet's identity, never
 * its stats, so progressing a farm pet can never make its rivals catch up.
 */
export function cpuFieldFor(selected, count, { level = "pro", seed = null, exclude = [] } = {}) {
  const total = Math.min(7, Math.max(1, Math.floor(Number(count) || 1)));
  const draw = seed ?? `${selected?.instanceId}:${selected?.speciesId}`;
  return pickRivals({ seed: draw, count: total, level, exclude }).map(rivalAsPet);
}

export function speciesStyle(speciesId) {
  return SPECIES[speciesId] ?? SPECIES["pet.corgi"];
}
