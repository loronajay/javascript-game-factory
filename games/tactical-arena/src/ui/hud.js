import { getAvailableArts, getEffectiveStats, getRageEffectValue, getResourceMeta, getUnitType, isCommandOnly, isDefending, isRaging } from "../core/unitCatalog.js";
import { canUseArt } from "../rules/arts.js";
import { isStunned } from "../rules/statuses.js";
import { getPortrait, portraitFrameStyle } from "./portraits.js";
import { colorOf } from "../core/state.js";
import { teamLabel, teamOf } from "../match/matchBuilder.js";
import { TEMPO_GAUGE_MAX, canBeginTempoActivation, getTempoReadiness, getUnitAgility, isTempoBattle, isTempoUnitReady } from "../core/tempoBattle.js";

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function displayName(unit, definition) {
  return unit.nickname || definition.name;
}

// The cost an ART shows on its tile/tooltip. Most spend MP; an HP-cost ART (Blacksword's
// Dark Rush/Ether/Tick) reads "N HP", and an all-HP ultimate (Banish) carries its own
// `costLabel`. Returned split so the button can style the unit suffix.
function artCostParts(art, unitOrDefinition = null) {
  if (art.costLabel) {
    const [main, ...rest] = String(art.costLabel).split(" ");
    return { main, unit: rest.join(" ") };
  }
  if (art.hpCost) return { main: String(art.hpCost), unit: "HP" };
  const resource = unitOrDefinition ? getResourceMeta(unitOrDefinition.type ?? unitOrDefinition) : getResourceMeta(null);
  return { main: String(art.mpCost), unit: resource.shortLabel };
}

function artTip(art, unitOrDefinition = null) {
  const cost = artCostParts(art, unitOrDefinition);
  return `${art.name} · ${cost.main}${cost.unit ? ` ${cost.unit}` : ""} — ${art.description}`;
}

function toggleClass(element, className, enabled) {
  if (element.classList?.toggle) {
    element.classList.toggle(className, enabled);
    return;
  }
  const classes = new Set(String(element.className ?? "").split(/\s+/).filter(Boolean));
  if (enabled) classes.add(className);
  else classes.delete(className);
  element.className = [...classes].join(" ");
}

export function canMoveInActivation(activation) {
  return Boolean(activation && !activation.moved);
}

export function canCancelMoveInActivation(activation, unit) {
  if (!activation?.moved || activation.primaryUsed || !unit) return false;
  const trampleDamage = Math.max(0, Number(getRageEffectValue(unit, "trampleDamage", 0)) || 0);
  return trampleDamage <= 0;
}

export function renderHeader(state, { turnTitle, turnSub, turnBanner }) {
  if (isTempoBattle(state)) {
    const ready = state.units.filter((u) => u.hp > 0 && isTempoUnitReady(state, u)).length;
    const active = state.activation?.unitId ? state.units.find((u) => u.id === state.activation.unitId) : null;
    const color = active ? colorOf(state, active.player) : "#d8a33f";
    turnBanner.style.setProperty("--team", color);
    turnTitle.style.setProperty("--team", color);
    turnTitle.textContent = state.phase === "complete"
      ? `${teamLabel(state, state.winner)} wins`
      : "Tempo Battle";
    turnSub.textContent = state.phase === "complete" ? "Restart to play again" : `${ready} unit${ready === 1 ? "" : "s"} ready`;
    return;
  }
  const color = colorOf(state, state.currentPlayer);
  const available = state.units.filter((u) => u.player === state.currentPlayer && u.hp > 0 && !u.spent && !isStunned(u)).length;
  turnBanner.style.setProperty("--team", color);
  turnTitle.style.setProperty("--team", color);
  turnTitle.textContent = state.phase === "complete"
    ? `${teamLabel(state, state.winner)} wins`
    : `Player ${state.currentPlayer} squad turn`;
  turnSub.textContent = state.phase === "complete" ? "Restart to play again" : `${available} piece${available === 1 ? "" : "s"} still available`;
}

