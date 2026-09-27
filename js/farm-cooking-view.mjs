// The cooking games on screen: a small panel at the top of the view — clear of
// the worktop and the pot, which is where the eye is — that shows the step
// being played and how it is going, while the range itself shows the cooking
// (farm-kitchen-view.mts).
//
//   chop    the board's bar, the mark (good band, perfect core), the knife marker, four cut pips
//   stir    the direction the pot is calling for, the time left on the call, six pips
//   simmer  the heat gauge with its band and needle, and the simmer's time running out
//   bake    the doneness bar from raw through golden to burnt, the golden window, the marker
//
// The maths is the pure farm-cooking.mts; this file only moves DOM to match
// a session it is handed, and is rebuilt only when the step changes.
import { BAKE_BURNT, CHOP_CUTS, SIMMER_SECONDS, bakeDoneness, chopMarker, simmerBand, stirCall, stirTimeLeft, } from "./farm-cooking.mjs";
import { COOK_STEP_TITLES } from "./farm-catalog/recipes.mjs";
const HINTS = Object.freeze({
    chop: "Press E as the knife crosses the mark",
    stir: "Press the direction the pot calls for · WASD or arrows",
    simmer: "Hold E to feed the fire · keep the needle in the band",
    bake: "Press E to pull it out at golden",
});
const ARROWS = Object.freeze({ up: "↑", right: "→", down: "↓", left: "←" });
const WORDS = Object.freeze({
    perfect: "Perfect cut!", good: "Good cut", poor: "Rough cut",
    hit: "Nice stir", miss: "Missed!",
    golden: "Golden!", pale: "A bit pale", dark: "A touch dark", burnt: "Burnt!",
});
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
const percent = (value) => `${(Math.min(1, Math.max(0, value)) * 100).toFixed(2)}%`;
export function createCookingHud(root, options = {}) {
    const title = root.querySelector("[data-cook-title]");
    const stepLabel = root.querySelector("[data-cook-step]");
    const hint = root.querySelector("[data-cook-hint]");
    const stage = root.querySelector("[data-cook-stage]");
    const steps = root.querySelector("[data-cook-steps]");
    const word = root.querySelector("[data-cook-word]");
    let built = -1;
    let parts = {};
    let pips = [];
    let wordTimer = null;
    function bar(zoneClass) {
        const track = element("div", `cook-bar ${zoneClass}`);
        parts.good = element("i", "cook-bar__good");
        parts.perfect = element("i", "cook-bar__perfect");
        parts.marker = element("i", "cook-bar__marker");
        track.append(parts.good, parts.perfect, parts.marker);
        return track;
    }
    function pipRow(count) {
        const row = element("div", "cook-pips");
        pips = Array.from({ length: count }, () => element("i", "cook-pip"));
        row.append(...pips);
        return row;
    }
    function build(session) {
        built = session.index;
        parts = {};
        const step = session.step;
        stepLabel.textContent = `Step ${session.index + 1} of ${session.kinds.length} · ${COOK_STEP_TITLES[step.kind]}`;
        hint.textContent = HINTS[step.kind];
        root.dataset.step = step.kind;
        if (step.kind === "chop") {
            stage.replaceChildren(bar("cook-bar--board"), pipRow(CHOP_CUTS));
        }
        else if (step.kind === "stir") {
            parts.arrow = element("div", "cook-arrow");
            const timer = element("div", "cook-timer");
            parts.timer = element("i", "");
            timer.append(parts.timer);
            stage.replaceChildren(parts.arrow, timer, pipRow(step.calls.length));
        }
        else if (step.kind === "simmer") {
            const gauge = bar("cook-bar--heat");
            const timer = element("div", "cook-timer");
            parts.timer = element("i", "");
            timer.append(parts.timer);
            stage.replaceChildren(gauge, timer);
            pips = [];
        }
        else {
            stage.replaceChildren(bar("cook-bar--bake"));
            pips = [];
        }
        // One pip per step of the recipe: what has been scored so far.
        steps.replaceChildren(...session.kinds.map((kind, index) => {
            const pip = element("span", "cook-step", COOK_STEP_TITLES[kind]);
            if (index < session.scores.length)
                pip.dataset.score = String(Math.round(session.scores[index] * 100));
            pip.classList.toggle("is-now", index === session.index);
            pip.classList.toggle("is-done", index < session.scores.length);
            return pip;
        }));
    }
    function render(session, now) {
        const step = session.step;
        if (!step)
            return;
        if (built !== session.index)
            build(session);
        if (step.kind === "chop") {
            parts.good.style.left = percent(step.zone - step.windows.good);
            parts.good.style.width = percent(step.windows.good * 2);
            parts.perfect.style.left = percent(step.zone - step.windows.perfect);
            parts.perfect.style.width = percent(step.windows.perfect * 2);
            parts.marker.style.left = percent(chopMarker(step, now));
            pips.forEach((pip, index) => { pip.dataset.state = index < step.cuts.length ? (step.cuts[index] >= 1 ? "perfect" : step.cuts[index] >= 0.6 ? "good" : "poor") : ""; });
        }
        else if (step.kind === "stir") {
            const call = stirCall(step);
            parts.arrow.textContent = call ? ARROWS[call] : "";
            parts.arrow.dataset.direction = call ?? "";
            parts.timer.style.width = percent(stirTimeLeft(step, now));
            pips.forEach((pip, index) => { pip.dataset.state = index < step.hits.length ? (step.hits[index] ? "good" : "poor") : ""; });
        }
        else if (step.kind === "simmer") {
            const band = simmerBand(step);
            parts.good.style.left = percent(band.centre - band.halfWidth * 2);
            parts.good.style.width = percent(band.halfWidth * 4);
            parts.perfect.style.left = percent(band.centre - band.halfWidth);
            parts.perfect.style.width = percent(band.halfWidth * 2);
            parts.marker.style.left = percent(step.heat);
            parts.timer.style.width = percent(1 - step.elapsed / SIMMER_SECONDS);
        }
        else {
            const window = step.halfWidth;
            parts.good.style.left = percent(0.7 - window * 1.35);
            parts.good.style.width = percent(window * 2.7);
            parts.perfect.style.left = percent(0.7 - window * 0.35);
            parts.perfect.style.width = percent(window * 0.7);
            parts.marker.style.left = percent(bakeDoneness(step, now) / BAKE_BURNT);
        }
    }
    function flash(event) {
        if (!event.quality)
            return;
        word.textContent = WORDS[event.quality] ?? "";
        word.dataset.quality = event.quality;
        if (wordTimer)
            clearTimeout(wordTimer);
        wordTimer = setTimeout(() => { word.textContent = ""; }, 800);
    }
    function show(text) {
        title.textContent = text;
        word.textContent = "";
        built = -1;
        root.classList.remove("is-result");
        root.hidden = false;
    }
    function result(done) {
        built = -1;
        root.classList.add("is-result");
        root.dataset.step = "";
        stepLabel.textContent = "Served";
        hint.textContent = done.note;
        title.textContent = done.title;
        const card = element("div", "cook-result");
        const portrait = element("span", "cook-result__dish");
        const image = document.createElement("img");
        image.alt = "";
        const put = (url) => { image.src = url; portrait.replaceChildren(image); };
        const ready = options.thumbnail?.(done.itemKey, put);
        if (ready)
            put(ready);
        const stars = element("strong", "cook-result__stars", "★".repeat(done.stars) + "☆".repeat(Math.max(0, 3 - done.stars)));
        card.append(portrait, stars);
        stage.replaceChildren(card);
        steps.replaceChildren();
        word.textContent = "";
    }
    return Object.freeze({
        show,
        render,
        flash,
        result,
        hide: () => { root.hidden = true; root.classList.remove("is-result"); },
        isOpen: () => !root.hidden,
    });
}
