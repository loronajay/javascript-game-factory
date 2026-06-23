import { UNIT_TYPES } from "../config.js";
import {
  colorOf,
  getSelectedUnit,
  livingUnits,
  teamOf
} from "../state/gameState.js";
import { winnerLabel, teamColor } from "./labels.js";
import { hpClass } from "./hp.js";

export class HudRenderer {
  constructor(elements) {
    this.elements = elements;
  }

  render(state) {
    this.renderTurn(state);
    this.renderSelectedUnit(state);
    this.renderSquads(state);
    this.renderActionButtons(state);
  }

  renderTurn(state) {
    const { turnTitle, turnSub, turnBanner } = this.elements;

    if (state.winner) {
      const color = teamColor(state, state.winner);
      turnTitle.textContent = `${winnerLabel(state, state.winner)} wins`;
      turnSub.textContent = "Restart to play again";
      turnTitle.style.setProperty("--team", color);
      turnBanner.style.setProperty("--team", color);
      return;
    }

    const available = livingUnits(state, state.currentPlayer)
      .filter((unit) => !unit.spent)
      .length;
    const color = colorOf(state, state.currentPlayer);

    turnTitle.textContent = `Player ${state.currentPlayer} squad turn`;
    turnSub.textContent =
      `${available} piece${available === 1 ? "" : "s"} still available`;
    turnTitle.style.setProperty("--team", color);
    turnBanner.style.setProperty("--team", color);
  }

  renderSelectedUnit(state) {
    const selected = getSelectedUnit(state);

    if (!selected) {
      this.elements.unitCard.style.removeProperty("--team");
      this.elements.unitCard.innerHTML = `
        <div class="unit-emblem">?</div>
        <div>
          <div class="unit-name">No piece selected</div>
          <div class="unit-meta">
            Choose an unspent Player ${state.currentPlayer} unit.
          </div>
          <div class="hpbar">
            <div class="hpfill" style="width:0%"></div>
          </div>
        </div>
      `;
      return;
    }

    const definition = UNIT_TYPES[selected.type];

    // Status reads as discrete pills so the dossier looks like a unit readout
    // rather than a run-on caption.
    const pills = [
      { label: `${selected.hp}/${selected.maxHp} HP`, cls: "hp" },
      { label: `Move ${definition.moveRange}`, cls: "" },
      { label: `Range ${definition.attackRange}`, cls: "" },
      selected.defending ? { label: "Defending", cls: "on" } : null,
      selected.spent ? { label: "Spent", cls: "spent" } : null
    ]
      .filter(Boolean)
      .map((pill) => `<span class="stat-pill ${pill.cls}">${pill.label}</span>`)
      .join("");

    const color = colorOf(state, selected.player);
    this.elements.unitCard.style.setProperty("--team", color);
    this.elements.unitCard.innerHTML = `
      <div
        class="unit-emblem"
        style="box-shadow: inset 0 0 0 2px ${color}88"
      >
        ${definition.icon}
      </div>
      <div>
        <div class="unit-name">
          Player ${selected.player} ${definition.name}
        </div>
        <div class="unit-stats">${pills}</div>
        <div class="hpbar">
          <div
            class="hpfill ${hpClass(selected.hp, selected.maxHp)}"
            style="width:${selected.hp / selected.maxHp * 100}%"
          ></div>
        </div>
      </div>
    `;
  }

  // One floating roster panel per player, built from the live roster so 2-4
  // squads all render from the same path. Seat order maps to the four screen
  // corners (1 BL, 2 BR, 3 TL, 4 TR); color comes from the roster, not the slot.
  renderSquads(state) {
    const host = this.elements.squadOverlays;
    host.replaceChildren();

    const roster = state.players ?? [
      { id: 1, team: 1 },
      { id: 2, team: 2 },
    ];

    for (const slot of roster) {
      host.appendChild(this.buildSquadPanel(state, slot));
    }
  }

  buildSquadPanel(state, slot) {
    const panel = document.createElement("section");
    panel.className = `panel squad-panel squad-overlay slot-${slot.id}`;
    panel.style.setProperty("--team", colorOf(state, slot.id));
    if (slot.id === state.currentPlayer && !state.winner) {
      panel.classList.add("is-active");
    }

    const teamTag =
      state.format === "teams" ? ` · Team ${teamOf(state, slot.id)}` : "";

    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = `Player ${slot.id}${teamTag}`;
    panel.appendChild(title);

    const list = document.createElement("div");
    list.className = "squad-list";
    for (const unit of state.units.filter((u) => u.player === slot.id)) {
      list.appendChild(buildSquadChip(unit));
    }
    panel.appendChild(list);

    return panel;
  }

  renderActionButtons(state) {
    const selected = getSelectedUnit(state);
    const activation = state.activation;
    const usable = Boolean(
      selected &&
      !selected.spent &&
      selected.player === state.currentPlayer &&
      !state.winner &&
      !state.locked
    );

    const moved = Boolean(activation?.moved);
    const primaryUsed = Boolean(activation?.primaryUsed);

    this.elements.moveBtn.disabled = !usable || moved;
    this.elements.attackBtn.disabled = !usable || primaryUsed;
    this.elements.healBtn.disabled =
      !usable || primaryUsed || selected?.type !== "medic";
    this.elements.defendBtn.disabled = !usable || primaryUsed;
    // Cancel Move is only legal after an uncommitted move: the piece has moved
    // but has not yet attacked, healed, or defended.
    this.elements.cancelMoveBtn.disabled = !usable || !moved || primaryUsed;
    this.elements.finishBtn.disabled = !usable || !primaryUsed;

    for (const button of [
      this.elements.moveBtn,
      this.elements.attackBtn,
      this.elements.healBtn
    ]) {
      button.classList.remove("active");
    }

    if (state.mode === "move") this.elements.moveBtn.classList.add("active");
    if (state.mode === "attack") this.elements.attackBtn.classList.add("active");
    if (state.mode === "heal") this.elements.healBtn.classList.add("active");

    if (!usable) {
      this.elements.actionHelp.textContent = state.winner
        ? `${winnerLabel(state, state.winner)} is the last squad standing.`
        : "Select an unspent piece.";
    } else if (moved && !primaryUsed) {
      this.elements.actionHelp.textContent =
        "Movement is committed. This piece must attack, heal, or defend.";
    } else if (primaryUsed && !moved) {
      this.elements.actionHelp.textContent =
        "Primary action complete. Move now or finish the activation.";
    } else if (primaryUsed && moved) {
      this.elements.actionHelp.textContent = "Activation complete.";
    } else {
      this.elements.actionHelp.textContent =
        "Choose an action. Move cannot be the piece’s only action.";
    }
  }
}

function buildSquadChip(unit) {
  const definition = UNIT_TYPES[unit.type];
  const hp = Math.max(0, unit.hp);
  const chip = document.createElement("div");
  chip.className = "squad-chip";

  if (unit.spent) chip.classList.add("spent");
  if (unit.hp <= 0) chip.classList.add("dead");
  if (unit.defending) chip.classList.add("defending");

  chip.innerHTML = `
    <span class="chip-icon">${definition.icon}</span>
    ${definition.name}
    <div class="chip-bar">
      <div
        class="chip-bar-fill ${hpClass(hp, unit.maxHp)}"
        style="width:${hp / unit.maxHp * 100}%"
      ></div>
    </div>
    <div class="chip-hp">${hp}/${unit.maxHp} HP</div>
  `;

  return chip;
}