// HUD portrait as an HTML string (renderUnitCard builds the card via innerHTML).
// Mirrors createPortrait (portraits.js) but eager-loads — the HUD card swaps on
// every selection and a lazy image pops in late.
function portraitHtml(type, variant = "is-hud", skin = null) {
  const meta = getPortrait(type, skin);
  const definition = getUnitType(type);
  if (!meta) return `<figure class="unit-portrait ${variant} is-glyph-fallback">${definition.glyph}</figure>`;
  const style = portraitFrameStyle(meta);
  return `<figure class="unit-portrait ${variant}" data-type="${escapeAttr(type)}"${meta.skinSlug ? ` data-skin="${escapeAttr(meta.skinSlug)}"` : ""}>
    <img class="unit-portrait-img" src="${meta.src}" alt="" style="height:${style.cssHeight};transform:${style.cssTransform}">
  </figure>`;
}

// State tags — RAGE / Defending / Spent / passive / statuses — shared by the
// active-unit card and the squad HUD rows. The squad rows drop the passive and
// spent tags (row styling already carries spent) to stay compact.
function unitTagsHtml(unit, definition, { includePassive = true, includeSpent = true, spentLabel = "Spent" } = {}) {
  const stance = unit.stance ? definition.stances?.[unit.stance] : null;
  return [
    includePassive && definition.passive ? { label: definition.passive.name, cls: "passive", title: definition.passive.description } : null,
    stance ? { label: stance.name, cls: `stance stance-${unit.stance}`, title: definition.passive?.description } : null,
    isRaging(unit) ? { label: "RAGE", cls: "rage", title: definition.rageArt?.description ?? definition.ragePassive?.description } : null,
    isDefending(unit) ? { label: "Defending", cls: "on" } : null,
    includeSpent && unit.spent ? { label: spentLabel, cls: "spent" } : null,
    ...(unit.statuses ?? []).map((s) => ({ label: s.type, cls: `status status-${s.type}` }))
  ].filter(Boolean)
    .map(({ label, cls, title }) => `<span class="unit-tag ${cls}"${title ? ` title="${escapeAttr(title)}"` : ""}>${label}</span>`).join("");
}

// One labeled vital bar (HP green / MP blue) with the numbers ON the bar, so
// current totals track without reading pills.
function vitalHtml(kind, label, current, max, { low = false } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, current / max * 100)) : 0;
  return `<div class="vital vital-${kind}${low ? " is-low" : ""}">
    <span class="vital-label">${label}</span>
    <span class="vital-track"><span class="vital-fill" style="width:${pct}%"></span></span>
    <span class="vital-num">${current}<i>/${max}</i></span>
  </div>`;
}

// The four combat stats as labeled cells. Effective values that differ from the
// unit's base (auras, statuses, RAGE, statModifiers) tint up/down so a buffed or
// slowed stat is visible at the moment it matters.
function statLineHtml(definition, stats) {
  const cells = [
    ["STR", stats.strength, definition.stats.strength],
    ["DEF", stats.defense, definition.stats.defense],
    ["MOV", stats.moveRange, definition.stats.moveRange],
    ["RNG", stats.attackRange, definition.stats.attackRange]
  ].map(([label, value, base]) => {
    const cls = value > base ? " buffed" : value < base ? " debuffed" : "";
    const title = cls ? ` title="Base ${label} ${base}"` : "";
    return `<span class="stat-cell"${title}><i>${label}</i><b class="stat-cell-value${cls}">${value}</b></span>`;
  }).join("");
  return `<div class="unit-statline">${cells}</div>`;
}

function tempoGaugeHtml(state, unit) {
  if (!isTempoBattle(state)) return "";
  const pct = Math.round((getTempoReadiness(state, unit.id) / TEMPO_GAUGE_MAX) * 100);
  const clamped = Math.max(0, Math.min(100, pct));
  const ready = clamped >= 100;
  return `<div class="vital vital-tempo${ready ? " is-ready" : ""}" data-tempo-unit="${escapeAttr(unit.id)}">
    <span class="vital-label">AGI ${getUnitAgility(unit)}</span>
    <span class="vital-track"><span class="vital-fill" style="width:${clamped}%"></span></span>
    <span class="vital-num">${ready ? "READY" : `${clamped}%`}</span>
  </div>`;
}

