import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";

export const STAT_GLOSSARY = [
  ["Blind", "Afflicted unit's next attack automatically misses. Duration set per ability."],
  ["Silence", "Afflicted unit cannot use ARTS. Duration set per ability."],
  ["Poison", "Damage when the afflicted unit's squad turn charges. Permanent until cleansed; amount set per ability."],
  ["Slow", "Reduces MOVE. Duration and amount set per ability."],
  ["Stun", "Afflicted unit is auto-spent at the start of its squad turn and cannot be selected. Duration set per ability."]
];

// ── Shared detail markup ─────────────────────────────────────────────────────

// Stat display model: each stat renders as a labeled cell (small-caps label, big
// numeral) with a meter underneath showing where the value sits relative to the
// strongest unit in the roster — so a new player reads "high HP, low DEF" at a
// glance instead of parsing six identical pills.
const STAT_CELLS = [
  { label: "HP", key: "maxHp", cls: "stat-hp" },
  { label: "MP", key: "maxMp", cls: "stat-mp" },
  { label: "STR", key: "strength", cls: "" },
  { label: "DEF", key: "defense", cls: "" },
  { label: "MOVE", key: "moveRange", cls: "" },
  { label: "RANGE", key: "attackRange", cls: "" }
];

// Roster-wide maxima per stat, so every meter shares one scale. Computed once —
// the catalog is frozen at module load.
const STAT_MAX = Object.fromEntries(STAT_CELLS.map(({ key }) => [
  key,
  Math.max(...Object.values(UNIT_TYPES).map((def) => def.stats[key] ?? 0), 1)
]));

export function statGridHtml(stats) {
  const cells = STAT_CELLS.map(({ label, key, cls }) => {
    const value = stats[key] ?? 0;
    const pct = Math.max(6, Math.round(value / STAT_MAX[key] * 100));
    return `<div class="stat-box ${cls}">
      <span class="stat-box-label">${label}</span>
      <b class="stat-box-value">${value}</b>
      <span class="stat-meter"><i style="width:${pct}%"></i></span>
    </div>`;
  }).join("");
  return `<div class="stat-grid">${cells}</div>`;
}

// Stat grid + passives + ARTS for one unit. Exported so the squad roster picker
// renders the exact same reference card players see in the in-match Codex.
export function unitDetailHtml(def) {
  const statGrid = statGridHtml(def.stats);

  const passiveEntries = [
    def.passive ? { tag: "Passive", ...def.passive } : null,
    ...def.arts.filter((a) => a.kind === "passive").map((a) => ({ tag: "Passive", ...a })),
    def.ragePassive ? { tag: "RAGE Passive", ...def.ragePassive } : null
  ].filter(Boolean);

  const passives = passiveEntries
    .map((p) => `<div class="ref-line"><span class="ref-tag passive">${p.tag}</span><b>${p.name}</b> — ${p.description}</div>`)
    .join("");

  const arts = [
    ...def.arts.filter((art) => art.kind === "active").map((art) => ({ tag: `ART · ${art.mpCost} MP`, ...art })),
    ...(def.rageArt?.kind === "active" ? [{ tag: `RAGE ART · ${def.rageArt.mpCost} MP`, ...def.rageArt }] : [])
  ]
    .map((art) => `<div class="ref-line"><span class="ref-tag art">${art.tag}</span><b>${art.name}</b> — ${art.description}</div>`)
    .join("");

  return `${statGrid}
    ${passives ? `<div class="ref-group"><div class="ref-group-title">Passives</div>${passives}</div>` : ""}
    ${arts ? `<div class="ref-group"><div class="ref-group-title">ARTS</div>${arts}</div>` : ""}`;
}

function statusDetailHtml() {
  const rows = STAT_GLOSSARY
    .map(([name, text]) => `<div class="ref-line"><span class="ref-tag status">${name}</span>${text}</div>`)
    .join("");
  return `<div class="ref-group"><div class="ref-group-title">Status Effects</div>${rows}</div>
    <div class="ref-note">Move and act in either order. An ART replaces the whole activation and spends MP. RAGE auto-triggers at 5 HP or lower.</div>`;
}

// ── Legacy string API — kept for tests and any static consumers ──────────────

// Build codex HTML for an explicit array of unit type definition objects.
export function buildCodexForTypes(unitTypeDefs) {
  const units = unitTypeDefs.map((def) =>
    `<section class="ref-unit">
      <h3><span class="ref-glyph">${def.glyph}</span>${def.name}</h3>
      ${unitDetailHtml(def)}
    </section>`
  ).join("");

  return `${units}<section class="ref-unit ref-status"><h3>Status Effects</h3>${statusDetailHtml()}</section>`;
}

// Convenience: build codex for every registered unit type.
export function buildCodex() {
  return buildCodexForTypes(Object.values(UNIT_TYPES));
}

// ── Interactive two-pane codex ───────────────────────────────────────────────

// Mount a unit-selection sidebar + detail pane into containerEl.
// Works for both the full roster (all UNIT_TYPES) and the in-battle subset.
export function mountCodex(containerEl, unitTypeDefs) {
  containerEl.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "codex-layout";

  const nav = document.createElement("nav");
  nav.className = "codex-nav";

  const detail = document.createElement("div");
  detail.className = "codex-detail";

  function activate(id) {
    for (const item of nav.querySelectorAll(".codex-nav-item")) {
      item.classList.toggle("is-active", item.dataset.unitId === id);
    }
  }

  function showUnit(def) {
    activate(def.id);
    const section = document.createElement("section");
    section.className = "ref-unit codex-unit-detail";
    // Hero band: the painted portrait beside the name, so the Codex reads as a
    // character card, not just a stat block. The portrait frames itself (see
    // portraits.js) so every unit lands at a consistent scale with no clipping.
    const hero = document.createElement("div");
    hero.className = "codex-detail-hero";
    hero.appendChild(createPortrait(def, { variant: "is-hero" }));
    const name = document.createElement("h3");
    name.innerHTML = `<span class="ref-glyph">${def.glyph}</span>${def.name}`;
    hero.appendChild(name);
    const body = document.createElement("div");
    body.innerHTML = unitDetailHtml(def);
    section.append(hero, body);
    detail.replaceChildren(section);
  }

  function showStatus() {
    activate("__status__");
    detail.innerHTML = `<section class="ref-unit codex-unit-detail">${statusDetailHtml()}</section>`;
  }

  // Build unit nav items.
  for (const def of unitTypeDefs) {
    const btn = document.createElement("button");
    btn.className = "codex-nav-item";
    btn.dataset.unitId = def.id;
    btn.type = "button";
    btn.appendChild(createPortrait(def, { variant: "is-thumb" }));
    const navName = document.createElement("span");
    navName.className = "codex-nav-name";
    navName.textContent = def.name;
    btn.appendChild(navName);
    btn.addEventListener("click", () => showUnit(def));
    nav.appendChild(btn);
  }

  // Status effects entry — always present regardless of unit subset.
  const statusBtn = document.createElement("button");
  statusBtn.className = "codex-nav-item codex-nav-status";
  statusBtn.dataset.unitId = "__status__";
  statusBtn.type = "button";
  statusBtn.innerHTML =
    `<span class="codex-nav-glyph">⚡</span>` +
    `<span class="codex-nav-name">Statuses</span>`;
  statusBtn.addEventListener("click", showStatus);
  nav.appendChild(statusBtn);

  layout.appendChild(nav);
  layout.appendChild(detail);
  containerEl.appendChild(layout);

  // Default: first unit.
  if (unitTypeDefs.length > 0) showUnit(unitTypeDefs[0]);
}
