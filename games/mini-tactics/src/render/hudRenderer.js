import {
  PLAYER_COLORS,
  UNIT_TYPES
} from "../config.js";
import {
  getSelectedUnit,
  livingUnits
} from "../state/gameState.js";

export class HudRenderer {
  constructor(elements) {
    this.elements = elements;
  }

  render(state) {
    this.renderTurn(state);
    this.renderSelectedUnit(state);
    this.renderSquad(state, 1, this.elements.p1Squad);
    this.renderSquad(state, 2, this.elements.p2Squad);
    this.renderActionButtons(state);
  }

  renderTurn(state) {
    if (state.winner) {
      this.elements.turnTitle.textContent = `Player ${state.winner} wins`;
      this.elements.turnSub.textContent = "Restart to play again";
      return;
    }

    const available = livingUnits(state, state.currentPlayer)
      .filter((unit) => !unit.spent)
      .length;

    this.elements.turnTitle.textContent =
      `Player ${state.currentPlayer} squad turn`;
    this.elements.turnSub.textContent =
      `${available} piece${available === 1 ? "" : "s"} still available`;
  }

  renderSelectedUnit(state) {
    const selected = getSelectedUnit(state);

    if (!selected) {
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
    const status = [
      `${selected.hp}/${selected.maxHp} HP`,
      selected.defending ? "Defending" : null,
      selected.spent ? "Spent" : "Ready",
      `Move ${definition.moveRange}`,
      `Range ${definition.attackRange}`
    ]
      .filter(Boolean)
      .join(" · ");

    this.elements.unitCard.innerHTML = `
      <div
        class="unit-emblem"
        style="box-shadow: inset 0 0 0 2px ${PLAYER_COLORS[selected.player]}55"
      >
        ${definition.icon}
      </div>
      <div>
        <div class="unit-name">
          Player ${selected.player} ${definition.name}
        </div>
        <div class="unit-meta">${status}</div>
        <div class="hpbar">
          <div
            class="hpfill"
            style="width:${selected.hp / selected.maxHp * 100}%"
          ></div>
        </div>
      </div>
    `;
  }

  renderSquad(state, player, container) {
    container.replaceChildren();

    for (const unit of state.units.filter((entry) => entry.player === player)) {
      const definition = UNIT_TYPES[unit.type];
      const chip = document.createElement("div");
      chip.className = "squad-chip";

      if (unit.spent) chip.classList.add("spent");
      if (unit.hp <= 0) chip.classList.add("dead");
      if (unit.defending) chip.classList.add("defending");

      chip.innerHTML = `
        <span class="chip-icon">${definition.icon}</span>
        ${definition.name}
        <div class="chip-hp">${Math.max(0, unit.hp)}/10 HP</div>
      `;

      container.appendChild(chip);
    }
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
        ? `Player ${state.winner} eliminated the opposing squad.`
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
