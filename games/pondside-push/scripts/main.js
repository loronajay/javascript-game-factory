// Pondside Push's composition root: screens, input, the fixed 60 Hz loop and
// which match is running. The rules live in sim/ (session.js runs a whole
// match: countdown, rounds, the pause after a splash), the island in arena.js,
// an online match in online-brawl.js and the socket in the shared Pet Games
// lobby client. This file only connects them.

import { loadFarmPets } from "../../pet-games/shared/farm-source.js";
import { cpuFieldFor } from "../../pet-games/shared/pets.js";
import { createArena } from "./arena.js?v=20260928-pet-online";
import { matchStandings, sessionBanner, createSession, stepSession } from "./sim/session.js?v=20260928-pet-online";
import { PONDSIDE_ONLINE, createOnlineBrawl } from "./online-brawl.js?v=20260928-pet-online";
import { createPetPicker } from "../../pet-games/shared/ui/pet-picker.js";
import { createOnlinePanel } from "../../pet-games/shared/ui/online-panel.js";
import { createPetLobbyClient } from "../../pet-games/shared/online/lobby-client.js";
import { CPU_LEVELS, cpuLevelIndex, normalizeCpuLevel } from "../../pet-games/shared/sim/levels.js";
import { fetchCareer, fileResult, loadAccountGate, loadIdentity, newResultId, onlineResultId, recordLine } from "../../pet-games/shared/platform.js";

const GAME_SLUG = "pondside-push";
const TICK_SECONDS = 1 / 60;
const $ = (selector) => document.querySelector(selector);

const canvas = $("#arenaCanvas");
const stage = $("#gameStage");
const scoreboard = $("#scoreboard");
const roundBanner = $("#roundBanner");
const touchControls = $("#touchControls");
const panels = { title: $("#titlePanel"), quick: $("#quickPanel"), online: $("#onlinePanel"), result: $("#roundResult") };
const arena = createArena(canvas);

let identity = { playerId: "", displayName: "Guest" };
let account = { signedIn: false, message: "", signIn: () => {} };
let career = null;
let selectedPet = null;
let screen = "title";
/** The match being played: { kind: "quick" | "online", ... }. */
let run = null;
let lobbyClient = null;
let lobbyView = null;
let previousTime = null;
let accumulator = 0;
const held = new Set();

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function show(name) {
  screen = name;
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
  const playing = name === "match";
  scoreboard.hidden = !playing;
  touchControls.classList.toggle("is-playing", playing);
  if (!playing) roundBanner.textContent = "";
  if (playing) canvas.focus();
}

function goHome() {
  run = null;
  arena.clear();
  show("title");
  renderCareer();
}

const picker = createPetPicker($("#petChoices"), {
  onSelect(pet) {
    selectedPet = pet;
    lobbyClient?.setPet(pet);
  },
});

// A segmented Rookie / Pro / Champion picker, the same one Barnyard Dash uses.
let quickLevel = "pro";
function renderLevels() {
  const root = $("#quickLevel");
  root.replaceChildren(...CPU_LEVELS.map((level) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "segmented__option";
    option.dataset.level = level.id;
    option.setAttribute("role", "radio");
    option.setAttribute("aria-checked", String(level.id === quickLevel));
    option.innerHTML = `<b>${level.title}</b><small>${escapeHtml(level.blurb.replace("miss a few jumps", "freeze up at the rim"))}</small>`;
    option.addEventListener("click", () => { quickLevel = normalizeCpuLevel(level.id); renderLevels(); });
    return option;
  }));
}
renderLevels();

function renderCareer() {
  const line = $("#careerLine");
  if (!account.signedIn) {
    line.textContent = "Sign in to keep an online record.";
    return;
  }
  const cpu = career?.cpu;
  line.textContent = `${recordLine(career, "matches")}${cpu?.matches ? ` · CPU: ${cpu.wins} of ${cpu.matches} won` : ""}`;
}

async function refreshCareer() {
  if (!account.signedIn || !identity.playerId) return;
  career = await fetchCareer(GAME_SLUG, identity.playerId);
  renderCareer();
  lobbyView?.render(lobbyViewState());
}

// ---------------------------------------------------------------- a local match

function startQuickMatch() {
  if (!selectedPet) return;
  const size = Math.min(4, Math.max(2, Number($("#fieldSize").value) || 4));
  const rivals = cpuFieldFor(selectedPet, size - 1, { level: quickLevel, seed: `push:${Date.now()}:${Math.random()}` });
  const session = createSession({
    entrants: [{ id: "player", pet: selectedPet }, ...rivals.map((pet) => ({ id: pet.instanceId, pet, cpu: quickLevel }))],
    seed: `push-${Date.now()}`,
  });
  run = { kind: "quick", session, level: quickLevel, localId: "player", startedAt: performance.now(), resultId: null, filed: false };
  newResultId("ppquick").then((id) => { if (run) run.resultId = id; });
  arena.clear();
  show("match");
  held.clear();
}

