import { attack, beginActivation, defend, finishActivation, moveUnit, useArt } from "./core/commands.js";
import { UNIT_TYPES, getAvailableArts, getEffectiveStats, getUnitType, isRaging } from "./core/unitCatalog.js";
import { areEnemies, createBattleState, findUnit, unitAt } from "./core/state.js";
import { canUseArt, getFootworkStepOptions, getFootworkSteps, getVolleyShotAimOptions, getVolleyShotCells } from "./rules/arts.js";
import { isBlinded, resolvePhysicalStrike } from "./rules/combat.js";
import { chebyshevDistance, getLegalMoves, isOnBoard, positionKey } from "./rules/movement.js";
import { applyCommand } from "./core/reducer.js";
import { createBoardMetrics, createBoardViewBox, gridToScreen, pointsToString } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { AudioManager } from "./audio/sounds.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const board = document.querySelector("#boardSvg");
const boardLayer = document.querySelector("#boardLayer");
const unitsLayer = document.querySelector("#unitsLayer");
const forecastLayer = document.querySelector("#forecastLayer");
const effectsLayer = document.querySelector("#effectsLayer");
const diceOverlay = document.querySelector("#diceOverlay");
const dieFace = document.querySelector("#dieFace");
const unitCard = document.querySelector("#unitCard");
const actions = document.querySelector("#actions");
const turnTitle = document.querySelector("#turnTitle");
const turnSub = document.querySelector("#turnSub");
const turnBanner = document.querySelector("#turnBanner");
const actionHelp = document.querySelector("#actionHelp");
const squadOverlays = document.querySelector("#squadOverlays");
const message = document.querySelector("#message");

let state = createBattleState();
let selectedId = null;
let mode = null;
let footworkPath = [];
let volleyShotOrigin = null;

// Presentation-only audio. Like Mini-Tactics, sounds never gate or depend on the
// rules — every play is best-effort and silent on failure. Defaults to muted-off
// until the player's first gesture, which both unlocks browser audio and (unless
// muted) starts the looping battle theme.
const audio = new AudioManager({ enabled: true, masterVolume: 1, volume: 0.85, musicVolume: 0.32 });
let muted = false;
let audioUnlocked = false;

// Presentation-only combat effects (dice reveal, impact, float text, shake).
const effects = createEffects({ board, effectsLayer, diceOverlay, dieFace, audio });
// While an attack/ART is animating (roll reveal → impact), input is locked so the
// player can't double-resolve or act mid-animation.
let resolving = false;

function teamColor(player) {
  return player === 1 ? "#5288c6" : "#c4463f";
}

document.querySelector("#restartBtn").addEventListener("click", resetBattle);
document.querySelector("#rulesBtn").addEventListener("click", openCodex);

const muteBtn = document.querySelector("#muteBtn");
muteBtn.addEventListener("click", () => {
  muted = !muted;
  audio.setEnabled(!muted);
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.textContent = muted ? "Muted" : "Sound";
  if (!muted && audioUnlocked) audio.startMusic("battle");
});

// First user gesture unlocks audio and kicks off the looping theme. A single
// delegated click also gives every button its tactile click sound.
document.addEventListener("click", (event) => {
  if (!audioUnlocked) {
    audioUnlocked = true;
    if (!muted) audio.startMusic("battle");
  }
  const button = event.target.closest("button");
  if (button && !button.disabled) audio.play("buttonClick");
});

// ----------------------------------------------------------------------------
// Field codex — data-driven reference built from the unit catalog so the listed
// stats, passives, ARTS, and MP costs can never drift from the balance data.
// ----------------------------------------------------------------------------
const refModal = document.querySelector("#refModal");
document.querySelector("#refCloseBtn").addEventListener("click", closeCodex);
refModal.addEventListener("click", (event) => { if (event.target === refModal) closeCodex(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !refModal.hidden) closeCodex(); });

function openCodex() {
  document.querySelector("#refBody").innerHTML = buildCodex();
  refModal.hidden = false;
}

function closeCodex() {
  refModal.hidden = true;
}

