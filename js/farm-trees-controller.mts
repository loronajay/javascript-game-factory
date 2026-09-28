// The orchard and the forestry, on the page: what E does at a Tree Plot, what
// the prompt says, and the felling game. The rules are pure (farm-trees.mts,
// farm-chop.mts, farm-capacity.mts); the drawing is farm-trees-view.mts and
// farm-chop-view.mts; this file is the glue, kept out of the page's
// composition root (farm.mts) so the page only asks it three questions — is a
// plot in reach, what does the prompt say, and what does E do — and forwards
// the felling keys while a tree is being chopped.
//
// E at a Tree Plot does the one thing its state calls for: plant the selected
// sapling, clear a tree that died of thirst onto the compost heap, pick ripe
// fruit, start felling a grown timber tree, water a thirsty tree, or (pressed
// twice) dig out a stump. An account farm's picks and fellings are the
// server's (the page injects `submitHarvest`); a signed-out farm does them here.

import { findTreeSpecies, type TreeSpecies } from "./farm-catalog/trees.mjs";
import { clearDeadFarmTree, describeTree, digOutStump, findTreePlotInReach, harvestFarmTree, plantFarmTree, treeStatus, treesOfKind, waterFarmTree, type TreePlotTarget } from "./farm-trees.mjs";
import { forestryCapacity, orchardCapacity } from "./farm-capacity.mjs";
import { skillLevelForXp } from "./farm-skills.mjs";
import { startChop, swingAxe, type ChopState } from "./farm-chop.mjs";
import { withFarmAgriculture, withFarmClock, withFarmTrees, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";
import type { FarmTreesView } from "./farm-trees-view.mjs";
import type { ChopMeterView } from "./farm-chop-view.mjs";
import type { CropPlayerPose } from "./farm-crops.mjs";

/** "an Oak sapling", "an Apple sapling", "a Pear sapling". */
export function saplingName(species: TreeSpecies): string {
  const name = `${species.kind === "fruit" ? species.fruitTitle : species.title} sapling`;
  return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name}`;
}

/** Seconds a first E on a stump stays armed for the second. */
const DIG_CONFIRM_SECONDS = 3;
/** Walk this far from the tree being felled and the felling stops. */
const CHOP_LEASH = 3.2;

export type TreesControllerDeps = Readonly<{
  view: FarmTreesView;
  meter: ChopMeterView;
  layout: () => FarmLayout;
  clockMinutes: () => number;
  selectedSaplingId: () => string;
  /** Apply, save and say where the save went (the page's `persistLayout`). */
  persist: (next: FarmLayout) => Promise<string>;
  /** Account farms: send the farm and the plot to the server, adopt what comes back, and hand back the answer. Null: this farm picks and fells locally. */
  submitHarvest: ((plotId: string) => Promise<any>) | null;
  setStatus: (text: string) => void;
  onAchievements: (achievements: readonly unknown[]) => void;
  random?: () => number;
  /** Seconds, for the felling game. */
  now?: () => number;
}>;

export type FarmTreesController = Readonly<{
  /** Find the plot in reach (or none). `allowed` is false whenever something nearer to hand owns E. */
  update: (pose: CropPlayerPose, allowed: boolean) => void;
  inReach: () => boolean;
  prompt: () => string;
  /** E at a plot. */
  interact: () => boolean;
  chopping: () => boolean;
  /** E while felling. */
  swing: () => void;
  cancelChop: () => void;
  /** Once per fixed tick: the meter follows the marker. */
  tick: () => void;
}>;

export function createFarmTreesController(deps: TreesControllerDeps): FarmTreesController {
  const random = deps.random ?? Math.random;
  const seconds = deps.now ?? (() => performance.now() / 1000);
  let target: TreePlotTarget<FarmDecorRow> | null = null;
  let digArmed: { plotId: string; until: number } | null = null;
  let chop: { plotId: string; state: ChopState } | null = null;
  /** A felling walked away from keeps its damage for this visit, so coming back finishes the job. */
  const leftStanding = new Map<string, number>();
  let busy = false;

  const levels = (layout: FarmLayout) => ({
    farming: skillLevelForXp(layout.skills.farming.xp),
    woodcutting: skillLevelForXp(layout.skills.woodcutting.xp),
  });
  const capacityFor = (species: TreeSpecies, layout: FarmLayout) => {
    const level = levels(layout);
    return species.kind === "fruit" ? orchardCapacity(level.farming) : forestryCapacity(level.woodcutting);
  };
  const levelFor = (species: TreeSpecies, layout: FarmLayout) => species.kind === "fruit" ? levels(layout).farming : levels(layout).woodcutting;
  const standing = () => target ? deps.layout().trees.find((row) => row.plotId === target!.plot.instanceId) ?? null : null;

  function update(pose: CropPlayerPose, allowed: boolean): void {
    if (chop) {
      const plot = deps.layout().decor.find((row) => row.instanceId === chop!.plotId);
      if (!plot || Math.hypot(plot.x - pose.x, plot.z - pose.z) > CHOP_LEASH) cancelChop();
      return;
    }
    target = allowed ? findTreePlotInReach(deps.layout().decor, pose) : null;
    if (digArmed && (!target || target.plot.instanceId !== digArmed.plotId || seconds() > digArmed.until)) digArmed = null;
  }

  function emptyPlotPrompt(layout: FarmLayout): string {
    const owned = Object.values(layout.agriculture.inventory.saplings).some((count) => count > 0);
    if (!owned) return "Tree Plot · buy a sapling in Inventory (I) to plant a fruit or timber tree here";
    const species = findTreeSpecies(deps.selectedSaplingId());
    if (!species) return "Tree Plot · choose a sapling in Inventory (I)";
    const saplings = layout.agriculture.inventory.saplings[species.id] ?? 0;
    if (saplings <= 0) return `No ${species.title} saplings · choose another in Inventory (I)`;
    const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
    if (levelFor(species, layout) < species.minLevel) return `Planting ${saplingName(species)} needs ${skill} ${species.minLevel}`;
    const grove = species.kind === "fruit" ? "orchard" : "woodland";
    const used = treesOfKind(layout.trees, species.kind);
    const capacity = capacityFor(species, layout);
    if (used >= capacity) return `Your ${grove} is full · ${used}/${capacity} ${species.kind} trees · ${skill} levels make room for more`;
    return `Press E to plant ${saplingName(species)} · ${saplings} left · ${grove} ${used}/${capacity}`;
  }

  function prompt(): string {
    if (chop) return "Swing with E when the marker is in the green · move or Esc to stop";
    if (!target) return "";
    const layout = deps.layout();
    const row = standing();
    if (!row) return emptyPlotPrompt(layout);
    const species = findTreeSpecies(row.speciesId)!;
    const status = treeStatus(row, deps.clockMinutes());
    if (busy) return species.kind === "fruit" ? "Picking…" : "Timber!";
    if (status.dead) return `${describeTree(species, status)} · Press E to clear it onto the compost heap`;
    if (status.action === "pick") return `Press E to pick ${status.harvestYield} ${species.fruitPlural}`;
    if (status.action === "fell") return `Press E to fell the ${species.title} · ${status.harvestYield} logs`;
    const wilting = status.wilted ? "wilting " : "";
    if (status.thirsty) return `Press E to water the ${wilting}${species.title}${status.stage === "stump" ? " stump" : ""}`;
    if (status.stage === "stump") {
      if (digArmed?.plotId === row.plotId) return `Press E again to dig out the ${species.title} stump for good`;
      return `${describeTree(species, status)} · press E twice to dig it out`;
    }
    return describeTree(species, status);
  }

  async function persist(next: FarmLayout): Promise<string> {
    return deps.persist(withFarmClock(next, deps.clockMinutes(), Date.now()));
  }

  function plant(plotId: string): boolean {
    const layout = deps.layout();
    const species = findTreeSpecies(deps.selectedSaplingId());
    if (!species) return false;
    const planted = plantFarmTree(layout.trees, layout.agriculture.inventory, plotId, species.id, deps.clockMinutes(), capacityFor(species, layout), levelFor(species, layout));
    if (!planted.ok) return false;
    const next = withFarmTrees(withFarmAgriculture(layout, { ...layout.agriculture, inventory: planted.inventory }), planted.trees);
    void persist(next).then((saved) => deps.setStatus(`Planted ${saplingName(species)}. ${saved}`));
    return true;
  }

  function skillNote(result: any, species: TreeSpecies): string {
    const xp = Number(result?.xp) || 0;
    if (!xp) return "";
    const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
    const level = Number(result?.level?.level) || 1;
    const before = Number(result?.level?.levelBefore) || level;
    if (level <= before) return ` +${xp} ${skill} XP.`;
    const capacity = species.kind === "fruit" ? orchardCapacity : forestryCapacity;
    const room = capacity(level) - capacity(before);
    const more = room > 0 ? ` Room for ${room} more ${species.kind} tree${room === 1 ? "" : "s"}.` : "";
    return ` +${xp} ${skill} XP — ${skill} level ${level}!${more}`;
  }

  /** Pick or fell: the server's decision on an account farm, the pure rule on a local one. */
  async function harvest(plotId: string, species: TreeSpecies): Promise<void> {
    if (busy) return;
    busy = true;
    const done = (quantity: number, note: string) => species.kind === "fruit"
      ? `Picked ${quantity} ${quantity === 1 ? species.fruitTitle : species.fruitPlural}.${note}`
      : `Timber! ${quantity} ${species.title} logs.${note}`;
    try {
      if (deps.submitHarvest) {
        const result = await deps.submitHarvest(plotId);
        if (Array.isArray(result?.achievements) && result.achievements.length) deps.onAchievements(result.achievements);
        if (result?.ok) deps.setStatus(`${done(Number(result.quantity) || species.yield, skillNote(result, species))} Saved to your account.`);
        else if (result?.error === "not_ready") deps.setStatus(`The ${species.title} is not ready yet by the farm's records — it needs a little longer.`);
        else if (result?.error === "dead") deps.setStatus(`The ${species.title} died of thirst — it gives nothing now. Press E to clear it.`);
        else deps.setStatus(species.kind === "fruit" ? "That pick did not go through. Try again in a moment." : "That felling did not go through. Try again in a moment.");
        return;
      }
      const layout = deps.layout();
      const harvested = harvestFarmTree(layout.trees, layout.agriculture.inventory, plotId, deps.clockMinutes());
      if (!harvested.ok) return;
      const next = withFarmTrees(withFarmAgriculture(layout, { ...layout.agriculture, inventory: harvested.inventory }), harvested.trees);
      const saved = await persist(next);
      deps.setStatus(`${done(harvested.quantity, "")} ${saved}`);
    } catch {
      deps.setStatus("That did not go through. Try again in a moment.");
    } finally {
      busy = false;
    }
  }

  function interact(): boolean {
    if (!target || busy) return false;
    const plotId = target.plot.instanceId;
    const row = standing();
    if (!row) return plant(plotId);
    const species = findTreeSpecies(row.speciesId)!;
    const status = treeStatus(row, deps.clockMinutes());
    if (status.dead) {
      const layout = deps.layout();
      const cleared = clearDeadFarmTree(layout.trees, layout.agriculture.inventory, plotId, deps.clockMinutes());
      if (!cleared.ok) return false;
      const next = withFarmTrees(withFarmAgriculture(layout, { ...layout.agriculture, inventory: cleared.inventory }), cleared.trees);
      void persist(next).then((saved) => deps.setStatus(`Cleared the dead ${species.title} onto the compost heap (+1 compost) — the plot is free. ${saved}`));
      return true;
    }
    if (status.action === "pick") {
      void harvest(plotId, species);
      return true;
    }
    if (status.action === "fell") {
      const layout = deps.layout();
      const state = startChop(species.id, levels(layout).woodcutting, seconds(), random);
      if (!state) return false;
      const health = leftStanding.get(plotId);
      chop = { plotId, state: health ? { ...state, health } : state };
      deps.meter.show(`Felling the ${species.title}`);
      deps.meter.render(chop.state, seconds());
      document.exitPointerLock?.();
      return true;
    }
    if (status.thirsty) {
      const layout = deps.layout();
      const watered = waterFarmTree(layout.trees, layout.agriculture.inventory, plotId, deps.clockMinutes());
      if (!watered.ok) return false;
      void persist(withFarmTrees(layout, watered.trees)).then((saved) => deps.setStatus(`Watered the ${species.title}${status.wilted ? " — it will recover, but the wilting has cost this harvest" : ""}. ${saved}`));
      return true;
    }
    if (status.stage === "stump") {
      if (digArmed?.plotId !== plotId) {
        digArmed = { plotId, until: seconds() + DIG_CONFIRM_SECONDS };
        return true;
      }
      digArmed = null;
      const layout = deps.layout();
      const dug = digOutStump(layout.trees, layout.agriculture.inventory, plotId, deps.clockMinutes());
      if (!dug.ok) return false;
      void persist(withFarmTrees(layout, dug.trees)).then((saved) => deps.setStatus(`Dug out the ${species.title} stump — the plot is free. ${saved}`));
      return true;
    }
    return false;
  }

  function swing(): void {
    if (!chop) return;
    const swung = swingAxe(chop.state, seconds(), random);
    if (!swung.quality) return;
    chop = { ...chop, state: swung.state };
    deps.view.shake(chop.plotId);
    deps.meter.flash(swung.quality);
    deps.meter.render(chop.state, seconds());
    if (!swung.felled) return;
    const plotId = chop.plotId;
    const species = findTreeSpecies(chop.state.speciesId)!;
    leftStanding.delete(plotId);
    chop = null;
    deps.meter.hide();
    void harvest(plotId, species);
  }

  function cancelChop(): void {
    if (!chop) return;
    if (chop.state.health < chop.state.toughness) leftStanding.set(chop.plotId, chop.state.health);
    chop = null;
    deps.meter.hide();
  }

  return Object.freeze({
    update,
    inReach: () => Boolean(target) || Boolean(chop),
    prompt,
    interact,
    chopping: () => Boolean(chop),
    swing,
    cancelChop,
    tick: () => { if (chop) deps.meter.render(chop.state, seconds()); },
  });
}
