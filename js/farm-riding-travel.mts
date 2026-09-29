// A horse between places (planning-docs/FARM_RIDING_PLAN.md). Riding out of
// the farm's gate takes the horse along: the next page's URL names it
// (`horse=<instanceId>`, beside the `farm=` every farm page already carries),
// and that page reads the horse back out of the SERVER's copy of the farm —
// never a stat or a coat from the URL, which only says which horse. A horse the
// farm does not have, or one that cannot be ridden, is no horse at all: the
// player arrives on foot.

import { isRidable } from "./farm-catalog/animals.mjs";
import type { FarmLayout, FarmPet } from "./farm-layout.mjs";

const HORSE_ID = /^[a-z0-9-]{1,40}$/;

/** The ridable pet the URL names, from the farm as the server answered, or null. */
export function ridingHorseFrom(layout: Pick<FarmLayout, "pets">, horseId: unknown): FarmPet | null {
  if (typeof horseId !== "string" || !HORSE_ID.test(horseId)) return null;
  const pet = layout.pets.find((row) => row.instanceId === horseId);
  return pet && isRidable(pet.speciesId) && pet.profile ? pet : null;
}

/** The query string for the next page: the farm to come home to (under `farmKey`) and the horse, when riding. */
export function horseTravelQuery(farmId: string, horseId: string, farmKey: "farm" | "id" = "farm"): string {
  const parts: string[] = [];
  if (farmId) parts.push(`${farmKey}=${encodeURIComponent(farmId)}`);
  if (horseId && HORSE_ID.test(horseId)) parts.push(`horse=${encodeURIComponent(horseId)}`);
  return parts.join("&");
}