const STAT_GLOSSARY = [
  ["Blind", "Afflicted unit's next attack automatically misses. Lasts 1 turn."],
  ["Silence", "Afflicted unit cannot use ARTS. Lasts 1 turn."],
  ["Poison", "1 damage at the start of each activation. Permanent until cleansed."],
  ["Slow", "−1 MOVE. Lasts 3 of the affected unit's turns."]
];

function buildCodex() {
  const units = Object.values(UNIT_TYPES).map((def) => {
    const s = def.stats;
    const statPills = [
      `${s.maxHp} HP`, `${s.maxMp} MP`, `Move ${s.moveRange}`,
      `Range ${s.attackRange}`, `STR ${s.strength}`, `DEF ${s.defense}`
    ].map((label) => `<span class="ref-pill">${label}</span>`).join("");
    const passives = [
      def.passive ? { tag: "Passive", ...def.passive } : null,
      def.rageArt ? { tag: "RAGE", ...def.rageArt } : null
    ].filter(Boolean)
      .map((p) => `<div class="ref-line"><span class="ref-tag passive">${p.tag}</span><b>${p.name}</b> — ${p.description}</div>`)
      .join("");
    const arts = def.arts
      .filter((art) => art.kind === "active")
      .map((art) => `<div class="ref-line"><span class="ref-tag art">ART · ${art.mpCost} MP</span><b>${art.name}</b> — ${art.description}</div>`)
      .join("");
    return `<section class="ref-unit"><h3><span class="ref-glyph">${def.glyph}</span>${def.name}</h3>
      <div class="ref-pills">${statPills}</div>
      <div class="ref-group"><div class="ref-group-title">Passives</div>${passives}</div>
      <div class="ref-group"><div class="ref-group-title">ARTS</div>${arts}</div></section>`;
  }).join("");
  const status = STAT_GLOSSARY
    .map(([name, text]) => `<div class="ref-line"><span class="ref-tag status">${name}</span>${text}</div>`)
    .join("");
  return `${units}<section class="ref-unit ref-status"><h3>Status Effects</h3>${status}
    <div class="ref-note">Move, then attack or defend. An ART replaces the whole activation and spends MP. RAGE auto-triggers at 5 HP or lower.</div></section>`;
}

function resetBattle() {
  state = createBattleState();
  selectedId = null;
  mode = null;
  footworkPath = [];
  volleyShotOrigin = null;
  setMessage("Fresh duel. Player 1 opens the battle.");
  render();
}

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
  playEventSounds(result.events ?? []);
  if (!state.activation) {
    selectedId = null;
    mode = null;
    footworkPath = [];
    volleyShotOrigin = null;
  }
  return true;
}

// Async resolution for the ROLLED actions — basic ATTACK and the targeted ARTS.
// The sequence mirrors Mini-Tactics: reveal the roll, THEN commit the resolved
// state, THEN play the impact (crit flash / shake / floating damage). The strike
// never lands before its roll is shown. Input stays locked across the animation
// (`resolving`). Non-rolled actions (move, defend, footwork, volley) keep using
// the synchronous `dispatch`.
async function resolveCombat(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) {
    setMessage(readableError(result.errorCode), true);
    return false;
  }
  const events = result.events ?? [];
  const rolled = events.find((event) =>
    (event.type === "ATTACK_RESOLVED" || event.type === "ART_RESOLVED") && "hit" in event);

  resolving = true;
  if (rolled) await effects.rollReveal({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) });

  // Target screen point is captured before the commit, but its tile never moves,
  // so the post-commit state still resolves the same spot for the impact.
  const metrics = createBoardMetrics(state.size);
  const targetBefore = rolled ? findUnit(state, rolled.targetId) : null;

  state = result.nextState;
  playEventSounds(events);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();

  if (rolled && targetBefore) {
    const screen = gridToScreen(metrics, targetBefore.position.x, targetBefore.position.y);
    const center = { x: screen.x, y: screen.y + metrics.tileHeight * 0.45 };
    if (rolled.missed) {
      await effects.floatText(center, "MISS", "#cbb78b");
    } else {
      const dmg = typeof rolled.damage === "number" ? rolled.damage : (rolled.damage?.damage ?? 0);
      if (rolled.critical) { effects.critFlash(); effects.shake(11); }
      else effects.shake(Math.min(8, 2.5 + dmg * 1.4));
      effects.impact(center, Boolean(rolled.critical));
      const targetAfter = findUnit(state, rolled.targetId);
      if (!targetAfter || targetAfter.hp <= 0) effects.deathBurst(center, teamColor(targetBefore.player));
      await effects.floatText(center, rolled.critical ? `✦ ${dmg}` : `-${dmg}`, rolled.critical ? "#ffd26a" : "#ff7684");
    }
  }

  resolving = false;
  return true;
}

