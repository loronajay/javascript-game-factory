import { type FarmLayout } from "./farm-layout.mjs";
import { advancePetNeeds } from "./farm-pet-needs.mjs";
import { offlineSpan } from "./farm-offline.mjs";

/** Animal time is separate from crop growth and the day/night/nap clock. */
export function applyOfflineAnimals(layout: FarmLayout, since: number, now: number): FarmLayout {
  const minutes = offlineSpan(since, now, layout.settings.awayAnimals).farmMinutes;
  if (!(minutes > 0) || layout.clock.checkpointAt <= 0) return layout;
  const clock = layout.clock;
  const before = clock.farmMinutes + clock.animalMinutes;
  const progressed = advancePetNeeds({ ...layout, clock: { ...clock, farmMinutes: before } }, before + minutes);
  return { ...progressed, clock: { ...clock, animalMinutes: clock.animalMinutes + minutes } };
}
