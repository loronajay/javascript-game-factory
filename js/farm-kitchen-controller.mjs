// The kitchen, on the page: what E does at a Kitchen Range, what the prompt
// says, and the cooking games. The rules are pure (farm-kitchen.mts,
// farm-cooking.mts); the drawing is farm-kitchen-view.mts (the range) and
// farm-cooking-view.mts (the games' readout); the cookbook is
// farm-kitchen-panel.mts. This file is the glue, kept out of the page's
// composition root (farm.mts) the way the orchard's is, so the page only asks
// it whether a range is in reach, what the prompt says and what E does, and
// forwards the keys while a dish is cooking.
//
// Nothing is spent until the dish is served: walking away, or Escape, puts the
// ingredients back on the shelf. An account farm's dish is the server's (the
// page injects `submitCook`: the server takes the ingredients, decides the
// stars from the step scores and pays the Cooking XP); a signed-out farm cooks
// here, on this device, and earns no XP.
import { RECIPE_CATALOG, findRecipe } from "./farm-catalog/recipes.mjs";
import { cookLocally, findKitchenInReach, recipeAvailability } from "./farm-kitchen.mjs";
import { CHOP_CUTS, cookingDone, dishStars, pressCook, startCooking, stirCook, stirDirectionForKey, tickCooking } from "./farm-cooking.mjs";
import { withFarmAgriculture } from "./farm-layout.mjs";
import { skillLevelForXp } from "./farm-skills.mjs";
/** How long the served dish's card stays up. */
const RESULT_SECONDS = 4;
function cookId() {
    return `cook-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
/** The recipes a level-up just taught, by name. */
function newlyTaught(before, after) {
    return RECIPE_CATALOG.filter((recipe) => recipe.minLevel > before && recipe.minLevel <= after).map((recipe) => recipe.title);
}
export function createFarmKitchenController(deps) {
    const random = deps.random ?? Math.random;
    const seconds = deps.now ?? (() => performance.now() / 1000);
    let target = null;
    let active = null;
    let holding = false;
    let serving = false;
    let resultUntil = 0;
    const cookingLevel = () => skillLevelForXp(deps.layout().skills.cooking.xp);
    function update(pose, allowed) {
        if (active || serving)
            return;
        target = allowed ? findKitchenInReach(deps.layout().decor, pose) : null;
    }
    function prompt() {
        if (serving)
            return "Serving…";
        if (active)
            return "Cooking · Esc to stop — nothing is used until the dish is served";
        if (!target)
            return "";
        const ready = RECIPE_CATALOG.filter((recipe) => recipeAvailability(recipe, deps.layout().agriculture.inventory.produce, cookingLevel()).state === "ready").length;
        return ready ? `Press E to cook · ${ready} recipe${ready === 1 ? "" : "s"} ready` : "Press E to open the cookbook";
    }
    function interact() {
        if (!target || active || serving)
            return false;
        deps.panel.open(deps.layout().agriculture.inventory, cookingLevel(), deps.submitCook ? "" : "Cooking on this device · sign in to earn Cooking XP and sell dishes at the Market.");
        return true;
    }
    function begin(recipeId) {
        const row = target;
        const recipe = findRecipe(recipeId);
        if (!row || !recipe || active)
            return;
        if (recipeAvailability(recipe, deps.layout().agriculture.inventory.produce, cookingLevel()).state !== "ready")
            return;
        const session = startCooking(recipe.id, cookingLevel(), seconds(), random);
        if (!session)
            return;
        active = { row, recipe, session };
        holding = false;
        resultUntil = 0;
        deps.view.begin(row, recipe);
        deps.hud.show(recipe.title);
        deps.hud.render(session, seconds());
        stepStarted(session);
    }
    /** What the range does as each step begins. */
    function stepStarted(session) {
        const kind = session.step?.kind;
        deps.view.stirring(kind === "stir");
        if (kind === "simmer")
            deps.view.heat(session.step && session.step.kind === "simmer" ? session.step.heat : 0);
        if (kind === "bake")
            deps.view.bake(0);
    }
    function apply(result) {
        if (!active)
            return;
        const stepBefore = active.session.index;
        active = { ...active, session: result.session };
        const event = result.event;
        if (event.kind === "cut") {
            const step = result.session.step;
            deps.view.cut(event.quality !== "poor", step?.kind === "chop" ? CHOP_CUTS - step.cuts.length : 0);
        }
        if (event.kind === "stir")
            deps.view.stir(event.quality === "hit");
        if (event.kind === "pull")
            deps.view.bake(null);
        deps.hud.flash(event);
        if (cookingDone(result.session)) {
            void serve();
            return;
        }
        if (result.session.index !== stepBefore)
            stepStarted(result.session);
        deps.hud.render(result.session, seconds());
    }
    async function serve() {
        if (!active)
            return;
        const { recipe, session } = active;
        active = null;
        serving = true;
        holding = false;
        const scores = session.scores;
        try {
            if (deps.submitCook) {
                const result = await deps.submitCook(recipe.id, scores, cookId());
                if (Array.isArray(result?.achievements) && result.achievements.length)
                    deps.onAchievements(result.achievements);
                if (!result?.ok) {
                    deps.view.cancel();
                    deps.hud.hide();
                    deps.setStatus(result?.error === "not_enough_produce"
                        ? "The basket came up short when the farm's records were checked. Nothing was used."
                        : result?.error === "pantry_full" ? "The pantry has no room for another of those. Sell some at the Market first."
                            : result?.error === "level_too_low" ? "That recipe needs a higher Cooking level by the farm's records."
                                : "That dish did not go through. Nothing was used — try again in a moment.");
                    return;
                }
                const stars = Number(result.stars) || dishStars(scores);
                const before = Number(result.cooking?.levelBefore) || 1;
                const after = Number(result.cooking?.level) || before;
                const taught = newlyTaught(before, after);
                const levelUp = after > before ? ` Cooking level ${after}!${taught.length ? ` New: ${taught.join(", ")}.` : ""}` : "";
                const note = result.duplicate ? "Already served." : `+${Number(result.xp) || recipe.xp} Cooking XP.${levelUp}`;
                deps.view.finish(recipe, stars);
                deps.hud.result({ title: recipe.title, stars, note, itemKey: `dish:${recipe.id}@${stars}` });
                deps.setStatus(`${recipe.title} is in your pantry. ${note} Saved to your account.`);
            }
            else {
                const stars = dishStars(scores);
                const layout = deps.layout();
                const cooked = cookLocally(layout.agriculture.inventory, recipe.id, stars, cookingLevel());
                if (!cooked.ok) {
                    deps.view.cancel();
                    deps.hud.hide();
                    deps.setStatus(cooked.reason === "pantry_full" ? "The pantry has no room for another of those." : "The ingredients are not all here any more. Nothing was used.");
                    return;
                }
                const saved = await deps.persist(withFarmAgriculture(layout, { ...layout.agriculture, inventory: cooked.inventory }));
                deps.view.finish(recipe, stars);
                deps.hud.result({ title: recipe.title, stars, note: "Sign in to earn Cooking XP.", itemKey: `dish:${recipe.id}@${stars}` });
                deps.setStatus(`${recipe.title} is in your pantry. ${saved}`);
            }
            resultUntil = seconds() + RESULT_SECONDS;
        }
        catch {
            deps.view.cancel();
            deps.hud.hide();
            deps.setStatus("That dish did not go through. Nothing was used — try again in a moment.");
        }
        finally {
            serving = false;
        }
    }
    function cancel() {
        if (!active)
            return;
        active = null;
        holding = false;
        deps.view.cancel();
        deps.hud.hide();
        deps.setStatus("You stepped away from the stove. Nothing was used.");
    }
    function keyDown(code) {
        if (!active)
            return false;
        if (code === "Escape") {
            cancel();
            return true;
        }
        const now = seconds();
        if (code === "KeyE" || code === "Space") {
            holding = true;
            apply(pressCook(active.session, now, random));
            return true;
        }
        const direction = stirDirectionForKey(code);
        if (direction && active.session.step?.kind === "stir") {
            apply(stirCook(active.session, direction, now, random));
            return true;
        }
        // Every other key belongs to the stove while a dish is on it (no walking off mid-stir).
        return true;
    }
    function keyUp(code) {
        if (code === "KeyE" || code === "Space")
            holding = false;
    }
    function tick() {
        if (resultUntil && seconds() > resultUntil && !active) {
            resultUntil = 0;
            deps.hud.hide();
        }
        if (!active)
            return;
        const now = seconds();
        const result = tickCooking(active.session, now, holding, random);
        const step = result.session.step;
        if (step?.kind === "simmer")
            deps.view.heat(step.heat);
        if (step?.kind === "bake")
            deps.view.bake(Math.min(1, (now - step.startedAt) * step.rate));
        if (result.event.kind !== "none" || result.session.index !== active.session.index)
            apply(result);
        else {
            active = { ...active, session: result.session };
            deps.hud.render(result.session, now);
        }
    }
    function sync() {
        const decor = deps.layout().decor;
        if (active && !decor.some((row) => row.instanceId === active.row.instanceId))
            cancel();
        deps.view.sync(decor);
    }
    return Object.freeze({
        update,
        inReach: () => Boolean(target) || Boolean(active),
        prompt,
        interact,
        begin,
        cooking: () => Boolean(active) || serving,
        keyDown,
        keyUp,
        cancel,
        sync,
        tick,
    });
}
