// Read-only Stats panel. It renders the pure view model from farm-stats.mts and
// owns only panel visibility; no stat can be edited or persisted from here.

import { buildFarmStats, type FarmSkillStats, type FishingStats } from "./farm-stats.mjs";
import type { FarmSkills } from "./farm-skills.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  summary: HTMLElement;
  grid: HTMLElement;
}>;

type Options = Readonly<{ beforeOpen?: () => void; onClose?: () => void }>;

export type FarmStatsPanel = Readonly<{
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  render: (skills: FarmSkills, fishing?: FishingStats | null) => void;
}>;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function statCard(row: FarmSkillStats): HTMLElement {
  const card = element("article", `farm-stat-card farm-stat-card--${row.id}`);
  card.dataset.skill = row.id;

  const head = element("header", "farm-stat-card__head");
  const heading = element("div", "farm-stat-card__heading");
  heading.append(element("span", "eyebrow", `LEVEL ${row.level}`), element("h3", "", row.title));
  head.append(heading, element("strong", "farm-stat-card__level", String(row.level)));

  const description = element("p", "farm-stat-card__description", row.description);
  const progress = element("div", "farm-stat-progress");
  const progressWords = element(
    "div", "farm-stat-progress__words",
    row.maxed
      ? `${row.xp.toLocaleString()} XP · Mastered`
      : `${row.xp.toLocaleString()} / ${row.nextLevelXp.toLocaleString()} XP · ${row.xpRemaining.toLocaleString()} to next level`,
  );
  const track = element("span", "farm-stat-progress__track");
  const fill = element("i", "farm-stat-progress__fill");
  fill.style.width = `${Math.round(row.fraction * 100)}%`;
  track.append(fill);
  progress.append(progressWords, track);

  const stats = element("dl", "farm-stat-totals");
  for (const line of row.stats) {
    const cell = element("div", "farm-stat-total");
    cell.append(element("dt", "", line.label), element("dd", "", line.value.toLocaleString()));
    stats.append(cell);
  }

  const details = element("details", "farm-stat-breakdown");
  details.append(element("summary", "", row.breakdownTitle));
  if (row.breakdown.length) {
    const list = element("ul", "farm-stat-breakdown__list");
    for (const line of row.breakdown) {
      const item = element("li", "");
      item.append(element("span", "", line.label), element("strong", "", line.value.toLocaleString()));
      list.append(item);
    }
    details.append(list);
  } else {
    details.append(element("p", "farm-stat-breakdown__empty", "Nothing recorded yet."));
  }

  card.append(head, description, progress, stats, details);
  return card;
}

export function createFarmStatsPanel(elements: Elements, options: Options = {}): FarmStatsPanel {
  function isOpen(): boolean { return !elements.root.hidden; }
  function close(): void {
    elements.root.hidden = true;
    elements.openButton.setAttribute("aria-pressed", "false");
    options.onClose?.();
  }
  function open(): void {
    options.beforeOpen?.();
    elements.root.hidden = false;
    elements.openButton.setAttribute("aria-pressed", "true");
    document.exitPointerLock?.();
  }
  function toggle(): void { isOpen() ? close() : open(); }
  function render(skills: FarmSkills, fishing?: FishingStats | null): void {
    const view = buildFarmStats(skills, { fishing });
    elements.summary.textContent = `Total level ${view.totalLevel} · ${view.totalXp.toLocaleString()} lifetime XP`;
    elements.grid.replaceChildren(...view.skills.map(statCard));
  }

  elements.openButton.addEventListener("click", toggle);
  elements.closeButton.addEventListener("click", close);
  close();
  return Object.freeze({ open, close, toggle, isOpen, render });
}