// Map authoritative events onto reused Mini-Tactics audio. Outcome-driven, so a
// CPU or networked actor would sound identical with no extra wiring.
function playEventSounds(events) {
  for (const event of events) {
    if (event.type === "UNIT_MOVED") audio.play("unitMove");
    else if (event.type === "UNIT_DEFENDED") audio.play("defend");
    else if (event.type === "ATTACK_RESOLVED") {
      const ranged = findUnit(state, event.actorId)?.type === "archer";
      if (event.missed) audio.play("miss");
      else if (event.defended) audio.play("defendedHit");
      else { if (ranged) audio.play("arrowAirborne"); audio.play(ranged ? "arrowHit" : "attackHit"); }
    } else if (event.type === "ART_RESOLVED") {
      const actor = findUnit(state, event.actorId);
      const ranged = actor?.type === "archer";
      if (event.artId === "footwork") audio.play("unitMove");
      else if (ranged) { audio.play("arrowAirborne"); audio.play("arrowHit"); }
      else audio.play("attackHit");
      if (event.effect?.applied && event.artId === "life-sap") audio.play("heal");
    }
  }
}

// Mini-Tactics parity: a unit can move→attack OR attack→move, so a single attack
// keeps the activation open for an optional reposition. It auto-finishes only once
// the unit has BOTH moved and acted (nothing left to do). Defend and ARTS spend the
// unit instantly and are finished by their own handlers / the reducer instead.
function maybeAutoFinish() {
  const activation = state.activation;
  if (activation && activation.moved && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage("Activation complete. The next commander takes the field.");
  }
}

// Defend always completes the activation immediately (Mini-Tactics rule).
function finishNow() {
  const activation = state.activation;
  if (activation && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage("Activation complete. The next commander takes the field.");
  }
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

function artTip(art) {
  return `${art.name} · ${art.mpCost} MP — ${art.description}`;
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function beginUnit(unit) {
  if (resolving) return;
  if (unit.player !== state.currentPlayer || unit.spent || unit.hp <= 0) return;
  if (dispatch(beginActivation(unit.player, unit.id))) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    setMessage(`${getUnitType(unit.type).name} ready. Choose an action.`);
  }
}

async function handleTile(position) {
  if (resolving) return;
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
      setMessage("Moved. Now attack or defend to finish.");
    }
  } else if (mode === "attack") {
    const target = unitAt(state, position);
    if (target && await resolveCombat(attack(state.currentPlayer, unit.id, target.id))) {
      mode = null;
      setMessage("Attack resolved.");
      maybeAutoFinish();
    }
  } else if (mode === "footwork") {
    const options = getFootworkStepOptions(state, unit, footworkPath);
    if (!options.has(positionKey(position))) setMessage("Choose the next highlighted Footwork tile.", true);
    else {
      footworkPath.push(position);
      const steps = getFootworkSteps(unit);
      if (footworkPath.length === steps) {
        if (dispatch(useArt(state.currentPlayer, unit.id, "footwork", footworkPath))) setMessage("Footwork complete. This unit's activation is complete.");
      } else setMessage(`Footwork: choose step ${footworkPath.length + 1} of ${steps}.`);
    }
  } else if (mode === "art:volley-shot") {
    // Single click on a direction tile fires its cone (hover previews it first).
    if (!getVolleyShotAimOptions(state, unit).some((candidate) => positionKey(candidate) === positionKey(position))) {
      setMessage("Hover a highlighted direction to preview the cone, then click to fire.", true);
    } else if (dispatch(useArt(state.currentPlayer, unit.id, "volley-shot", { targetPosition: position }))) {
      setMessage("Volley Shot resolved. This unit's activation is complete.");
    }
  } else if (mode?.startsWith("art:")) {
    // Targeted attack ARTS roll to-hit (and their own effect check) inside the
    // reducer off the seed, so the view passes no roll — just the target.
    const artId = mode.slice("art:".length);
    const target = unitAt(state, position);
    if (target && await resolveCombat(useArt(state.currentPlayer, unit.id, artId, { targetId: target.id }))) {
      setMessage(`${getUnitType(unit.type).arts.find((art) => art.id === artId).name} resolved. This unit's activation is complete.`);
    }
  } else if (unitAt(state, position)?.id === unit.id) setMessage("Choose an action below.");
  render();
}