function renderScoreboard(match, names = null) {
  scoreboard.innerHTML = match.players.map((player) => {
    const who = names?.get(player.id);
    const label = `${escapeHtml(player.pet.name)}${who ? ` · ${escapeHtml(who)}` : ""}`;
    return `<div class="score-chip${player.id === run?.localId ? " player" : ""}${player.left ? " is-gone" : ""}"><small>${label}</small><strong>${"●".repeat(player.wins)}${"○".repeat(Math.max(0, match.winsToMatch - player.wins))}</strong></div>`;
  }).join("");
}

function roundCall(session, names = null) {
  const match = session.match;
  if (session.phase !== "round-over" && session.phase !== "match-over") return "";
  const winner = match.players.find((player) => player.id === match.roundWinnerId);
  if (!winner) return "DOUBLE SPLASH · REPLAY THE ROUND";
  const mine = winner.id === run?.localId;
  const who = mine ? "YOU" : (names?.get(winner.id) ?? winner.pet.name).toUpperCase();
  if (session.phase === "match-over") return mine ? "YOU TAKE THE ISLAND!" : `${who} TAKES THE ISLAND`;
  return mine ? "YOU HELD THE HILL!" : `${who} STAYED DRY`;
}

async function finishMatch() {
  const { session } = run;
  const standings = matchStandings(session);
  const localId = run.localId;
  const mineIndex = standings.findIndex((player) => player.id === localId);
  const mine = standings[mineIndex];
  const names = run.kind === "online" ? run.brawl.names : null;
  const won = mineIndex === 0;
  $("#resultKicker").textContent = run.kind === "online" ? "Online match complete" : "Match complete";
  $("#resultTitle").textContent = won ? "Island champion!" : `${standings[0].id === localId ? "You" : names?.get(standings[0].id) ?? standings[0].pet.name} takes it!`;
  $("#resultCopy").textContent = won ? `${mine.pet.name} reached ${session.match.winsToMatch} wins first.` : `${mine?.pet.name ?? "Your pet"} won ${mine?.wins ?? 0} of the rounds. ${session.match.round} rounds were played.`;
  $("#resultStandings").replaceChildren(...standings.map((player) => {
    const item = document.createElement("li");
    item.classList.toggle("is-player", player.id === localId);
    const who = names?.get(player.id);
    item.textContent = `${player.pet.name}${who ? ` · ${who}` : player.cpu ? " · CPU" : ""} · ${player.wins} ${player.wins === 1 ? "win" : "wins"}${player.left ? " · left" : ""}`;
    return item;
  }));
  $("#resultReward").textContent = account.signedIn ? "Filing your result…" : "";
  $("#nextRound").textContent = run.kind === "online" ? "Back to the room" : "Rematch";
  $("#changePet").textContent = run.kind === "online" ? "Leave room" : "Main menu";
  show("result");

  if (run.filed || !mine) return;
  run.filed = true;
  const common = {
    fieldSize: standings.length,
    finalPlace: mineIndex + 1,
    roundsWon: mine.wins,
    roundsPlayed: session.match.round,
    durationMs: Math.round(performance.now() - run.startedAt),
  };
  const result = run.kind === "online"
    ? { resultId: onlineResultId("pponline", run.brawl.match.seed, localId), mode: "online", humans: run.brawl.match.seats.length, ...common }
    : run.resultId ? { resultId: run.resultId, mode: "cpu", level: run.level, ...common } : null;
  if (!result) return;
  const response = await fileResult(GAME_SLUG, result);
  $("#resultReward").textContent = response?.tickets?.awarded ? `+${response.tickets.awarded} tickets` : "";
  refreshCareer();
}

// ---------------------------------------------------------------- online

function lobbyViewState() {
  return {
    signedIn: account.signedIn,
    gateMessage: account.message,
    client: lobbyClient?.getState(),
    recordText: account.signedIn ? `Your online record: ${recordLine(career, "matches")}` : "",
  };
}

function ensureLobby() {
  if (lobbyClient) return;
  lobbyClient = createPetLobbyClient(PONDSIDE_ONLINE, { resolveIdentity: () => identity });
  lobbyClient.setPet(selectedPet);
  lobbyView = createOnlinePanel(panels.online, {
    eventNoun: "match",
    maxPlayers: 4,
    settings: [
      { key: "cpuCount", label: "CPU guests", options: [0, 1, 2].map((count) => ({ value: count, label: count ? `${count} to fill empty spots` : "None" })), parse: Number },
      { key: "cpuLevel", label: "CPU level", options: CPU_LEVELS.map((level) => ({ value: cpuLevelIndex(level.id), label: level.title })), parse: Number },
    ],
    onQuick: () => lobbyClient.findQuickMatch({ protocolVersion: 1 }),
    onCreate: () => lobbyClient.createPrivateRoom({ protocolVersion: 1, cpuCount: 0, cpuLevel: 1 }),
    onJoin: (code) => lobbyClient.joinPrivateRoom(code),
    onStart: () => lobbyClient.startMatch(),
    onLeave: () => lobbyClient.leave(),
    // Only the setting that changed: the server merges it into the room's, so quick successive changes never undo each other.
    onSetting: (key, value) => lobbyClient.updateSettings({ [key]: value }),
    onSignIn: () => account.signIn(),
    onBack: () => goHome(),
  });
  lobbyClient.subscribe((state) => {
    if (screen === "online") lobbyView.render(lobbyViewState());
    if (state.status === "playing" && state.match && !state.ended && run?.kind !== "online") beginOnlineMatch(state.match);
    if (state.status === "idle" && run?.kind === "online") goHome();
  });
  lobbyClient.onSnapshot((match, { ended }) => {
    if (run?.kind !== "online") return;
    run.brawl.applySnapshot(match);
    if (ended && !run.done) {
      run.done = true;
      finishMatch();
    }
  });
}

