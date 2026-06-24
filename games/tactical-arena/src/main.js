import { attack, beginActivation, defend, finishActivation, moveUnit, useArt } from "./core/commands.js";
import { getAvailableArts, getEffectiveStats, getUnitType, isRaging } from "./core/unitCatalog.js";
import { createBattleState, findUnit, unitAt } from "./core/state.js";
import { getFootworkStepOptions, getFootworkSteps } from "./rules/arts.js";
import { chebyshevDistance, getLegalMoves, positionKey } from "./rules/movement.js";
import { applyCommand } from "./core/reducer.js";

const board = document.querySelector("#board");
const unitCard = document.querySelector("#unit-card");
const actions = document.querySelector("#actions");
const turnReadout = document.querySelector("#turn-readout");
const message = document.querySelector("#message");

let state = createBattleState();
let selectedId = null;
let mode = null;
let footworkPath = [];

document.querySelector("#reset-button").addEventListener("click", () => {
  state = createBattleState();
  selectedId = null;
  mode = null;
  footworkPath = [];
  setMessage("Fresh duel. Player 1 opens the battle.");
  render();
});

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function dispatch(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) {
    setMessage(readableError(result.errorCode), true);
    return false;
  }
  state = result.nextState;
  if (!state.activation) {
    selectedId = null;
    mode = null;
    footworkPath = [];
  }
  return true;
}

function readableError(error) {
  return ({
    ART_NOT_AVAILABLE: "ARTS must be chosen before moving or attacking, with enough MP.",
    INVALID_ART_PATH: "Footwork must use its full unique orthogonal path and finish on empty ground.",
    MOVE_OUT_OF_RANGE: "That tile is not reachable this activation.",
    TARGET_OUT_OF_RANGE: "That target is beyond attack range.",
    PRIMARY_ALREADY_USED: "This unit has already taken its primary action.",
    FINISH_REQUIRES_ACTION: "Attack or defend before finishing this activation."
  })[error] ?? "That action is not legal right now.";
}

function selectedUnit() {
  return selectedId ? findUnit(state, selectedId) : null;
}

function beginUnit(unit) {
  if (unit.player !== state.currentPlayer || unit.spent || unit.hp <= 0) return;
  if (dispatch(beginActivation(unit.player, unit.id))) {
    selectedId = unit.id;
    mode = null;
    setMessage(`${getUnitType(unit.type).name} ready. Move, attack, defend, or commit an ART.`);
  }
}

function handleTile(position) {
  const unit = selectedUnit();
  if (!unit) {
    const clicked = unitAt(state, position);
    if (clicked) beginUnit(clicked);
    render();
    return;
  }

  if (mode === "move") {
    if (dispatch(moveUnit(state.currentPlayer, unit.id, position.x, position.y))) {
      mode = null;
      setMessage("Moved. Attack or defend to finish this unit's activation.");
    }
  } else if (mode === "attack") {
    const target = unitAt(state, position);
    if (target && dispatch(attack(state.currentPlayer, unit.id, target.id))) {
      mode = null;
      setMessage("Attack resolved. Finish this unit to end the activation.");
    }
  } else if (mode === "footwork") {
    const options = getFootworkStepOptions(state, unit, footworkPath);
    if (!options.has(positionKey(position))) {
      setMessage("Choose the next highlighted Footwork tile.", true);
    } else {
      footworkPath.push(position);
      const footworkSteps = getFootworkSteps(unit);
      if (footworkPath.length === footworkSteps) {
        if (dispatch(useArt(state.currentPlayer, unit.id, "footwork", footworkPath))) {
          setMessage("Footwork complete: the Swordsman spent 4 MP and their activation.");
        }
      } else {
        setMessage(`Footwork: choose step ${footworkPath.length + 1} of ${footworkSteps}. Enemy tiles may be crossed.`);
      }
    }
  } else {
    const clicked = unitAt(state, position);
    if (clicked?.id === unit.id) {
      setMessage("Choose an action below.");
    }
  }
  render();
}

function render() {
  const unit = selectedUnit();
  turnReadout.innerHTML = state.phase === "complete"
    ? `<strong>Player ${state.winner} wins</strong><br>Battle complete`
    : `<strong>Player ${state.currentPlayer}'s turn</strong><br>Round ${state.turnNumber}`;
  renderUnitCard(unit);
  renderActions(unit);
  renderBoard(unit);
}