export function renderUnitCard(unit, state, unitCard) {
  if (!unit) {
    toggleClass(unitCard, "is-raging", false);
    unitCard.style.removeProperty("--team");
    unitCard.innerHTML = `<figure class="unit-portrait is-hud is-glyph-fallback is-empty">?</figure>
      <div class="unit-info">
        <div class="unit-title-row"><span class="unit-name is-muted">No piece selected</span></div>
        <div class="unit-meta">${isTempoBattle(state) ? "Choose a ready unit." : `Choose an unspent Player ${state.currentPlayer} unit.`}</div>
        <div class="vitals">${vitalHtml("hp", "HP", 0, 0)}${vitalHtml("mp", "MP", 0, 0)}</div>
      </div>`;
    return;
  }
  const definition = getUnitType(unit.type);
  const resource = getResourceMeta(definition);
  const stats = getEffectiveStats(unit, state);
  const raging = isRaging(unit);
  unitCard.style.setProperty("--team", colorOf(state, unit.player));
  toggleClass(unitCard, "is-raging", raging);

  const tags = unitTagsHtml(unit, definition);

  unitCard.innerHTML = `${portraitHtml(unit.type, "is-hud", unit.skin)}
    <div class="unit-info">
      <div class="unit-title-row">
        <span class="unit-name">${escapeHtml(displayName(unit, definition))}</span>
        <span class="unit-owner">P${unit.player}</span>
        <span class="unit-tags">${tags}</span>
      </div>
      <div class="vitals">
        ${vitalHtml("hp", "HP", unit.hp, stats.maxHp, { low: unit.hp <= stats.maxHp * 0.3 })}
        ${vitalHtml("mp", resource.shortLabel, unit.mp, stats.maxMp)}
        ${tempoGaugeHtml(state, unit)}
      </div>
      ${statLineHtml(definition, stats)}
    </div>`;
}

// Renders the action bar for the active unit. onActionClick(action) is called
// when a button is pressed; main.js provides this closure with dispatch/render.
export function renderActions(
  unit,
  state,
  mode,
  { actions, actionHelp },
  { resolving, controlsEnabled = true, lockedMessage = "Wait for your turn.", onActionClick }
) {
  if (state.phase !== "playing") {
    actions.innerHTML = "";
    actionHelp.textContent = state.phase === "complete" ? "The duel is complete." : "Select an unspent piece.";
    return;
  }
  if (!controlsEnabled) {
    actions.innerHTML = "";
    actionHelp.textContent = lockedMessage;
    return;
  }
  if (!unit || !state.activation) {
    actions.innerHTML = "";
    actionHelp.textContent = "Select an unspent piece.";
    return;
  }
  const activation = state.activation;
  // The King only commands: no move/attack/defend/finish, just his four global commands.
  // A command spends his whole activation, so there is nothing else to offer.
  if (isCommandOnly(unit)) {
    actions.innerHTML = getAvailableArts(unit)
      .filter((art) => art.kind === "active" && art.implemented)
      .map((art) => `<button class="art-tile command-tile ${mode === `art:${art.id}` ? "is-active" : ""}" data-action="art:${art.id}" title="${escapeAttr(artTip(art, unit))}" ${canUseArt(state, unit, art.id) ? "" : "disabled"}>${art.name}</button>`)
      .join("");
    actionHelp.textContent = "Issue a command — it rallies your whole squad for this turn.";
    actions.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => { if (!resolving) onActionClick(button.dataset.action); });
    });
    return;
  }
  const hasPrimary = activation.primaryUsed;
  const canMove = canMoveInActivation(activation);
  const canCancelMove = canCancelMoveInActivation(activation, unit);
  const stats = getEffectiveStats(unit, state);
  const footwork = getUnitType(unit.type).arts.find((art) => art.id === "footwork");
  const footworkBtn = footwork
    ? `<button class="${mode === "footwork" ? "is-active" : ""}" data-action="footwork" title="${escapeAttr(artTip(footwork, unit))}" ${canUseArt(state, unit, footwork.id) ? "" : "disabled"}>Footwork<kbd class="key">A</kbd></button>`
    : "";
  const artBtns = getAvailableArts(unit)
    .filter((art) => art.kind === "active" && art.id !== "footwork" && art.implemented)
    .map((art) => {
      const cost = artCostParts(art, unit);
      return `<button class="art-tile ${mode === `art:${art.id}` ? "is-active" : ""}" data-action="art:${art.id}" title="${escapeAttr(artTip(art, unit))}" ${canUseArt(state, unit, art.id) ? "" : "disabled"}>${art.name}<kbd class="key">${cost.main}<span class="kbd-unit">${cost.unit}</span></kbd></button>`;
    })
    .join("");

  actions.innerHTML = [
    `<button class="${mode === "move" ? "is-active" : ""}" data-action="move" title="Move up to ${stats.moveRange} tiles before or after your primary action." ${canMove ? "" : "disabled"}>Move<kbd class="key">1</kbd></button>`,
    `<button data-action="cancel-move" title="Return this unit to its activation origin before taking a primary action." ${canCancelMove ? "" : "disabled"}>Cancel Move<kbd class="key">C</kbd></button>`,
    `<button class="${mode === "attack" ? "is-active" : ""}" data-action="attack" title="Strike an enemy within range ${stats.attackRange}." ${hasPrimary ? "disabled" : ""}>Attack<kbd class="key">2</kbd></button>`,
    `<button data-action="defend" title="Brace: halve incoming physical and magic damage until your next turn." ${hasPrimary ? "disabled" : ""}>Defend<kbd class="key">3</kbd></button>`,
    footworkBtn,
    artBtns,
    `<button data-action="finish" title="End this unit's activation." ${hasPrimary ? "" : "disabled"}>Finish<kbd class="key">F</kbd></button>`
  ].join("");

  actionHelp.textContent = activation.moved && !hasPrimary
    ? (canCancelMove ? "Now attack, defend, or cancel the move." : "Trample movement is committed. Now attack or defend.")
    : hasPrimary && !activation.moved
      ? "Now move or finish this unit's turn."
      : `Move up to ${stats.moveRange} tiles before or after your primary action.`;

  actions.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (resolving) return;
      onActionClick(button.dataset.action);
    });
  });
}