function render() {
  const unit = selectedUnit();
  const available = state.units.filter((candidate) => candidate.player === state.currentPlayer && candidate.hp > 0 && !candidate.spent).length;
  const teamColor = state.currentPlayer === 1 ? "#5288c6" : "#c4463f";
  turnBanner.style.setProperty("--team", teamColor);
  turnTitle.style.setProperty("--team", teamColor);
  turnTitle.textContent = state.phase === "complete" ? `Player ${state.winner} wins` : `Player ${state.currentPlayer} squad turn`;
  turnSub.textContent = state.phase === "complete" ? "Restart to play again" : `${available} piece${available === 1 ? "" : "s"} still available`;
  renderUnitCard(unit);
  renderActions(unit);
  renderSquads();
  renderBoard(unit);
  renderForecast(unit);
}

// Floating combat forecast (Mini-Tactics parity): while a unit is in Attack mode or
// a single-target ART mode, every legal enemy wears a badge over its head showing
// what the strike would do right now — the normal-hit damage, or a skull when that
// hit is lethal. A guaranteed miss (blinded attacker) reads "miss".
//
// The number is honest by construction: it comes from resolvePhysicalStrike, the
// SAME function the reducer uses to resolve the real hit, so every modifier (stat
// mods, RAGE, Last Stand, Defend, Close Shot) is already folded in and it can never
// drift. Crit is intentionally omitted — it is a post-selection d6 and cannot be
// promised before the roll. Pure presentation: the reducer still resolves the swing.
function renderForecast(actor) {
  forecastLayer.replaceChildren();
  if (!actor || state.phase !== "playing" || resolving) return;
  const isAttack = mode === "attack";
  // Single-target ARTS resolve as a physical strike; Volley Shot (cone) and Footwork
  // (path) preview themselves and are excluded here.
  const isStrikeArt = Boolean(mode?.startsWith("art:")) && mode !== "art:volley-shot";
  if (!isAttack && !isStrikeArt) return;

  const metrics = createBoardMetrics(state.size);
  const reach = getEffectiveStats(actor).attackRange;
  const blindMiss = isAttack && isBlinded(actor);
  for (const target of state.units) {
    if (target.hp <= 0 || !areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > reach) continue;
    if (blindMiss) { drawForecastBadge(metrics, target, "miss", "fc-miss"); continue; }
    const strike = resolvePhysicalStrike(actor, target, { proximity: isAttack });
    const lethal = strike.damage >= target.hp;
    drawForecastBadge(metrics, target, lethal ? `☠ ${strike.damage}` : `-${strike.damage}`, lethal ? "fc-lethal" : "fc-attack");
  }
}

function drawForecastBadge(metrics, target, label, cls) {
  const point = gridToScreen(metrics, target.position.x, target.position.y);
  const y = point.y + metrics.tileHeight * 0.45 - 52;
  const group = svgElement("g", { class: `forecast-badge ${cls}`, transform: `translate(${point.x} ${y})` });
  const halfWidth = 15 + (label.length - 1) * 4.5;
  const text = svgElement("text", { class: "fc-text", x: 0, y: 5, "text-anchor": "middle" });
  text.textContent = label;
  group.append(svgElement("rect", { class: "fc-bg", x: -halfWidth, y: -11, width: halfWidth * 2, height: 22, rx: 11 }), text);
  forecastLayer.append(group);
}

