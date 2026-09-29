// The farm's livestock, wired: the herd from the server, the homes from the
// layout, the herd sim ticking beside the pets, the bodies drawing it, E on an
// animal, and the Livestock panel. The composition root (`farm.mts`) calls a
// handful of methods at the seams it already has — tick, draw, a layout
// change, the interaction pass — and learns nothing else about livestock.
//
// THE HERD IS THE SERVER'S. Every animal is a `farm_livestock` row
// (`GET /games/farm/livestock/:playerId`); this module reads it, draws it, and
// sends the two changes the owner can make (a new home, a new name). A
// signed-out farm has no herd: livestock are bought with tickets, and tickets
// are an account's.
import { FARM_BOUNDS } from "./farm-layout.mjs";
import { findPetInReach } from "./farm-interaction.mjs";
import { createLivestockBodies } from "./farm-livestock-bodies.mjs";
import { createHerdSim } from "./farm-livestock-sim.mjs";
import { livestockHomes } from "./farm-livestock-housing.mjs";
import { livestockSize, livestockSummary, normalizeLivestockAnimal, normalizeLivestockHerd } from "./farm-livestock.mjs";
const MOVE_ERRORS = Object.freeze({
    home_full: "There is no room there.",
    unknown_home: "That home is not on the farm any more.",
    not_found: "That animal is not on this farm.",
});
/** How often (sim seconds) growing animals are re-measured: size creeps with farm time. */
const GROWTH_REFRESH_SECONDS = 2;
export function createFarmLivestockController(options) {
    let herd = [];
    let homes = livestockHomes(options.layout().decor);
    let nearby = null;
    let growthTimer = 0;
    const sim = createHerdSim({
        bounds: FARM_BOUNDS,
        random: Math.random,
        obstacles: options.obstacles,
        keepOut: options.keepOut,
        water: options.water,
        homes: () => homes,
    });
    const bodies = createLivestockBodies(options.THREE, options.scene);
    function entries() {
        const clock = options.clockMinutes();
        return herd.map((animal) => ({
            id: animal.id,
            speciesId: animal.speciesId,
            name: `${animal.name} ${livestockSummary(animal, clock).stars}`,
            coatId: animal.coatId,
            sizeMultiplier: livestockSize(animal, clock),
            homeId: animal.homeId,
        }));
    }
    function render() {
        options.panel.render({
            herd,
            homes,
            clockMinutes: options.clockMinutes(),
            canManage: options.canManage && Boolean(options.api),
            note: options.api && options.ownerId ? "" : "Livestock are bought with tickets, so they live on an account farm. Sign in to keep them.",
        });
    }
    function apply(next) {
        herd = next;
        sim.sync(entries());
        render();
    }
    /** Replace one animal with the server's answer, or the whole herd when it sent one. */
    function absorb(result) {
        if (Array.isArray(result?.herd))
            apply(normalizeLivestockHerd(result.herd));
        else if (result?.animal) {
            const animal = normalizeLivestockAnimal(result.animal);
            if (animal)
                apply(herd.map((entry) => (entry.id === animal.id ? animal : entry)));
        }
    }
    render();
    return Object.freeze({
        async refresh() {
            if (!options.api || !options.ownerId)
                return;
            const answer = await options.api.fetchFarmLivestock(options.ownerId).catch(() => null);
            if (Array.isArray(answer))
                apply(normalizeLivestockHerd(answer));
        },
        sync() {
            homes = livestockHomes(options.layout().decor);
            sim.sync(entries());
            render();
        },
        tick(dt, player) {
            growthTimer += dt;
            if (growthTimer >= GROWTH_REFRESH_SECONDS) {
                growthTimer = 0;
                if (herd.length)
                    sim.sync(entries());
            }
            sim.tick(dt, player);
        },
        draw(frameSeconds) {
            bodies.sync(sim.animals(), frameSeconds);
        },
        update(pose, enabled) {
            nearby = enabled ? findPetInReach(bodies.views(), { ...pose, y: 0, yaw: 0 }) : null;
        },
        inReach: () => nearby !== null,
        prompt() {
            if (!nearby)
                return "";
            const animal = herd.find((entry) => entry.id === nearby.instanceId);
            if (!animal)
                return "";
            const summary = livestockSummary(animal, options.clockMinutes());
            const home = homes.find((entry) => entry.id === animal.homeId);
            const where = home ? home.title : "needs a home — press L to give it one";
            return `${animal.name} · ${summary.kind} ${summary.stars}${summary.stage === "young" ? ` · ${summary.grownPercent}% grown` : ""} · ${where} · Press E to pat`;
        },
        interact() {
            if (!nearby)
                return false;
            bodies.showHeart(nearby.instanceId);
            sim.attention(nearby.instanceId);
            return true;
        },
        herd: () => herd,
        homes: () => homes,
        async move(animalId, homeId) {
            if (!options.api)
                return "Sign in to keep livestock.";
            const result = await options.api.moveFarmLivestock({ animalId, homeId }).catch(() => null);
            if (!result?.ok)
                return MOVE_ERRORS[result?.error] ?? "That did not work. Try again.";
            absorb(result);
            const animal = herd.find((entry) => entry.id === animalId);
            const home = homes.find((entry) => entry.id === homeId);
            return animal ? `${animal.name} ${home ? `moved to ${home.title}` : "is out on the field"}.` : "Moved.";
        },
        async rename(animalId, name) {
            if (!options.api)
                return "Sign in to keep livestock.";
            const result = await options.api.renameFarmLivestock({ animalId, name }).catch(() => null);
            if (!result?.ok)
                return MOVE_ERRORS[result?.error] ?? "That name did not stick. Try again.";
            absorb(result);
            return `Renamed ${result.animal?.name ?? name}.`;
        },
        poses: () => sim.animals(),
    });
}
