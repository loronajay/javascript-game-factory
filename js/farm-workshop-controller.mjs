// The workshop, on the page: what E does at a Carpenter's Workbench or at the
// farm's own Sawmill, what the prompt says, and the carpentry games. The rules
// are pure (farm-workshop.mts, farm-carpentry.mts); the drawing is
// farm-workshop-view.mts (the bench) and farm-carpentry-view.mts (the games'
// readout); the pattern book is farm-workshop-panel.mts and the Sawmill's
// counter farm-mill-panel.mts. This file is the glue, kept out of the page's
// composition root (farm.mts) the way the kitchen's is.
//
// Nothing is spent until the piece is finished: walking away, or Escape,
// leaves every plank on the pile. Every piece and every plank is the server's
// (the page injects `submitCraft`, and the mill panel its own call); a signed-out farm can read
// the pattern book and is told to sign in. The home Sawmill's counter carries
// its own server call (the page builds the mill panel with it).
import { PATTERN_CATALOG, SAWMILL_ITEM_ID, WORKBENCH_ITEM_ID, findPattern, pieceKey } from "./farm-catalog/carpentry.mjs";
import { findStationInReach, patternAvailability } from "./farm-workshop.mjs";
import { craftingDone, pieceStars, pressCraft, releaseCraft, sawCraft, sawDirectionForKey, startCrafting, tickCrafting } from "./farm-carpentry.mjs";
import { skillLevelForXp } from "./farm-skills.mjs";
/** How long the finished piece's card stays up. */
const RESULT_SECONDS = 4;
/** Half the depth of each station: its front face sits this far from its centre. */
const WORKBENCH_HALF_DEPTH = 0.4;
const SAWMILL_HALF_DEPTH = 0.8;
function workshopId(kind) {
    return `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
/** The patterns a level-up just taught, by name. */
function newlyTaught(before, after) {
    return PATTERN_CATALOG.filter((pattern) => pattern.minLevel > before && pattern.minLevel <= after).map((pattern) => pattern.title);
}
function levelNote(summary, xp) {
    const before = Number(summary?.levelBefore) || 1;
    const after = Number(summary?.level) || before;
    const taught = newlyTaught(before, after);
    const levelUp = after > before ? ` Carpentry level ${after}!${taught.length ? ` New: ${taught.join(", ")}.` : ""}` : "";
    return `+${xp} Carpentry XP.${levelUp}`;
}
export function createFarmWorkshopController(deps) {
    const random = deps.random ?? Math.random;
    const seconds = deps.now ?? (() => performance.now() / 1000);
    let bench = null;
    let sawmill = null;
    let active = null;
    let finishing = false;
    let resultUntil = 0;
    const carpentryLevel = () => skillLevelForXp(deps.layout().skills.carpentry.xp);
    const workshopState = () => ({ inventory: deps.layout().agriculture.inventory, decor: deps.layout().decor, level: carpentryLevel() });
    function update(pose, allowed) {
        if (active || finishing)
            return;
        const decor = deps.layout().decor;
        bench = allowed ? findStationInReach(decor, pose, WORKBENCH_ITEM_ID, WORKBENCH_HALF_DEPTH) : null;
        sawmill = allowed && !bench ? findStationInReach(decor, pose, SAWMILL_ITEM_ID, SAWMILL_HALF_DEPTH) : null;
    }
    function prompt() {
        if (finishing)
            return "Finishing…";
        if (active)
            return "At the bench · Esc to stop — no planks are used until the piece is finished";
        if (sawmill) {
            const logs = Object.values(deps.layout().agriculture.inventory.logs).reduce((sum, count) => sum + count, 0);
            return logs ? `Press E to saw logs · ${logs} held` : "Sawmill · fell a timber tree for logs to saw";
        }
        if (!bench)
            return "";
        const { inventory } = workshopState();
        const ready = PATTERN_CATALOG.filter((pattern) => patternAvailability(pattern, inventory.planks, carpentryLevel()).state === "ready").length;
        return ready ? `Press E to make furniture · ${ready} pattern${ready === 1 ? "" : "s"} ready` : "Press E to open the pattern book";
    }
    function interact() {
        if (active || finishing)
            return false;
        if (sawmill) {
            deps.millPanel.open(deps.layout().agriculture.inventory, deps.submitCraft ? "Your own Sawmill · no fee." : "Sign in to saw logs into planks.");
            return true;
        }
        if (!bench)
            return false;
        deps.panel.open(workshopState(), deps.submitCraft ? "" : "Sign in to make furniture: every piece is kept with your account.");
        return true;
    }
    function begin(itemId) {
        const row = bench;
        const pattern = findPattern(itemId);
        if (!row || !pattern || active || !deps.submitCraft)
            return;
        if (patternAvailability(pattern, deps.layout().agriculture.inventory.planks, carpentryLevel()).state !== "ready")
            return;
        const session = startCrafting(pattern.id, carpentryLevel(), seconds(), random);
        if (!session)
            return;
        active = { row, pattern, session };
        resultUntil = 0;
        deps.view.begin(row);
        deps.hud.show(pattern.title);
        deps.hud.render(session, seconds());
        if (session.step)
            deps.view.step(session.step.kind);
    }
    function apply(result) {
        if (!active)
            return;
        const stepBefore = active.session.index;
        active = { ...active, session: result.session };
        deps.hud.flash(result.event);
        if (craftingDone(result.session)) {
            void finish();
            return;
        }
        const step = result.session.step;
        if (result.session.index !== stepBefore)
            deps.view.step(step.kind);
        deps.view.progress(step.kind === "measure" ? step.marks.length : step.kind === "saw" ? step.strokes.length : step.nails.length);
        deps.hud.render(result.session, seconds());
    }
    async function finish() {
        if (!active || !deps.submitCraft)
            return;
        const { row, pattern, session } = active;
        active = null;
        finishing = true;
        try {
            const result = await deps.submitCraft(pattern.id, session.scores, workshopId("craft"));
            if (Array.isArray(result?.achievements) && result.achievements.length)
                deps.onAchievements(result.achievements);
            if (!result?.ok) {
                deps.view.cancel();
                deps.hud.hide();
                deps.setStatus(result?.error === "not_enough_planks"
                    ? "The plank pile came up short when the farm's records were checked. Nothing was used."
                    : result?.error === "insufficient_tickets" ? `This piece needs ${pattern.tickets} tickets for its fittings. Nothing was used.`
                        : result?.error === "workshop_full" ? "Your shelf has no room for another of those. Sell some at the Market Square's Sawmill."
                            : result?.error === "level_too_low" ? "That pattern needs a higher Carpentry level by the farm's records."
                                : result?.error === "no_workbench" ? "The Workbench is not on the farm's records yet. Save your farm and try again."
                                    : "That piece did not go through. Nothing was used — try again in a moment.");
                return;
            }
            const stars = (Number(result.stars) || pieceStars(session.scores));
            const note = result.duplicate ? "Already made." : levelNote(result.carpentry, Number(result.xp) || pattern.xp);
            deps.view.finish(row, pattern.id, stars);
            deps.hud.result({ title: pattern.title, stars, note, itemKey: `piece:${pieceKey(pattern.id, stars)}` });
            deps.setStatus(`${pattern.title} is on your shelf · place it from build mode's Furniture tab. ${note}`);
            resultUntil = seconds() + RESULT_SECONDS;
        }
        catch {
            deps.view.cancel();
            deps.hud.hide();
            deps.setStatus("That piece did not go through. Nothing was used — try again in a moment.");
        }
        finally {
            finishing = false;
        }
    }
    function cancel() {
        if (!active)
            return;
        active = null;
        deps.view.cancel();
        deps.hud.hide();
        deps.setStatus("You stepped back from the bench. No planks were used.");
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
            apply(pressCraft(active.session, now, random));
            return true;
        }
        const direction = sawDirectionForKey(code);
        if (direction && active.session.step?.kind === "saw") {
            apply(sawCraft(active.session, direction, now, random));
            return true;
        }
        // Every other key belongs to the bench while a piece is on it.
        return true;
    }
    function keyUp(code) {
        if (!active || (code !== "KeyE" && code !== "Space"))
            return;
        apply(releaseCraft(active.session, seconds(), random));
    }
    function tick() {
        if (resultUntil && seconds() > resultUntil && !active) {
            resultUntil = 0;
            deps.hud.hide();
        }
        if (!active)
            return;
        const now = seconds();
        const result = tickCrafting(active.session, now, random);
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
        if (deps.panel.isOpen())
            deps.panel.render(workshopState());
    }
    return Object.freeze({
        update,
        inReach: () => Boolean(bench) || Boolean(sawmill) || Boolean(active),
        prompt,
        interact,
        begin,
        crafting: () => Boolean(active) || finishing,
        panelOpen: () => deps.panel.isOpen() || deps.millPanel.isOpen(),
        closePanels: () => { deps.panel.close(); deps.millPanel.close(); },
        keyDown,
        keyUp,
        cancel,
        sync,
        tick,
    });
}
/**
 * What a home mill's server answer means on the Sawmill's counter: the
 * message, and the stock the counter should show next (the farm the page has
 * just adopted from the answer).
 */
export function millOutcome(result, layout) {
    if (!result?.ok) {
        const message = result?.error === "not_enough_logs" ? "There are not that many logs on the farm's records. Nothing was sawn."
            : result?.error === "planks_full" ? "That plank pile is full (99). Make something with them first."
                : result?.error === "insufficient_tickets" ? "Not enough tickets for the Sawmill's fee."
                    : result?.error === "no_sawmill" ? "The Sawmill is not on the farm's records yet. Save your farm and try again."
                        : "The saw jammed. Nothing was used — try again in a moment.";
        return { ok: false, message, inventory: layout().agriculture.inventory };
    }
    if (result.duplicate)
        return { ok: true, message: "Already sawn.", inventory: layout().agriculture.inventory };
    const fee = Number(result.fee) || 0;
    return {
        ok: true,
        message: `${Number(result.logs)} logs sawn into ${Number(result.planks)} planks${fee ? ` for ${fee} ticket${fee === 1 ? "" : "s"}` : ""}. ${levelNote(result.carpentry, Number(result.xp) || 0)}`,
        inventory: layout().agriculture.inventory,
    };
}