function renderUnitCard(unit) {
  if (!unit) {
    unitCard.style.removeProperty("--team");
    unitCard.innerHTML = `<div class="unit-emblem">?</div><div><div class="unit-name">No piece selected</div><div class="unit-meta">Choose an unspent Player ${state.currentPlayer} unit.</div><div class="hpbar"><div class="hpfill" style="width:0%"></div></div></div>`;
    return;
  }
  const definition = getUnitType(unit.type);
  const stats = getEffectiveStats(unit);
  unitCard.style.setProperty("--team", unit.player === 1 ? "#5288c6" : "#c4463f");
  const passive = definition.passive;
  const pills = [
    { label: `${unit.hp}/${stats.maxHp} HP`, cls: "" },
    { label: `${unit.mp}/${stats.maxMp} MP`, cls: "mp" },
    { label: `Move ${stats.moveRange}`, cls: "" },
    { label: `Range ${stats.attackRange}`, cls: "" },
    passive ? { label: passive.name, cls: "passive", title: passive.description } : null,
    isRaging(unit) ? { label: "RAGE", cls: "rage", title: definition.rageArt?.description } : null,
    unit.defending ? { label: "Defending", cls: "on" } : null,
    unit.spent ? { label: "Spent", cls: "spent" } : null
  ].filter(Boolean)
    .map(({ label, cls, title }) => `<span class="stat-pill ${cls}"${title ? ` title="${escapeAttr(title)}"` : ""}>${label}</span>`).join("");
  const statusLine = (unit.statuses ?? []).length
    ? ` · ${unit.statuses.map((s) => s.type).join(", ")}`
    : "";
  unitCard.innerHTML = `<div class="unit-emblem" title="${escapeAttr(definition.name)}">${unit.type === "swordsman" ? "⚔" : "➶"}</div><div><div class="unit-name">Player ${unit.player} ${definition.name}${statusLine}</div><div class="unit-stats">${pills}</div><div class="hpbar"><div class="hpfill ${unit.hp <= stats.maxHp * .3 ? "low" : ""}" style="width:${unit.hp / stats.maxHp * 100}%"></div></div></div>`;
}

function renderActions(unit) {
  if (!unit || !state.activation || state.phase !== "playing") {
    actions.innerHTML = "";
    actionHelp.textContent = state.phase === "complete" ? "The duel is complete." : "Select an unspent piece.";
    return;
  }
  const activation = state.activation;
  const hasPrimary = activation.primaryUsed;
  const footwork = getUnitType(unit.type).arts.find((art) => art.id === "footwork");
  const stats = getEffectiveStats(unit);
  const footworkControl = footwork ? `<button class="${mode === "footwork" ? "is-active" : ""}" data-action="footwork" title="${escapeAttr(artTip(footwork))}" ${canUseArt(state, unit, footwork.id) ? "" : "disabled"}>Footwork<kbd class="key">A</kbd></button>` : "";
  const arts = getAvailableArts(unit).filter((art) => art.kind === "active" && art.id !== "footwork" && art.implemented)
    .map((art) => `<button class="art-tile ${mode === `art:${art.id}` ? "is-active" : ""}" data-action="art:${art.id}" title="${escapeAttr(artTip(art))}" ${canUseArt(state, unit, art.id) ? "" : "disabled"}>${art.name}<kbd class="key">${art.mpCost}<span class="kbd-unit">MP</span></kbd></button>`).join("");
  actions.innerHTML = `<button class="${mode === "move" ? "is-active" : ""}" data-action="move" title="Move up to ${stats.moveRange} tiles, then attack or defend." ${activation.moved || hasPrimary ? "disabled" : ""}>Move<kbd class="key">1</kbd></button><button class="${mode === "attack" ? "is-active" : ""}" data-action="attack" title="Strike an enemy within range ${stats.attackRange}." ${hasPrimary ? "disabled" : ""}>Attack<kbd class="key">2</kbd></button><button data-action="defend" title="Brace: halve incoming physical and magic damage until your next turn." ${hasPrimary ? "disabled" : ""}>Defend<kbd class="key">3</kbd></button>${footworkControl}${arts}<button data-action="finish" title="End this unit's activation." ${hasPrimary ? "" : "disabled"}>Finish<kbd class="key">F</kbd></button>`;
  actionHelp.textContent = activation.moved ? "Now attack or defend to end this unit's turn." : `Move up to ${stats.moveRange} tiles, then attack or defend.`;
  actions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    if (resolving) return;
    const action = button.dataset.action;
    if (action === "defend") { if (dispatch(defend(state.currentPlayer, unit.id))) { setMessage("Defending: incoming physical and magic damage is halved."); finishNow(); } mode = null; }
    else if (action === "finish") { if (dispatch(finishActivation(state.currentPlayer, unit.id))) setMessage("Activation complete. The next commander takes the field."); }
    else {
      const deselect = mode === action;
      mode = deselect ? null : action;
      footworkPath = [];
      volleyShotOrigin = null;
      if (deselect) setMessage("Choose an action below.");
      else if (action === "footwork") setMessage(`Footwork (${footwork.mpCost} MP): ${footwork.description} Choose step 1 of ${getFootworkSteps(unit)}.`);
      else if (action.startsWith("art:")) {
        const art = getUnitType(unit.type).arts.find((a) => a.id === action.slice(4));
        const lead = action === "art:volley-shot" ? "Hover a direction to preview the cone, then click to fire." : "Choose a highlighted enemy target.";
        setMessage(`${art.name} (${art.mpCost} MP): ${art.description} ${lead}`);
      } else setMessage(`Choose a highlighted ${action} tile.`);
    }
    render();
  }));
}

