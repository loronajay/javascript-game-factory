// The skill lines under the seed HUD: Farming and Woodcutting, each a label
// and a bar to its next level. Account farms only — a signed-out farm earns no
// skill XP. The numbers come from the pure farm-skills.mts; this file only
// writes them into the elements it is handed, and glows a line briefly when a
// level is reached while the page is open.
import { farmingProgress, skillLabel } from "./farm-skills.mjs";
const TITLES = Object.freeze({ farming: "Farming", woodcutting: "Woodcutting" });
const HOW = Object.freeze({
    farming: "Harvests, fruit picks and Market orders earn Farming XP.",
    woodcutting: "Felling grown timber trees earns Woodcutting XP.",
});
export function createFarmSkillsHud(lines) {
    const shown = { farming: 0, woodcutting: 0 };
    function renderLine(name, xp, enabled) {
        const line = lines[name];
        // Woodcutting stays out of the way until the first felling.
        line.root.hidden = !enabled || (name === "woodcutting" && xp <= 0);
        if (line.root.hidden)
            return;
        const progress = farmingProgress(xp);
        line.label.textContent = skillLabel(TITLES[name], xp);
        line.bar.style.width = `${Math.round(progress.fraction * 100)}%`;
        line.root.title = progress.maxed
            ? `${TITLES[name]} is mastered.`
            : `${(progress.nextLevelXp - progress.xp).toLocaleString()} XP to ${TITLES[name]} ${progress.level + 1}. ${HOW[name]}`;
        if (shown[name] && progress.level > shown[name]) {
            line.root.classList.add("is-levelled");
            setTimeout(() => line.root.classList.remove("is-levelled"), 2400);
        }
        shown[name] = progress.level;
    }
    return Object.freeze({
        render(skills, enabled) {
            renderLine("farming", skills.farming.xp, enabled);
            renderLine("woodcutting", skills.woodcutting.xp, enabled);
        },
    });
}
