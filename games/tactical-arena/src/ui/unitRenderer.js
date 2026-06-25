import { svgElement } from "./svgHelpers.js";
import { gridToScreen } from "./isometric.js";
import { getEffectiveStats, isDefending } from "../core/unitCatalog.js";
import { positionKey } from "../rules/movement.js";
import { getUnitStatusVfx } from "./vfxCatalog.js";

// Add an entry here for each new unit type. The builder receives an empty <g
// class="icon"> and appends the SVG paths that form the figurine emblem.
const ICON_BUILDERS = new Map([
  ["swordsman", buildSwordsmanIcon],
  ["archer", buildArcherIcon],
  ["mystic", buildMysticIcon]
]);

function buildSwordsmanIcon(icon) {
  icon.append(
    svgElement("path", { d: "M -4 -16 L 4 -16 L 4 7 L 12 7 L 12 12 L 4 12 L 4 20 L -4 20 L -4 12 L -12 12 L -12 7 L -4 7 Z" }),
    svgElement("path", { d: "M -6 -17 L 0 -27 L 6 -17 Z" })
  );
}

function buildArcherIcon(icon) {
  icon.append(
    svgElement("path", { d: "M -17 15 Q 1 -1 -17 -18 L -12 -21 Q 11 -1 -12 19 Z" }),
    svgElement("line", { class: "emblem-line", x1: -15, y1: -19, x2: -15, y2: 17, "stroke-width": 2 }),
    svgElement("line", { class: "emblem-line", x1: -13, y1: -2, x2: 18, y2: -2, "stroke-width": 3 }),
    svgElement("path", { d: "M 18 -2 L 9 -7 L 9 3 Z" })
  );
}

function buildMysticIcon(icon) {
  icon.append(
    svgElement("circle", { cx: 0, cy: -8, r: 11 }),
    svgElement("path", { d: "M 0 -27 L 5 -13 L 20 -12 L 8 -3 L 12 12 L 0 4 L -12 12 L -8 -3 L -20 -12 L -5 -13 Z" }),
    svgElement("line", { class: "emblem-line", x1: 0, y1: 4, x2: 0, y2: 22, "stroke-width": 4, "stroke-linecap": "round" })
  );
}

export function createUnitIcon(type) {
  const icon = svgElement("g", { class: "icon" });
  ICON_BUILDERS.get(type)?.(icon);
  return icon;
}

function createStatusBadges(unit) {
  const visuals = getUnitStatusVfx(unit.statuses);
  if (!visuals.length) return null;
  const group = svgElement("g", { class: "status-stack", transform: `translate(${-((visuals.length - 1) * 12)} -48)` });
  visuals.forEach((visual, index) => {
    const badge = svgElement("g", {
      class: `status-badge status-${visual.type} status-ring-${visual.ring}`,
      transform: `translate(${index * 24} 0)`,
      style: `--status:${visual.color};--status-glow:${visual.glow};`
    });
    badge.append(
      svgElement("circle", { class: "status-halo", cx: 0, cy: 0, r: 12 }),
      svgElement("circle", { class: "status-core", cx: 0, cy: 0, r: 8 }),
      svgElement("text", { class: "status-label", x: 0, y: 3, "text-anchor": "middle" })
    );
    badge.querySelector(".status-label").textContent = visual.label;
    group.append(badge);
  });
  return group;
}

export function createUnitFigure(metrics, unit, { isTarget = false, selectedId = null, onUnitClick, state = null }) {
  const point = gridToScreen(metrics, unit.position.x, unit.position.y);
  const stats = getEffectiveStats(unit, state);
  const classes = ["unit", `player-${unit.player}`, "idle"];
  if (unit.spent) classes.push("spent");
  if (isDefending(unit)) classes.push("defending");
  if (unit.id === selectedId) classes.push("active");
  if (isTarget) classes.push("targetable");

  const token = svgElement("g", {
    class: classes.join(" "),
    "data-id": unit.id,
    "data-key": positionKey(unit.position),
    transform: `translate(${point.x} ${point.y + metrics.tileHeight * 0.45})`
  });

  const body = svgElement("g", { class: "body-group" });
  body.append(
    svgElement("ellipse", { class: "base-side", cx: 0, cy: 9, rx: 25, ry: 12 }),
    svgElement("ellipse", { class: "base-top", cx: 0, cy: 2, rx: 25, ry: 12 }),
    svgElement("ellipse", { class: "rim", cx: 0, cy: 2, rx: 20, ry: 9 }),
    svgElement("circle", { class: "shield-ring", cx: 0, cy: -2, r: 31 })
  );

  const emblem = svgElement("g", { class: "emblem", transform: "translate(0 -10) scale(.72)" });
  const face = createUnitIcon(unit.type);
  const shadow = face.cloneNode(true); shadow.setAttribute("class", "icon-shadow"); shadow.setAttribute("transform", "translate(1.4 1.9)");
  const highlight = face.cloneNode(true); highlight.setAttribute("class", "icon-highlight"); highlight.setAttribute("transform", "translate(-1.2 -1.5)");
  emblem.append(shadow, highlight, face);

  const hpBack = svgElement("rect", { class: "hp-back", x: -25, y: 27, width: 50, height: 5, rx: 2.5 });
  const hpFront = svgElement("rect", { class: "hp-front", x: -25, y: 27, width: 50 * unit.hp / stats.maxHp, height: 5, rx: 2.5 });

  const spentMark = svgElement("g", { class: "spent-mark", transform: "translate(18 -18)" });
  spentMark.append(
    svgElement("circle", { cx: 0, cy: 0, r: 8, fill: "rgba(0,0,0,.72)", stroke: "rgba(255,255,255,.5)" }),
    svgElement("path", { d: "M -4 0 L -1 3 L 5 -4", fill: "none", stroke: "#fff", "stroke-width": 2 })
  );

  const defendMark = svgElement("g", { class: "defend-mark", transform: "translate(-18 -18)" });
  defendMark.append(
    svgElement("circle", { cx: 0, cy: 0, r: 9, fill: "rgba(6,14,24,.88)", stroke: "var(--gold)", "stroke-width": 1.4 }),
    svgElement("path", { class: "defend-shield", d: "M 0 -6 L 5 -3.5 L 5 1 Q 5 5 0 7 Q -5 5 -5 1 L -5 -3.5 Z" })
  );

  body.append(emblem, hpBack, hpFront, spentMark, defendMark);
  const statusBadges = createStatusBadges(unit);
  if (statusBadges) body.append(statusBadges);

  if (isTarget) {
    const reticle = svgElement("g", { class: "target-mark" });
    reticle.append(
      svgElement("circle", { class: "target-ring", cx: 0, cy: -2, r: 30, fill: "none" }),
      svgElement("path", { class: "target-chevron", d: "M -7 -40 L 0 -32 L 7 -40" })
    );
    body.append(reticle);
  }

  token.append(svgElement("ellipse", { class: "shadow", cx: 0, cy: 18, rx: 25, ry: 8 }), body);
  token.addEventListener("click", (event) => { event.stopPropagation(); onUnitClick(unit.position); });
  return token;
}
