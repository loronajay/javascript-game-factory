export const MAX_HORSES = 12;
export function companionCount(pets: readonly Readonly<{ speciesId: string }>[]): number {
  return pets.filter((pet) => pet.speciesId !== "pet.horse").length;
}
export function horseCount(pets: readonly Readonly<{ speciesId: string }>[]): number {
  return pets.length - companionCount(pets);
}