function renderSquads() {
  squadOverlays.replaceChildren();
  for (const player of [1, 2]) {
    const panel = document.createElement("section");
    panel.className = `panel squad-panel squad-overlay slot-${player}${player === state.currentPlayer && state.phase === "playing" ? " is-active" : ""}`;
    panel.style.setProperty("--team", player === 1 ? "#5288c6" : "#c4463f");
    panel.innerHTML = `<div class="panel-title">Player ${player}</div><div class="squad-list"></div>`;
    const list = panel.querySelector(".squad-list");
    for (const unit of state.units.filter((candidate) => candidate.player === player)) {
      const stats = getEffectiveStats(unit);
      const chip = document.createElement("div");
      chip.className = `squad-chip${unit.spent ? " spent" : ""}${unit.defending ? " defending" : ""}${unit.player === state.currentPlayer && !unit.spent && unit.hp > 0 ? " selectable" : ""}`;
      chip.innerHTML = `<span class="chip-icon">${unit.type === "swordsman" ? "⚔" : "➶"}</span>${getUnitType(unit.type).name}<div class="chip-bar"><div class="chip-bar-fill" style="width:${unit.hp / stats.maxHp * 100}%"></div></div><div class="chip-hp">${unit.hp}/${stats.maxHp} HP</div>`;
      if (chip.classList.contains("selectable")) chip.addEventListener("click", () => { beginUnit(unit); render(); });
      list.append(chip);
    }
    squadOverlays.append(panel);
  }
}