function renderUnitCard(unit) {
  if (!unit) {
    unitCard.innerHTML = `<h2 class="unit-title">No unit selected</h2><p class="unit-owner">Choose an unspent unit belonging to the active player.</p>`;
    return;
  }
  const definition = getUnitType(unit.type);
  const stats = getEffectiveStats(unit);
  const artRows = getAvailableArts(unit).map((art) => {
    const rageClass = art.id === definition.rageArt.id ? "rage" : "";
    const label = Number.isFinite(art.mpCost) ? `${art.name} · ${art.mpCost} MP` : art.name;
    return `<li class="${rageClass}"><strong>${label}</strong>${art.implemented ? "" : " · not scoped"}</li>`;
  }).join("");
  unitCard.innerHTML = `
    <h2 class="unit-title">${definition.glyph} ${definition.name}</h2>
    <p class="unit-owner">Player ${unit.player}${unit.defending ? " · Defending" : ""}${isRaging(unit) ? " · RAGE" : ""}</p>
    <div class="stat-grid">
      <div class="stat"><b>MOVE</b><span>${stats.moveRange}</span></div>
      <div class="stat"><b>RANGE</b><span>${stats.attackRange}</span></div>
      <div class="stat"><b>STR</b><span>${stats.strength}</span></div>
      <div class="stat"><b>DEF</b><span>${stats.defense}</span></div>
    </div>
    <div class="meter"><span style="width:${(unit.hp / stats.maxHp) * 100}%"></span></div>
    <div class="meter-label"><span>HP</span><span>${unit.hp} / ${stats.maxHp}</span></div>
    <div class="meter mp"><span style="width:${(unit.mp / stats.maxMp) * 100}%"></span></div>
    <div class="meter-label"><span>MP</span><span>${unit.mp} / ${stats.maxMp}</span></div>
    <ul class="art-list"><li><strong>Passive:</strong> ${definition.passive.name}</li>${artRows}</ul>`;
}

function renderActions(unit) {
  if (!unit || !state.activation || state.phase !== "playing") {
    actions.innerHTML = "";
    return;
  }
  const activation = state.activation;
  const hasPrimary = activation.primaryUsed;
  const footwork = getUnitType(unit.type).arts[0];
  const effectiveStats = getEffectiveStats(unit);
  const footworkSteps = getFootworkSteps(unit);
  const disabledArt = activation.moved || hasPrimary || unit.mp < footwork.mpCost;
  actions.innerHTML = `
    <button class="action-button ${mode === "move" ? "is-active" : ""}" data-action="move" ${activation.moved || hasPrimary ? "disabled" : ""}>Move · ${effectiveStats.moveRange}</button>
    <button class="action-button ${mode === "attack" ? "is-active" : ""}" data-action="attack" ${hasPrimary ? "disabled" : ""}>Attack · ${effectiveStats.attackRange}</button>
    <button class="action-button" data-action="defend" ${hasPrimary ? "disabled" : ""}>Defend</button>
    <button class="action-button art ${mode === "footwork" ? "is-active" : ""}" data-action="footwork" ${disabledArt ? "disabled" : ""}>ART: Footwork · ${footwork.mpCost} MP · ${footworkSteps} tiles</button>
    <button class="action-button finish" data-action="finish" ${hasPrimary ? "" : "disabled"}>Finish activation</button>`;
  actions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "defend") {
      if (dispatch(defend(state.currentPlayer, unit.id))) setMessage("Defending: incoming physical and magic damage is halved until this unit activates again.");
      mode = null;
    } else if (action === "finish") {
      if (dispatch(finishActivation(state.currentPlayer, unit.id))) setMessage("Activation complete. The next commander takes the field.");
    } else {
      mode = mode === action ? null : action;
      footworkPath = [];
      setMessage(action === "footwork" ? `Footwork: choose step 1 of ${footworkSteps}. Cross enemies; finish on open ground.` : `Choose a highlighted ${action} tile.`);
    }
    render();
  }));
}

function renderBoard(unit) {
  let legal = new Set();
  if (unit && mode === "move") legal = getLegalMoves(state, unit);
  if (unit && mode === "attack") {
    for (const target of state.units) {
      if (target.hp > 0 && target.player !== unit.player && chebyshevDistance(unit.position, target.position) <= getEffectiveStats(unit).attackRange) {
        legal.add(positionKey(target.position));
      }
    }
  }
  if (unit && mode === "footwork") legal = getFootworkStepOptions(state, unit, footworkPath);
  const path = new Set(footworkPath.map(positionKey));
  board.innerHTML = "";
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const position = { x, y };
      const occupant = unitAt(state, position);
      const key = positionKey(position);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "tile";
      cell.dataset.coordinate = `${x + 1},${y + 1}`;
      cell.setAttribute("role", "gridcell");
      if (legal.has(key)) cell.classList.add(mode === "attack" ? "attack-target" : mode === "footwork" ? "art-target" : "move-target");
      if (occupant?.id === selectedId) cell.classList.add("selectable");
      if (path.has(key)) cell.classList.add("path");
      if (occupant) {
        const token = document.createElement("span");
        token.className = `unit-token player-${occupant.player}${occupant.id === selectedId ? " selected" : ""}${occupant.spent ? " spent" : ""}${isRaging(occupant) ? " raging" : ""}`;
        token.textContent = getUnitType(occupant.type).glyph;
        token.title = `Player ${occupant.player} ${getUnitType(occupant.type).name}: ${occupant.hp} HP, ${occupant.mp} MP`;
        cell.append(token);
      }
      cell.addEventListener("click", () => handleTile(position));
      board.append(cell);
    }
  }
}

render();
