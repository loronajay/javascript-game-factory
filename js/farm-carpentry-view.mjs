// The carpentry games on screen: the same small panel the kitchen uses (its
// classes, so the bench and the stove read as one family), showing the step
// being played and how it is going while the Workbench shows the board.
//
//   measure  the board's bar, the mark (good band, perfect core), the pencil, three pips
//   saw      the call (PUSH ← A / PULL D →), a beat bar filling toward the stroke, eight pips
//   nail     the hammer's height with the band to let go in, three pips
//
// The maths is the pure farm-carpentry.mts; this file only moves DOM to match
// a session it is handed, and is rebuilt only when the step changes.
import { MEASURE_MARKS, NAIL_COUNT, SAW_STROKES, measurePencil, sawNext, } from "./farm-carpentry.mjs";
import { CRAFT_STEP_TITLES } from "./farm-catalog/carpentry.mjs";
const HINTS = Object.freeze({
    measure: "Press E as the pencil crosses the mark",
    saw: "A to push, D to pull · on the beat",
    nail: "Hold E to raise the hammer · let go in the band",
});
const WORDS = Object.freeze({
    mark: Object.freeze({ perfect: "Spot on!", good: "Near enough", poor: "Off the mark" }),
    stroke: Object.freeze({ perfect: "Clean stroke", good: "Good stroke", poor: "Ragged", miss: "Blade bound!" }),
    nail: Object.freeze({ perfect: "Flush!", good: "Driven", poor: "Bent it!" }),
});
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
const percent = (value) => `${(Math.min(1, Math.max(0, value)) * 100).toFixed(2)}%`;
const pipState = (score) => (score >= 1 ? "perfect" : score >= 0.6 ? "good" : "poor");
export function createCraftingHud(root, options = {}) {
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
        stepLabel.textContent = `Step ${session.index + 1} of ${session.kinds.length} · ${CRAFT_STEP_TITLES[step.kind]}`;
        hint.textContent = HINTS[step.kind];
        root.dataset.step = step.kind;
        if (step.kind === "measure") {
            stage.replaceChildren(bar("cook-bar--board craft-bar--ruler"), pipRow(MEASURE_MARKS));
        }
        else if (step.kind === "saw") {
            parts.arrow = element("div", "cook-arrow craft-call");
            const beat = bar("craft-bar--beat");
            stage.replaceChildren(parts.arrow, beat, pipRow(SAW_STROKES));
        }
        else {
            stage.replaceChildren(bar("craft-bar--hammer"), pipRow(NAIL_COUNT));
        }
        steps.replaceChildren(...session.kinds.map((kind, index) => {
            const pip = element("span", "cook-step", CRAFT_STEP_TITLES[kind]);
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
        if (step.kind === "measure") {
            parts.good.style.left = percent(step.mark - step.windows.good);
            parts.good.style.width = percent(step.windows.good * 2);
            parts.perfect.style.left = percent(step.mark - step.windows.perfect);
            parts.perfect.style.width = percent(step.windows.perfect * 2);
            parts.marker.style.left = percent(measurePencil(step, now));
            pips.forEach((pip, index) => { pip.dataset.state = index < step.marks.length ? pipState(step.marks[index]) : ""; });
        }
        else if (step.kind === "saw") {
            const next = sawNext(step);
            parts.arrow.textContent = next ? (next.direction === "push" ? "← PUSH · A" : "PULL · D →") : "";
            parts.arrow.dataset.direction = next?.direction ?? "";
            // The beat bar fills toward the stroke; the bands at its right end are when to answer it.
            const span = step.beat;
            const scale = (seconds) => seconds / (span * 1.5);
            parts.good.style.left = percent(1 - scale(step.windows.good) * 2);
            parts.good.style.width = percent(scale(step.windows.good) * 2);
            parts.perfect.style.left = percent(1 - scale(step.windows.good) - scale(step.windows.perfect));
            parts.perfect.style.width = percent(scale(step.windows.perfect) * 2);
            const toBeat = next ? next.at - now : span;
            parts.marker.style.left = percent(1 - scale(step.windows.good) - scale(Math.max(-step.windows.good, toBeat)));
            pips.forEach((pip, index) => { pip.dataset.state = index < step.strokes.length ? pipState(step.strokes[index]) : ""; });
        }
        else {
            parts.good.style.left = percent(step.target - step.halfWidth * 2);
            parts.good.style.width = percent(step.halfWidth * 4);
            parts.perfect.style.left = percent(step.target - step.halfWidth);
            parts.perfect.style.width = percent(step.halfWidth * 2);
            parts.marker.style.left = percent(step.power);
            pips.forEach((pip, index) => { pip.dataset.state = index < step.nails.length ? pipState(step.nails[index]) : ""; });
        }
    }
    function flash(event) {
        if (!event.quality || event.kind === "step" || event.kind === "done" || event.kind === "none")
            return;
        word.textContent = WORDS[event.kind]?.[event.quality] ?? "";
        word.dataset.quality = event.quality === "miss" ? "poor" : event.quality;
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
        stepLabel.textContent = "Finished";
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
