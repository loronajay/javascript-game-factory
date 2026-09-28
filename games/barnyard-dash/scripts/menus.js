// Barnyard Dash's menu pieces: small DOM builders the composition root fills
// with state. Nothing here starts a race or talks to a server.

import { CPU_LEVELS, normalizeCpuLevel } from "../../pet-games/shared/sim/levels.js";
import { speciesStyle } from "../../pet-games/shared/pets.js";
import { COURSES } from "./sim/courses.js?v=20260928-pet-online";
import { CUPS, CUP_TROPHY_TIERS, POINTS_BY_PLACE } from "./grand-prix.js?v=20260928-pet-online";

export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

export function ordinal(value) {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

/** A Rookie / Pro / Champion segmented control. */
export function createLevelPicker(root, { initial = "pro", onChange } = {}) {
  let level = normalizeCpuLevel(initial);
  root.replaceChildren(...CPU_LEVELS.map((entry) => {
    const option = el("button", "segmented__option");
    option.type = "button";
    option.dataset.level = entry.id;
    option.setAttribute("role", "radio");
    option.append(el("b", "", entry.title), el("small", "", entry.blurb));
    option.addEventListener("click", () => picker.set(entry.id));
    return option;
  }));
  const picker = {
    set(next) {
      level = normalizeCpuLevel(next);
      for (const option of root.querySelectorAll("[data-level]")) option.setAttribute("aria-checked", String(option.dataset.level === level));
      onChange?.(level);
    },
    get value() { return level; },
  };
  picker.set(level);
  return picker;
}

export function fillCourseSelect(select, { includeRandom = true } = {}) {
  select.replaceChildren(
    ...(includeRandom ? [Object.assign(el("option", "", "Random course"), { value: "" })] : []),
    ...COURSES.map((course) => Object.assign(el("option", "", `${course.title} · ${course.laps} laps`), { value: course.id })),
  );
}

const TIER_TITLES = Object.freeze({ bronze: "Bronze", silver: "Silver", gold: "Gold" });

/** The cup cards, each showing which trophies this player already has and their best finishes. */
export function renderCupChoices(root, { selected, career, onSelect }) {
  root.replaceChildren(...CUPS.map((cup) => {
    const card = el("button", "cup-card");
    card.type = "button";
    card.dataset.cupId = cup.id;
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", String(cup.id === selected));
    card.append(el("b", "", cup.title), el("small", "", `${cup.courses.length} races · ${cup.blurb}`));
    const shelf = el("div", "cup-card__shelf");
    for (const [level, tier] of Object.entries(CUP_TROPHY_TIERS)) {
      const best = career?.cups?.[cup.id]?.[level]?.bestPlace ?? null;
      const trophy = el("span", `trophy-pip trophy-pip--${tier}${best === 1 ? " is-won" : ""}`, best ? (best === 1 ? "🏆" : ordinal(best)) : "·");
      trophy.title = best === 1 ? `${TIER_TITLES[tier]} trophy won` : best ? `Best ${ordinal(best)} at ${level}` : `${TIER_TITLES[tier]}: not yet won`;
      shelf.append(trophy);
    }
    card.append(shelf);
    card.addEventListener("click", () => onSelect?.(cup.id));
    return card;
  }));
}

function petDot(pet) {
  const style = speciesStyle(pet?.speciesId);
  const dot = el("i", "pet-dot");
  dot.style.color = style.color;
  dot.style.background = style.color;
  return dot;
}

/** The Grand Prix table, with each pet's points and the last race's gain. */
export function renderStandings(root, standings, lastRace = null) {
  const gained = new Map((lastRace?.placings ?? []).map((row) => [row.id, row.points]));
  root.replaceChildren(...standings.map((row) => {
    const item = el("li", row.player ? "is-player" : "");
    item.append(el("span", "standings__place", String(row.place)), petDot(row.pet), el("span", "standings__name", row.player ? `${row.pet.name} (you)` : row.pet.name));
    const plus = gained.get(row.id);
    item.append(el("span", "standings__gain", plus ? `+${plus}` : ""), el("strong", "standings__points", String(row.points)));
    return item;
  }));
}

/** 2nd, 1st, 3rd on their steps. */
export function renderPodium(root, standings) {
  const top = standings.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  root.replaceChildren(...order.map((row) => {
    const step = el("div", `podium__step podium__step--${row.place}${row.player ? " is-player" : ""}`);
    step.append(petDot(row.pet), el("b", "", row.player ? `${row.pet.name} (you)` : row.pet.name), el("small", "", `${row.points} pts`), el("span", "podium__block", ordinal(row.place)));
    return step;
  }));
}

export function pointsLine() {
  return `Points: ${POINTS_BY_PLACE.join(" · ")}`;
}
