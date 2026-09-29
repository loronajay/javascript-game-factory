// The notice board on the Hitching Green (planning-docs/FARM_RIDING_PLAN.md):
// every course with the rider's best on it, the cross-country line they ride
// (the Championship line opens at Riding 60), and the Riding perks — owned and
// to come. DOM only; the page hands in the bests, the level and what to do.
import { DOWNS_COURSES, formatRunTime } from "./downs-course.mjs";
import { RIDING_PERKS, ridingPerkEffects } from "./farm-riding-skill.mjs";
/** Whether a rider of `level` may ride a course (its perk). */
export function courseOpenTo(course, level) {
    const perks = ridingPerkEffects(level);
    return course.needs === "openRing" ? perks.openRing : course.needs === "championship" ? perks.championship : true;
}
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
const COURSE_WORDS = Object.freeze({
    gallop: "Flat out down the north strip. Save your wind for the last furlong.",
    novice: "Six fences at 80 cm in the near ring. Ride in through the gate to start.",
    open: "The same six at 1.3 m. Opens at Riding 10.",
    xc: "Twelve fences over the hills: logs, hedges, a ditch, a bank up, a drop down and the splash.",
    "xc-championship": "The same trail with every fence higher. Opens at Riding 60.",
    "oval-1": "One lap of the oval, clockwise from the finish post.",
    "oval-2": "Two laps — the race distance. Post a race at the race board to run it.",
});
export function createDownsBoard(elements, options) {
    const isOpen = () => !elements.root.hidden;
    function render() {
        const level = options.ridingLevel();
        const bests = options.bests();
        elements.rider.textContent = `Riding ${options.horse()} · ${options.ridingXp()}. Runs on a course earn Riding XP and train your horse once the server has ridden them again from your reins.`;
        elements.courses.replaceChildren(...DOWNS_COURSES.map((course) => {
            const row = element("li", "downs-course");
            const open = courseOpenTo(course, level);
            row.classList.toggle("is-locked", !open);
            const words = element("div", "");
            words.append(element("strong", "", course.title), element("small", "", `${COURSE_WORDS[course.id] ?? ""} · about ${course.metres} m`));
            const best = bests[course.id];
            row.append(words, element("span", "downs-course__best", best ? `${formatRunTime(best.ticks)}${best.faults ? ` · ${best.faults}F` : ""}` : open ? "—" : "Locked"));
            return row;
        }));
        const champion = ridingPerkEffects(level).championship;
        const standard = element("button", "farm-button", "Standard line");
        const hard = element("button", "farm-button", champion ? "Championship line" : "Championship · Riding 60");
        standard.type = hard.type = "button";
        standard.classList.toggle("is-active", !options.championship());
        hard.classList.toggle("is-active", options.championship());
        hard.disabled = !champion;
        standard.addEventListener("click", () => { options.setChampionship(false); render(); });
        hard.addEventListener("click", () => { options.setChampionship(true); render(); });
        elements.line.replaceChildren(standard, hard);
        elements.perks.replaceChildren(...RIDING_PERKS.map((perk) => {
            const row = element("li", perk.level <= level ? "is-owned" : "");
            row.append(element("b", "", `Lv ${perk.level}`), element("span", "", `${perk.title} — ${perk.description}`));
            return row;
        }));
    }
    function close() {
        if (!isOpen())
            return;
        elements.root.hidden = true;
        options.onClose?.();
    }
    elements.close.addEventListener("click", close);
    return Object.freeze({
        open() {
            render();
            elements.root.hidden = false;
        },
        close,
        isOpen,
    });
}
