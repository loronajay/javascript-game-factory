// The orchard and the forestry, on the page: what E does at a Tree Plot, what
// the prompt says, and the felling game. The rules are pure (farm-trees.mts,
// farm-chop.mts, farm-capacity.mts); the drawing is farm-trees-view.mts and
// farm-chop-view.mts; this file is the glue, kept out of the page's
// composition root (farm.mts) so the page only asks it three questions — is a
// plot in reach, what does the prompt say, and what does E do — and forwards
// the felling keys while a tree is being chopped.
//
// E at a Tree Plot does the one thing its state calls for: plant the selected
// sapling, pick ripe fruit, start felling a grown timber tree, or (pressed
// twice) dig out a stump. An account farm's picks and fellings are the
// server's (the page injects `submitHarvest`); a signed-out farm does them here.
import { findTreeSpecies } from "./farm-catalog/trees.mjs";
import { describeTree, digOutStump, findTreePlotInReach, harvestFarmTree, plantFarmTree, treeStatus, treesOfKind } from "./farm-trees.mjs";
import { forestryCapacity, orchardCapacity } from "./farm-capacity.mjs";
import { skillLevelForXp } from "./farm-skills.mjs";
import { startChop, swingAxe } from "./farm-chop.mjs";
import { withFarmAgriculture, withFarmClock, withFarmTrees } from "./farm-layout.mjs";
/** "an Oak sapling", "an Apple sapling", "a Pear sapling". */
export function saplingName(species) {
    const name = `${species.kind === "fruit" ? species.fruitTitle : species.title} sapling`;
    return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name}`;
}
/** Seconds a first E on a stump stays armed for the second. */
const DIG_CONFIRM_SECONDS = 3;
/** Walk this far from the tree being felled and the felling stops. */
const CHOP_LEASH = 3.2;
export function createFarmTreesController(deps) {
    const random = deps.random ?? Math.random;
    const seconds = deps.now ?? (() => performance.now() / 1000);
    let target = null;
    let digArmed = null;
    let chop = null;
    /** A felling walked away from keeps its damage for this visit, so coming back finishes the job. */
    const leftStanding = new Map();
    let busy = false;
    const levels = (layout) => ({
        farming: skillLevelForXp(layout.skills.farming.xp),
        woodcutting: skillLevelForXp(layout.skills.woodcutting.xp),
    });
    const capacityFor = (species, layout) => {
        const level = levels(layout);
        return species.kind === "fruit" ? orchardCapacity(level.farming) : forestryCapacity(level.woodcutting);
    };
    const levelFor = (species, layout) => species.kind === "fruit" ? levels(layout).farming : levels(layout).woodcutting;
    const standing = () => target ? deps.layout().trees.find((row) => row.plotId === target.plot.instanceId) ?? null : null;
    function update(pose, allowed) {
        if (chop) {
            const plot = deps.layout().decor.find((row) => row.instanceId === chop.plotId);
            if (!plot || Math.hypot(plot.x - pose.x, plot.z - pose.z) > CHOP_LEASH)
                cancelChop();
            return;
        }
        target = allowed ? findTreePlotInReach(deps.layout().decor, pose) : null;
        if (digArmed && (!target || target.plot.instanceId !== digArmed.plotId || seconds() > digArmed.until))
            digArmed = null;
    }
    function emptyPlotPrompt(layout) {
        const owned = Object.values(layout.agriculture.inventory.saplings).some((count) => count > 0);
        if (!owned)
            return "Tree Plot · buy a sapling in Inventory (I) to plant a fruit or timber tree here";
        const species = findTreeSpecies(deps.selectedSaplingId());
        if (!species)
            return "Tree Plot · choose a sapling in Inventory (I)";
        const saplings = layout.agriculture.inventory.saplings[species.id] ?? 0;
        if (saplings <= 0)
            return `No ${species.title} saplings · choose another in Inventory (I)`;
        const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
        if (levelFor(species, layout) < species.minLevel)
            return `Planting ${saplingName(species)} needs ${skill} ${species.minLevel}`;
        const grove = species.kind === "fruit" ? "orchard" : "woodland";
        const used = treesOfKind(layout.trees, species.kind);
        const capacity = capacityFor(species, layout);
        if (used >= capacity)
            return `Your ${grove} is full · ${used}/${capacity} ${species.kind} trees · ${skill} levels make room for more`;
        return `Press E to plant ${saplingName(species)} · ${saplings} left · ${grove} ${used}/${capacity}`;
    }
    function prompt() {
        if (chop)
            return "Swing with E when the marker is in the green · move or Esc to stop";
        if (!target)
            return "";
        const layout = deps.layout();
        const row = standing();
        if (!row)
            return emptyPlotPrompt(layout);
        const species = findTreeSpecies(row.speciesId);
        const status = treeStatus(row, deps.clockMinutes());
        if (busy)
            return species.kind === "fruit" ? "Picking…" : "Timber!";
        if (status.action === "pick")
            return `Press E to pick ${species.yield} ${species.fruitPlural}`;
        if (status.action === "fell")
            return `Press E to fell the ${species.title} · ${species.yield} logs`;
        if (status.stage === "stump") {
            if (digArmed?.plotId === row.plotId)
                return `Press E again to dig out the ${species.title} stump for good`;
            return `${describeTree(species, status)} · press E twice to dig it out`;
        }
        return describeTree(species, status);
    }
    async function persist(next) {
        return deps.persist(withFarmClock(next, deps.clockMinutes(), Date.now()));
    }
    function plant(plotId) {
        const layout = deps.layout();
        const species = findTreeSpecies(deps.selectedSaplingId());
        if (!species)
            return false;
        const planted = plantFarmTree(layout.trees, layout.agriculture.inventory, plotId, species.id, deps.clockMinutes(), capacityFor(species, layout), levelFor(species, layout));
        if (!planted.ok)
            return false;
        const next = withFarmTrees(withFarmAgriculture(layout, { ...layout.agriculture, inventory: planted.inventory }), planted.trees);
        void persist(next).then((saved) => deps.setStatus(`Planted ${saplingName(species)}. ${saved}`));
        return true;
    }
    function skillNote(result, species) {
        const xp = Number(result?.xp) || 0;
        if (!xp)
            return "";
        const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
        const level = Number(result?.level?.level) || 1;
        const before = Number(result?.level?.levelBefore) || level;
        if (level <= before)
            return ` +${xp} ${skill} XP.`;
        const capacity = species.kind === "fruit" ? orchardCapacity : forestryCapacity;
        const room = capacity(level) - capacity(before);
        const more = room > 0 ? ` Room for ${room} more ${species.kind} tree${room === 1 ? "" : "s"}.` : "";
        return ` +${xp} ${skill} XP — ${skill} level ${level}!${more}`;
    }
    /** Pick or fell: the server's decision on an account farm, the pure rule on a local one. */
    async function harvest(plotId, species) {
        if (busy)
            return;
        busy = true;
        const done = (quantity, note) => species.kind === "fruit"
            ? `Picked ${quantity} ${quantity === 1 ? species.fruitTitle : species.fruitPlural}.${note}`
            : `Timber! ${quantity} ${species.title} logs.${note}`;
        try {
            if (deps.submitHarvest) {
                const result = await deps.submitHarvest(plotId);
                if (Array.isArray(result?.achievements) && result.achievements.length)
                    deps.onAchievements(result.achievements);
                if (result?.ok)
                    deps.setStatus(`${done(Number(result.quantity) || species.yield, skillNote(result, species))} Saved to your account.`);
                else if (result?.error === "not_ready")
                    deps.setStatus(`The ${species.title} is not ready yet by the farm's records — it needs a little longer.`);
                else
                    deps.setStatus(species.kind === "fruit" ? "That pick did not go through. Try again in a moment." : "That felling did not go through. Try again in a moment.");
                return;
            }
            const layout = deps.layout();
            const harvested = harvestFarmTree(layout.trees, layout.agriculture.inventory, plotId, deps.clockMinutes());
            if (!harvested.ok)
                return;
            const next = withFarmTrees(withFarmAgriculture(layout, { ...layout.agriculture, inventory: harvested.inventory }), harvested.trees);
            const saved = await persist(next);
            deps.setStatus(`${done(harvested.quantity, "")} ${saved}`);
        }
        catch {
            deps.setStatus("That did not go through. Try again in a moment.");
        }
        finally {
            busy = false;
        }
    }
    function interact() {
        if (!target || busy)
            return false;
        const plotId = target.plot.instanceId;
        const row = standing();
        if (!row)
            return plant(plotId);
        const species = findTreeSpecies(row.speciesId);
        const status = treeStatus(row, deps.clockMinutes());
        if (status.action === "pick") {
            void harvest(plotId, species);
            return true;
        }
        if (status.action === "fell") {
            const layout = deps.layout();
            const state = startChop(species.id, levels(layout).woodcutting, seconds(), random);
            if (!state)
                return false;
            const health = leftStanding.get(plotId);
            chop = { plotId, state: health ? { ...state, health } : state };
            deps.meter.show(`Felling the ${species.title}`);
            deps.meter.render(chop.state, seconds());
            document.exitPointerLock?.();
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
            if (!dug.ok)
                return false;
            void persist(withFarmTrees(layout, dug.trees)).then((saved) => deps.setStatus(`Dug out the ${species.title} stump — the plot is free. ${saved}`));
            return true;
        }
        return false;
    }
    function swing() {
        if (!chop)
            return;
        const swung = swingAxe(chop.state, seconds(), random);
        if (!swung.quality)
            return;
        chop = { ...chop, state: swung.state };
        deps.view.shake(chop.plotId);
        deps.meter.flash(swung.quality);
        deps.meter.render(chop.state, seconds());
        if (!swung.felled)
            return;
        const plotId = chop.plotId;
        const species = findTreeSpecies(chop.state.speciesId);
        leftStanding.delete(plotId);
        chop = null;
        deps.meter.hide();
        void harvest(plotId, species);
    }
    function cancelChop() {
        if (!chop)
            return;
        if (chop.state.health < chop.state.toughness)
            leftStanding.set(chop.plotId, chop.state.health);
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
        tick: () => { if (chop)
            deps.meter.render(chop.state, seconds()); },
    });
}