function renderBoard(unit) {
  // legal  = bright, clickable targets (move tiles, enemies, cone cells, …)
  // range  = faint radius wash so the reach reads at a glance even when the only
  //          valid targets are hidden under enemy figurines (Mini-Tactics parity).
  let legal = new Set();
  let range = new Set();
  const targeted = mode === "attack" || (mode?.startsWith("art:") && mode !== "art:volley-shot");
  if (unit && mode === "move") legal = getLegalMoves(state, unit);
  if (unit && targeted) {
    const reach = getEffectiveStats(unit).attackRange;
    for (let x = unit.position.x - reach; x <= unit.position.x + reach; x += 1) {
      for (let y = unit.position.y - reach; y <= unit.position.y + reach; y += 1) {
        const cell = { x, y };
        if (!isOnBoard(state, cell)) continue;
        if (chebyshevDistance(unit.position, cell) === 0) continue;
        range.add(positionKey(cell));
      }
    }
    for (const target of state.units) if (target.hp > 0 && target.player !== unit.player && chebyshevDistance(unit.position, target.position) <= reach) legal.add(positionKey(target.position));
  }
  // Volley Shot reads like every other targeting mode: the reachable area (the
  // union of all four cones) is washed faintly as the "range", the adjacent
  // direction tiles are the bright clickable targets, and hovering a direction
  // lights its exact cone so you can see who it catches before a single click fires.
  let volleyCones = null;
  if (unit && mode === "art:volley-shot") {
    volleyCones = getVolleyShotAimOptions(state, unit).map((origin) => ({
      origin,
      key: positionKey(origin),
      cells: (getVolleyShotCells(state, unit, origin) ?? []).map(positionKey)
    }));
    for (const cone of volleyCones) for (const k of cone.cells) range.add(k);
    legal = new Set(volleyCones.map((cone) => cone.key));
  }
  if (unit && mode === "footwork") legal = getFootworkStepOptions(state, unit, footworkPath);
  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  boardLayer.replaceChildren();
  unitsLayer.replaceChildren();
  board.classList.toggle("board-focused", Boolean(unit));
  const tileByKey = new Map();
  for (let sum = 0; sum <= (state.size - 1) * 2; sum += 1) for (let x = 0; x < state.size; x += 1) {
    const y = sum - x;
    if (y < 0 || y >= state.size) continue;
    const position = { x, y };
    const key = positionKey(position);
    const isLegal = legal.has(key);
    const tile = createTile(metrics, position, {
      selected: unitAt(state, position)?.id === selectedId,
      legal: isLegal,
      targetKind: mode === "attack" ? "attack" : mode === "move" ? "move" : "art",
      path: path.has(key),
      range: !isLegal && range.has(key) ? (mode === "attack" ? "attack" : "art") : null
    });
    tile.addEventListener("click", () => handleTile(position));
    boardLayer.append(tile);
    tileByKey.set(key, tile);
  }
  if (volleyCones) wireVolleyHover(volleyCones, tileByKey);
  [...state.units].filter((occupant) => occupant.hp > 0)
    .sort((a, b) => (a.position.x + a.position.y) - (b.position.x + b.position.y))
    .forEach((occupant) => {
      const isTarget = targeted && unit && occupant.player !== unit.player && legal.has(positionKey(occupant.position));
      unitsLayer.append(createUnitFigure(metrics, occupant, isTarget));
    });
}

// Hovering a Volley direction lights that cone's tiles (and any enemy figurine
// standing in it) so the player sees the shot before clicking to fire. Pure DOM
// class toggling — no re-render — so it can't loop on mouseenter.
function wireVolleyHover(cones, tileByKey) {
  for (const cone of cones) {
    const aimTile = tileByKey.get(cone.key);
    if (!aimTile) continue;
    const enter = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (occupant.hp > 0 && cone.cells.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
    };
    const leave = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((el) => el.classList.remove("volley-hit"));
    };
    aimTile.addEventListener("mouseenter", enter);
    aimTile.addEventListener("mouseleave", leave);
  }
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}

function createTile(metrics, position, { selected, legal, targetKind, path, range }) {
  const point = gridToScreen(metrics, position.x, position.y);
  const halfWidth = metrics.tileWidth / 2;
  const halfHeight = metrics.tileHeight / 2;
  const top = [[point.x, point.y], [point.x + halfWidth, point.y + halfHeight], [point.x, point.y + metrics.tileHeight], [point.x - halfWidth, point.y + halfHeight]];
  const left = [[point.x - halfWidth, point.y + halfHeight], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x - halfWidth, point.y + halfHeight + metrics.depth]];
  const right = [[point.x + halfWidth, point.y + halfHeight], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x + halfWidth, point.y + halfHeight + metrics.depth]];
  const classes = ["tile", (position.x + position.y) % 2 === 0 ? "tile-light" : "tile-dark"];
  if (selected) classes.push("selected");
  if (range) classes.push(`${range}-range`);
  if (legal) classes.push(`legal-${targetKind}`);
  if (path) classes.push("path");
  // Plain clickable SVG with no tabindex/role — Mini-Tactics parity. (A focusable
  // <g> would draw a browser focus rectangle on click, the stray "square" artifact.)
  const tile = svgElement("g", { class: classes.join(" ") });
  tile.append(svgElement("polygon", { class: "tile-side-a", points: pointsToString(left) }), svgElement("polygon", { class: "tile-side-b", points: pointsToString(right) }), svgElement("polygon", { class: "tile-face", points: pointsToString(top) }));
  return tile;
}

