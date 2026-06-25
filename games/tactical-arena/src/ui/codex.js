import { UNIT_TYPES } from "../core/unitCatalog.js";

export const STAT_GLOSSARY = [
  ["Blind", "Afflicted unit's next attack automatically misses. Lasts 1 turn."],
  ["Silence", "Afflicted unit cannot use ARTS. Lasts 1 turn."],
  ["Poison", "1 damage at the start of each activation. Permanent until cleansed."],
  ["Slow", "−1 MOVE. Lasts 3 of the affected unit's turns."]
];

// ── Private helpers ──────────────────────────────────────────────────────────

function unitDetailHtml(def) {
  const s = def.stats;
  const statPills = [
    `${s.maxHp} HP`, `${s.maxMp} MP`, `Move ${s.moveRange}`,
    `Range ${s.attackRange}`, `STR ${s.strength}`, `DEF ${s.defense}`
  ].map((label) => `<span class="ref-pill">${label}</span>`).join("");

  const passiveEntries = [
    def.passive ? { tag: "Passive", ...def.passive } : null,
    ...def.arts.filter((a) => a.kind === "passive").map((a) => ({ tag: "Passive", ...a })),
    def.rageArt ? { tag: "RAGE", ...def.rageArt } : null
  ].filter(Boolean);

  const passives = passiveEntries
    .map((p) => `<div class="ref-line"><span class="ref-tag passive">${p.tag}</span><b>${p.name}</b> — ${p.description}</div>`)
    .join("");

  const arts = def.arts
    .filter((art) => art.kind === "active")
    .map((art) => `<div class="ref-line"><span class="ref-tag art">ART · ${art.mpCost} MP</span><b>${art.name}</b> — ${art.description}</div>`)
    .join("");

  return `<div class="ref-pills">${statPills}</div>
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
    detail.innerHTML =
      `<section class="ref-unit codex-unit-detail">` +
      `<h3><span class="ref-glyph">${def.glyph}</span>${def.name}</h3>` +
      unitDetailHtml(def) +
      `</section>`;
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
    btn.innerHTML =
      `<span class="codex-nav-glyph">${def.glyph}</span>` +
      `<span class="codex-nav-name">${def.name}</span>`;
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
