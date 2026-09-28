// The growing plots, on the page: what E does at a plot's cell and what the
// prompt says. The rules are pure (farm-crops.mts, farm-capacity.mts) and the
// drawing is farm-crops-view.mts; this file is the glue, lifted out of the
// page's composition root (farm.mts) beside its sibling for trees
// (farm-trees-controller.mts), so the page only asks: is a cell in reach, what
// does the prompt say, what does E do.
//
// E at a cell does the one thing its state calls for: plant the selected
// seed, water, tend, harvest, or clear a dead crop (which makes compost) —
// and on a crop with nothing else to do, work compost in so it harvests a
// grade higher (farm-quality.mts). The prompt says the grade it is on course for. An account farm's harvest
// is the server's (the page injects `submitHarvest`); a signed-out farm
// harvests here.

import { canFertilizeCrop, clearDeadFarmCrop, cropStatus, fertilizeFarmCrop, findCrop, findSoilCellInReach, harvestFarmCrop, plantFarmCrop, tendFarmCrop, waterFarmCrop, type CropPlayerPose, type SoilCellTarget } from "./farm-crops.mjs";
import { QUALITY_TITLES, gradedTitle, type Quality } from "./farm-quality.mjs";
import { cropCapacity, cropCapacityUse } from "./farm-capacity.mjs";
import { withFarmAgriculture, withFarmClock, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";

export type CropsControllerDeps = Readonly<{
  layout: () => FarmLayout;
  clockMinutes: () => number;
  selectedCropId: () => string;
  /** The Farming level on the server's record; a local farm stays at 1. */
  farmingLevel: () => number;
  /** Apply, save and say where the save went (the page's `persistLayout`). */
  persist: (next: FarmLayout) => Promise<string>;
  /** Account farms: send the farm and the cell to the server, adopt what comes back, and hand back the answer. Null: this farm harvests locally. */
  submitHarvest: ((plotId: string, cellId: SoilCellTarget["cellId"]) => Promise<any>) | null;
  setStatus: (text: string) => void;
  onAchievements: (achievements: readonly unknown[]) => void;
}>;

export type FarmCropsController = Readonly<{
  /** Find the cell in reach (or none). `allowed` is false whenever something nearer to hand owns E. */
  update: (pose: CropPlayerPose, allowed: boolean) => void;
  inReach: () => boolean;
  prompt: () => string;
  interact: () => boolean;
}>;

export function createFarmCropsController(deps: CropsControllerDeps): FarmCropsController {
  let target: SoilCellTarget<FarmDecorRow> | null = null;
  let harvestInFlight = false;

  const plantedAt = (layout: FarmLayout) => target
    ? layout.agriculture.crops.find((crop) => crop.plotId === target!.plot.instanceId && crop.cellId === target!.cellId) ?? null
    : null;

  function prompt(): string {
    if (!target) return "";
    const layout = deps.layout();
    const planted = plantedAt(layout);
    if (!planted) {
      const selected = findCrop(deps.selectedCropId())!;
      const seeds = layout.agriculture.inventory.seeds[selected.id] ?? 0;
      const fields = cropCapacityUse(layout.agriculture, layout.decor, deps.farmingLevel());
      if (fields.full) return `Your fields are full · ${fields.used}/${fields.capacity} growing · harvest or clear a crop to plant here`;
      if (seeds > 0) return `Press E to plant 1 ${selected.title} here · ${seeds} seeds · ${fields.used}/${fields.capacity} growing`;
      return `No ${selected.title} seeds · choose another in Inventory`;
    }
    const definition = findCrop(planted.cropId)!;
    const crop = cropStatus(planted, deps.clockMinutes());
    const wilting = crop.wilted ? "wilting " : "";
    if (crop.dead) return `The ${definition.title} died ${planted.diedOf === "thirst" ? "of thirst" : "untended"} · Press E to clear it onto the compost heap`;
    if (crop.mature) return `Press E to harvest ${definition.title} · ${crop.harvestYield} ${QUALITY_TITLES[crop.quality]} to collect`;
    if (crop.needsCare) return `Press E to tend the ${wilting}${definition.title}`;
    if (crop.thirsty) return `Press E to water the ${wilting}${definition.title}`;
    const course = `on course for ${QUALITY_TITLES[crop.quality]}${planted.fertilized ? " · composted" : ""}`;
    const compost = layout.agriculture.inventory.compost;
    if (canFertilizeCrop(layout.agriculture, planted, deps.clockMinutes())) return `${definition.title} growing · ${Math.round(crop.progress * 100)}% · ${course} · Press E to work in compost (${compost})`;
    return `${definition.title} growing · ${Math.round(crop.progress * 100)}% · soil is moist · ${course}`;
  }

  /** What a harvest's answer says about the skill: the XP, and a level (and any new field room) if one was reached. */
  function harvestSkillNote(result: any, next: FarmLayout): string {
    const xp = Number(result?.xp) || 0;
    if (!xp) return "";
    const level = Number(result?.farming?.level) || 1;
    const before = Number(result?.farming?.levelBefore) || level;
    if (level <= before) return ` +${xp} Farming XP.`;
    const room = cropCapacity(next.decor, level) - cropCapacity(next.decor, before);
    return ` +${xp} Farming XP — Farming level ${level}!${room > 0 ? ` Your fields can hold ${room} more crops.` : ""}`;
  }

  async function harvestOnServer(plotId: string, cellId: SoilCellTarget["cellId"], title: string): Promise<void> {
    if (harvestInFlight || !deps.submitHarvest) return;
    harvestInFlight = true;
    try {
      const result = await deps.submitHarvest(plotId, cellId);
      if (Array.isArray(result?.achievements) && result.achievements.length) deps.onAchievements(result.achievements);
      if (result?.ok) deps.setStatus(`Harvested ${result.quantity} ${gradedTitle(title, gradeOf(result.quality))}.${result?.layout ? harvestSkillNote(result, deps.layout()) : ""} Saved to your account.`);
      else if (result?.error === "not_ready") deps.setStatus(`The ${title} is not ripe yet by the farm's records — it needs a little longer.`);
      else deps.setStatus("That harvest did not go through. Try again in a moment.");
    } catch {
      deps.setStatus("That harvest did not go through. Try again in a moment.");
    } finally {
      harvestInFlight = false;
    }
  }

  const gradeOf = (value: unknown): Quality => value === "poor" || value === "fine" || value === "perfect" ? value : "normal";

  /** E at a growing plot performs the one action its current state calls for. */
  function interact(): boolean {
    if (!target) return false;
    const layout = deps.layout();
    const now = deps.clockMinutes();
    const plotId = target.plot.instanceId;
    const cellId = target.cellId;
    const planted = plantedAt(layout);
    let action;
    if (!planted) action = plantFarmCrop(layout.agriculture, plotId, cellId, deps.selectedCropId(), now, cropCapacityUse(layout.agriculture, layout.decor, deps.farmingLevel()).capacity);
    else {
      const state = cropStatus(planted, now);
      if (state.dead) action = clearDeadFarmCrop(layout.agriculture, plotId, cellId, now);
      else if (state.mature) {
        // An account farm's produce is minted only by the server: it decides ripeness and yield.
        if (deps.submitHarvest) {
          void harvestOnServer(plotId, cellId, findCrop(planted.cropId)!.title);
          return true;
        }
        action = harvestFarmCrop(layout.agriculture, plotId, cellId, now);
      }
      else if (state.needsCare) action = tendFarmCrop(layout.agriculture, plotId, cellId, now);
      else if (state.thirsty) action = waterFarmCrop(layout.agriculture, plotId, cellId, now);
      else if (canFertilizeCrop(layout.agriculture, planted, now)) action = fertilizeFarmCrop(layout.agriculture, plotId, cellId, now);
      else return true;
    }
    if (!action.ok) return true;
    void deps.persist(withFarmClock(withFarmAgriculture(layout, action.agriculture), now, Date.now()));
    return true;
  }

  return Object.freeze({
    update(pose, allowed) {
      target = allowed ? findSoilCellInReach(deps.layout().decor, pose) : null;
    },
    inReach: () => Boolean(target),
    prompt,
    interact,
  });
}