export function renderSquads(state, squadOverlays, onBeginUnit, { controlsEnabled = true, tempoCanSelect = null } = {}) {
  squadOverlays.replaceChildren();
  for (const player of state.turnOrder ?? [1, 2]) {
    const panel = document.createElement("section");
    panel.className = `panel squad-panel squad-overlay slot-${player}${player === state.currentPlayer && state.phase === "playing" ? " is-active" : ""}`;
    panel.style.setProperty("--team", colorOf(state, player));
    const teamTag = state.format === "teams" ? ` · ${teamLabel(state, teamOf(state, player))}` : "";
    panel.innerHTML = `<div class="panel-title">Player ${player}${teamTag}</div><div class="squad-list"></div>`;
    const list = panel.querySelector(".squad-list");

    for (const unit of state.units.filter((u) => u.player === player && !u.introHidden && !u.ghost)) {
      const definition = getUnitType(unit.type);
      const resource = getResourceMeta(definition);
      if (definition.summon) continue;
      const stats = getEffectiveStats(unit, state);
      const row = document.createElement("div");
      const dead = unit.hp <= 0;
      const active = state.activation?.unitId === unit.id;
      const tempoReady = isTempoBattle(state) && isTempoUnitReady(state, unit);
      const selectable = controlsEnabled && !dead && !isStunned(unit) && (
        isTempoBattle(state)
          // Tempo: readiness-only so a ready unit stays clickable even while the CPU holds
          // the single activation slot (the click preempts it). Falls back to the strict
          // slot-aware check when no predicate is supplied (e.g. tests).
          ? (tempoCanSelect ? tempoCanSelect(unit) : canBeginTempoActivation(state, unit))
          : unit.player === state.currentPlayer && !unit.spent
      );
      row.className = `squad-unit${dead ? " is-dead" : unit.spent ? " spent" : ""}${isDefending(unit) ? " defending" : ""}${isRaging(unit) ? " is-raging" : ""}${active ? " is-current" : ""}${selectable ? " selectable" : ""}`;
      const tags = dead
        ? `<span class="unit-tag spent">Fallen</span>`
        : unitTagsHtml(unit, definition, { includePassive: false, includeSpent: true, spentLabel: "Done" });
      row.innerHTML = `${portraitHtml(unit.type, "is-squad", unit.skin)}
        <div class="squad-unit-body">
          <div class="squad-unit-head">
            <span class="squad-unit-name">${escapeHtml(displayName(unit, definition))}</span>
            <span class="unit-tags">${tags}</span>
          </div>
          <div class="vitals">
            ${vitalHtml("hp", "HP", Math.max(0, unit.hp), stats.maxHp, { low: !dead && unit.hp <= stats.maxHp * 0.3 })}
            ${vitalHtml("mp", resource.shortLabel, unit.mp, stats.maxMp)}
            ${tempoGaugeHtml(state, unit)}
          </div>
          ${statLineHtml(definition, stats)}
        </div>`;
      if (selectable) row.addEventListener("click", () => onBeginUnit(unit));
      list.append(row);
    }
    squadOverlays.append(panel);
  }
}
