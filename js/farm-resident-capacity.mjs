export const MAX_HORSES = 12;
export function companionCount(pets) {
    return pets.filter((pet) => pet.speciesId !== "pet.horse").length;
}
export function horseCount(pets) {
    return pets.length - companionCount(pets);
}
