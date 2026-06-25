import { getAvailableArts, getEffectiveStats, getUnitType, isDefending, isRaging } from "../core/unitCatalog.js";
import { canUseArt, getFootworkSteps } from "../rules/arts.js";

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function artTip(art) {
  return `${art.name} · ${art.mpCost} MP — ${art.description}`;
}

export function canMoveInActivation(activation) {
  return Boolean(activation && !activation.moved);
}

export function renderHeader(state, { turnTitle, turnSub, turnBanner }) {
  const color = state.currentPlayer === 1 ? "#5288c6" : "#c4463f";
  const available = state.units.filter((u) => u.player === state.currentPlayer && u.hp > 0 && !u.spent).length;
  turnBanner.style.setProperty("--team", color);
  turnTitle.style.setProperty("--team", color);
  turnTitle.textContent = state.phase === "complete" ? `Player ${state.winner} wins` : `Player ${state.currentPlayer} squad turn`;
  turnSub.textContent = state.phase === "complete" ? "Restart to play again" : `${available} piece${available === 1 ? "" : "s"} still available`;
}

export function renderUnitCard(unit, state, unitCard) {
  if (!unit) {
    unitCard.style.removeProperty("--team");
    unitCard.innerHTML = `<div class="unit-emblem">?</div><div><div class="unit-name">No piece selected</div><div class="unit-meta">Choose an unspent Player ${state.currentPlayer} unit.</div><div class="hpbar"><div class="hpfill" style="width:0%"></div></div></div>`;
    return;
  }
  const definition = getUnitType(unit.type);
  const stats = getEffectiveStats(unit, state);
  unitCard.style.setProperty("--team", unit.player === 1 ? "#5288c6" : "#c4463f");

  const pills = [
    { label: `${unit.hp}/${stats.maxHp} HP`, cls: "" },
    { label: `${unit.mp}/${stats.maxMp} MP`, cls: "mp" },
    { label: `Move ${stats.moveRange}`, cls: "" },
    { label: `Range ${stats.attackRange}`, cls: "" },
    definition.passive ? { label: definition.passive.name, cls: "passive", title: definition.passive.description } : null,
    isRaging(unit) ? { label: "RAGE", cls: "rage", title: definition.rageArt?.description } : null,
    isDefending(unit) ? { label: "Defending", cls: "on" } : null,
    unit.spent ? { label: "Spent", cls: "spent" } : null
  ].filter(Boolean)
    .map(({ label, cls, title }) => `<span class="stat-pill ${cls}"${title ? ` title="${escapeAttr(title)}"` : ""}>${label}</span>`).join("");

  const statusLine = (unit.statuses ?? []).length ? ` · ${unit.statuses.map((s) => s.type).join(", ")}` : "";
  const hpPct = unit.hp / stats.maxHp * 100;
  unitCard.innerHTML = `<div class="unit-emblem" title="${escapeAttr(definition.name)}">${definition.glyph}</div><div><div class="unit-name">Player ${unit.player} ${definition.name}${statusLine}</div><div class="unit-stats">${pills}</div><div class="hpbar"><div class="hpfill ${unit.hp <= stats.maxHp * 0.3 ? "low" : ""}" style="width:${hpPct}%"></div></div></div>`;
}

// Renders the action bar for the active unit. onActionClick(action) is called
// when a button is pressed; main.js provides this closure with dispatch/render.
export function renderActions(unit, state, mode, { actions, actionHelp }, { resolving, onActionClick }) {
  if (!unit || !state.activation || state.phase !== "playing") {
    actions.innerHTML = "";
    actionHelp.textContent = state.phase === "complete" ? "The duel is complete." : "Select an unspent piece.";
    return;
  }
  const activation = state.activation;
  const hasPrimary = activation.primaryUsed;
  const canMove = canMoveInActivation(activation);
  const stats = getEffectiveStats(unit, state);
  const footwork = getUnitType(unit.type).arts.find((art) => art.id === "footwork");
  const footworkBtn = footwork
    ? `<button class="${mode === "footwork" ? "is-active" : ""}" data-action="footwork" title="${escapeAttr(artTip(footwork))}" ${canUseArt(state, unit, footwork.id) ? "" : "disabled"}>Footwork<kbd class="key">A</kbd></button>`
    : "";
  const artBtns = getAvailableArts(unit)
    .filter((art) => art.kind === "active" && art.id !== "footwork" && art.implemented)
    .map((art) => `<button class="art-tile ${mode === `art:${art.id}` ? "is-active" : ""}" data-action="art:${art.id}" title="${escapeAttr(artTip(art))}" ${canUseArt(state, unit, art.id) ? "" : "disabled"}>${art.name}<kbd class="key">${art.mpCost}<span class="kbd-unit">MP</span></kbd></button>`)
    .join("");

  actions.innerHTML = [
    `<button class="${mode === "move" ? "is-active" : ""}" data-action="move" title="Move up to ${stats.moveRange} tiles before or after your primary action." ${canMove ? "" : "disabled"}>Move<kbd class="key">1</kbd></button>`,
    `<button class="${mode === "attack" ? "is-active" : ""}" data-action="attack" title="Strike an enemy within range ${stats.attackRange}." ${hasPrimary ? "disabled" : ""}>Attack<kbd class="key">2</kbd></button>`,
    `<button data-action="defend" title="Brace: halve incoming physical and magic damage until your next turn." ${hasPrimary ? "disabled" : ""}>Defend<kbd class="key">3</kbd></button>`,
    footworkBtn,
    artBtns,
    `<button data-action="finish" title="End this unit's activation." ${hasPrimary ? "" : "disabled"}>Finish<kbd class="key">F</kbd></button>`
  ].join("");

  actionHelp.textContent = activation.moved && !hasPrimary
    ? "Now attack or defend to end this unit's turn."
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

export function renderSquads(state, squadOverlays, onBeginUnit) {
  squadOverlays.replaceChildren();
  for (const player of [1, 2]) {
    const panel = document.createElement("section");
    panel.className = `panel squad-panel squad-overlay slot-${player}${player === state.currentPlayer && state.phase === "playing" ? " is-active" : ""}`;
    panel.style.setProperty("--team", player === 1 ? "#5288c6" : "#c4463f");
    panel.innerHTML = `<div class="panel-title">Player ${player}</div><div class="squad-list"></div>`;
    const list = panel.querySelector(".squad-list");

    for (const unit of state.units.filter((u) => u.player === player)) {
      const definition = getUnitType(unit.type);
      const stats = getEffectiveStats(unit, state);
      const chip = document.createElement("div");
      const selectable = unit.player === state.currentPlayer && !unit.spent && unit.hp > 0;
      chip.className = `squad-chip${unit.spent ? " spent" : ""}${isDefending(unit) ? " defending" : ""}${selectable ? " selectable" : ""}`;
      chip.innerHTML = `<span class="chip-icon">${definition.glyph}</span>${definition.name}<div class="chip-bar"><div class="chip-bar-fill" style="width:${unit.hp / stats.maxHp * 100}%"></div></div><div class="chip-hp">${unit.hp}/${stats.maxHp} HP</div>`;
      if (selectable) chip.addEventListener("click", () => onBeginUnit(unit));
      list.append(chip);
    }
    squadOverlays.append(panel);
  }
}