function createUnitFigure(metrics, unit, isTarget = false) {
  const point = gridToScreen(metrics, unit.position.x, unit.position.y);
  const stats = getEffectiveStats(unit);
  const classes = ["unit", `player-${unit.player}`, "idle"];
  if (unit.spent) classes.push("spent");
  if (unit.defending) classes.push("defending");
  if (unit.id === selectedId) classes.push("active");
  if (isTarget) classes.push("targetable");
  const token = svgElement("g", { class: classes.join(" "), "data-key": positionKey(unit.position), transform: `translate(${point.x} ${point.y + metrics.tileHeight * .45})` });
  const body = svgElement("g", { class: "body-group" });
  body.append(svgElement("ellipse", { class: "base-side", cx: 0, cy: 9, rx: 25, ry: 12 }), svgElement("ellipse", { class: "base-top", cx: 0, cy: 2, rx: 25, ry: 12 }), svgElement("ellipse", { class: "rim", cx: 0, cy: 2, rx: 20, ry: 9 }), svgElement("circle", { class: "shield-ring", cx: 0, cy: -2, r: 31 }));
  const emblem = svgElement("g", { class: "emblem", transform: "translate(0 -10) scale(.72)" });
  const face = createUnitIcon(unit.type);
  const shadow = face.cloneNode(true); shadow.setAttribute("class", "icon-shadow"); shadow.setAttribute("transform", "translate(1.4 1.9)");
  const highlight = face.cloneNode(true); highlight.setAttribute("class", "icon-highlight"); highlight.setAttribute("transform", "translate(-1.2 -1.5)");
  emblem.append(shadow, highlight, face);
  body.append(emblem, svgElement("rect", { class: "hp-back", x: -25, y: 27, width: 50, height: 5, rx: 2.5 }), svgElement("rect", { class: "hp-front", x: -25, y: 27, width: 50 * unit.hp / stats.maxHp, height: 5, rx: 2.5 }));
  const spent = svgElement("g", { class: "spent-mark", transform: "translate(18 -18)" }); spent.append(svgElement("circle", { cx: 0, cy: 0, r: 8, fill: "rgba(0,0,0,.72)", stroke: "rgba(255,255,255,.5)" }), svgElement("path", { d: "M -4 0 L -1 3 L 5 -4", fill: "none", stroke: "#fff", "stroke-width": 2 }));
  const defended = svgElement("g", { class: "defend-mark", transform: "translate(-18 -18)" }); defended.append(svgElement("circle", { cx: 0, cy: 0, r: 9, fill: "rgba(20,16,8,.82)", stroke: "var(--gold)", "stroke-width": 1.4 }), svgElement("path", { class: "defend-shield", d: "M 0 -6 L 5 -3.5 L 5 1 Q 5 5 0 7 Q -5 5 -5 1 L -5 -3.5 Z" }));
  body.append(spent, defended);
  if (isTarget) {
    const reticle = svgElement("g", { class: "target-mark" });
    reticle.append(
      svgElement("circle", { class: "target-ring", cx: 0, cy: -2, r: 30, fill: "none" }),
      svgElement("path", { class: "target-chevron", d: "M -7 -40 L 0 -32 L 7 -40" })
    );
    body.append(reticle);
  }
  token.append(svgElement("ellipse", { class: "shadow", cx: 0, cy: 18, rx: 25, ry: 8 }), body);
  token.addEventListener("click", (event) => { event.stopPropagation(); handleTile(unit.position); });
  return token;
}

function createUnitIcon(type) {
  const icon = svgElement("g", { class: "icon" });
  if (type === "swordsman") icon.append(svgElement("path", { d: "M -4 -16 L 4 -16 L 4 7 L 12 7 L 12 12 L 4 12 L 4 20 L -4 20 L -4 12 L -12 12 L -12 7 L -4 7 Z" }), svgElement("path", { d: "M -6 -17 L 0 -27 L 6 -17 Z" }));
  else icon.append(svgElement("path", { d: "M -17 15 Q 1 -1 -17 -18 L -12 -21 Q 11 -1 -12 19 Z" }), svgElement("line", { class: "emblem-line", x1: -15, y1: -19, x2: -15, y2: 17, "stroke-width": 2 }), svgElement("line", { class: "emblem-line", x1: -13, y1: -2, x2: 18, y2: -2, "stroke-width": 3 }), svgElement("path", { d: "M 18 -2 L 9 -7 L 9 3 Z" }));
  return icon;
}

render();