function openOnline() {
  ensureLobby();
  show("online");
  lobbyView.render(lobbyViewState());
  if (account.signedIn) lobbyClient.resumeSavedSession();
}

function beginOnlineMatch(match) {
  const brawl = createOnlineBrawl({ match, clientId: lobbyClient.getState().clientId });
  run = { kind: "online", brawl, session: brawl.session, localId: brawl.myId, startedAt: performance.now(), filed: false };
  arena.clear();
  show("match");
  held.clear();
}

// ---------------------------------------------------------------- the loop

function playerControls() {
  return {
    x: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
    y: (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0),
    bump: held.has("bump"),
  };
}

function tick() {
  if (screen !== "match" || !run) return;
  if (run.kind === "online") {
    lobbyClient.sendInputs(run.brawl.tick(playerControls()));
    return;
  }
  stepSession(run.session, { player: playerControls() }, TICK_SECONDS);
  if (run.session.phase === "complete" && !run.done) {
    run.done = true;
    finishMatch();
  }
}

function loop(timestamp) {
  if (previousTime === null) previousTime = timestamp;
  accumulator += Math.min((timestamp - previousTime) / 1000, 0.1);
  previousTime = timestamp;
  while (accumulator >= TICK_SECONDS) {
    accumulator -= TICK_SECONDS;
    tick();
  }
  const dt = Math.min(0.05, TICK_SECONDS + accumulator);
  let impact = 0;
  if (run) {
    const { session } = run;
    const names = run.kind === "online" ? run.brawl.names : null;
    arena.sync(session.match, dt, { localId: run.localId, positions: run.kind === "online" ? run.brawl.positions() : null });
    renderScoreboard(session.match, names);
    roundBanner.textContent = sessionBanner(session) || roundCall(session, names);
    impact = Math.max(0, ...session.match.players.map((player) => player.impact));
  }
  arena.render(timestamp, impact);
  requestAnimationFrame(loop);
}

// The stage fills the window below the title bar (CSS); the arena renders at whatever that is.
function resize() {
  arena.resize(Math.max(1, Math.round(stage.clientWidth)), Math.max(1, Math.round(stage.clientHeight)));
}

// ---------------------------------------------------------------- wiring

const keyMap = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "bump" };
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyH") arena.toggleDebug();
  if (screen !== "match" || !keyMap[event.code]) return;
  held.add(keyMap[event.code]);
  event.preventDefault();
});
window.addEventListener("keyup", (event) => { if (keyMap[event.code]) held.delete(keyMap[event.code]); });
window.addEventListener("blur", () => held.clear());
for (const button of document.querySelectorAll("[data-control]")) {
  const control = button.dataset.control;
  const press = (event) => { event.preventDefault(); held.add(control); };
  const release = (event) => { event.preventDefault(); held.delete(control); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}
$("#modeQuick").addEventListener("click", () => show("quick"));
$("#modeOnline").addEventListener("click", openOnline);
$("#startMatch").addEventListener("click", startQuickMatch);
for (const back of document.querySelectorAll("[data-back]")) back.addEventListener("click", goHome);
$("#nextRound").addEventListener("click", () => {
  if (run?.kind === "online") {
    run = null;
    arena.clear();
    lobbyClient.backToLobby();
    show("online");
    lobbyView.render(lobbyViewState());
  } else startQuickMatch();
});
$("#changePet").addEventListener("click", () => {
  if (run?.kind === "online") lobbyClient?.leave();
  goHome();
});
$("#fullscreen").addEventListener("click", () => stage.requestFullscreen?.());
new ResizeObserver(resize).observe(stage);
// Read-only handle for headless checks.
globalThis.__pondside = { get run() { return run; }, get screen() { return screen; } };

resize();
requestAnimationFrame(loop);
const [loaded, who, gate] = await Promise.all([loadFarmPets(), loadIdentity(), loadAccountGate()]);
identity = who;
account = gate;
picker.setPets(loaded.pets);
for (const id of ["#modeQuick", "#modeOnline"]) $(id).disabled = false;
$("#loadNote").textContent = loaded.source === "fallback" ? "Your farm was unavailable, so Borrowed Biscuit is ready." : "Your farm pets are ready.";
renderCareer();
refreshCareer();
if (account.signedIn && sessionStorage.getItem(PONDSIDE_ONLINE.storageKey)) openOnline();
