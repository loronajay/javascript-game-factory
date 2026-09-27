// The skill lines under the seed HUD: Farming, Woodcutting and Cooking, each a label
// and a bar to its next level. Account farms only — a signed-out farm earns no
// skill XP. The numbers come from the pure farm-skills.mts; this file only
// writes them into the elements it is handed, and glows a line briefly when a
// level is reached while the page is open.

import { farmingProgress, skillLabel, type FarmSkills } from "./farm-skills.mjs";

export type SkillLineElements = Readonly<{ root: HTMLElement; label: HTMLElement; bar: HTMLElement }>;

type SkillName = "farming" | "woodcutting" | "cooking";

const TITLES: Readonly<Record<SkillName, string>> = Object.freeze({ farming: "Farming", woodcutting: "Woodcutting", cooking: "Cooking" });
const HOW: Readonly<Record<SkillName, string>> = Object.freeze({
  farming: "Harvests, fruit picks and Market orders earn Farming XP.",
  woodcutting: "Felling grown timber trees earns Woodcutting XP.",
  cooking: "Cooking dishes at a Kitchen Range and filling dish orders earn Cooking XP.",
});

export type FarmSkillsHud = Readonly<{ render: (skills: FarmSkills, enabled: boolean) => void }>;

export function createFarmSkillsHud(lines: Readonly<Record<SkillName, SkillLineElements>>): FarmSkillsHud {
  const shown: Record<SkillName, number> = { farming: 0, woodcutting: 0, cooking: 0 };

  function renderLine(name: SkillName, xp: number, enabled: boolean): void {
    const line = lines[name];
    // Woodcutting and Cooking stay out of the way until the first felling or dish.
    line.root.hidden = !enabled || (name !== "farming" && xp <= 0);
    if (line.root.hidden) return;
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
      renderLine("cooking", skills.cooking.xp, enabled);
    },
  });
}
