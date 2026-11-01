import { findAnimal } from "./farm-catalog/animals.mjs";
import { findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { findPetTrait } from "./farm-pet-care.mjs";
import { canWorkDoor } from "./farm-interaction.mjs";
import { FARM_DAY_MINUTES } from "./farm-crops.mjs";
/** A stone is readable at ground level, within reach and in front of the player. */
export function findMemorialInReach(layout, pose) {
    if (Math.abs(pose.y) > 0.6)
        return null;
    return layout.decor.filter((row) => row.itemId === "decor.prop.pet-tombstone" && canWorkDoor(pose, row, 2.2))
        .sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z))[0] ?? null;
}
export function memorialDetails(entry) {
    const species = findAnimal(entry.speciesId) ?? findLivestockSpecies(entry.speciesId);
    const outcome = { old_age: "Passed away of old age", starvation: "Died of hunger", neglect: "Died of neglect", runaway: "Ran away" }[entry.outcome];
    const accomplishments = entry.accomplishments.map((id) => id.startsWith("dwelling:")
        ? `Had a home: ${findFarmDecor(id.slice(9))?.title ?? "a dwelling of their own"}` : id);
    return [
        `${entry.name} · ${species?.title ?? "Pet"} · ${entry.finalStats.gender}`,
        `Lived ${entry.lifespanDays.toFixed(1)} farm days · ${outcome}`,
        `Remembered on farm day ${Math.floor(entry.departedAtFarmMinute / FARM_DAY_MINUTES) + 1}`,
        `Traits: ${entry.traits.map((id) => findPetTrait(id)?.title ?? id).join(", ") || "No recorded traits"}`,
        `Final abilities: Speed ${entry.finalStats.speed.toFixed(1)} · Strength ${entry.finalStats.strength.toFixed(1)} · Size ${entry.finalStats.size.toFixed(2)}`,
        `Final wellbeing: Happiness ${Math.round(entry.finalStats.happiness)}% · Hunger ${Math.round(entry.finalStats.hunger)}%`,
        `Accomplishments: ${accomplishments.join("; ") || "No accomplishments were recorded for this pet."}`,
    ];
}
