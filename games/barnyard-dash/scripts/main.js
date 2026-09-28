// Barnyard Dash's composition root: screens, input, the fixed 60 Hz loop, and
// which kind of race is running. The rules live in sim/, the world in
// scene.js, the menus in menus.js, an online race in online-race.js and the
// socket in the shared Pet Games lobby client. This file only connects them.

import { loadFarmPets } from "./farm-source.js?v=20260928-pet-online";
import { cpuFieldFor } from "./pets.js?v=20260928-pet-online";
import { createRaceScene, GAME_HEIGHT, GAME_WIDTH } from "./scene.js?v=20260928-pet-online";
import { COURSES, courseOrDefault, findCourse } from "./sim/courses.js?v=20260928-pet-online";
import { createRace, raceOrder, racerById, stepRace } from "./sim/race.js?v=20260928-pet-online";
import { CUPS, createGrandPrix, findCup, grandPrixCup, grandPrixFinished, grandPrixStandings, grandPrixSummary, nextGrandPrixRace, recordGrandPrixRace, trophyItemId } from "./grand-prix.js?v=20260928-pet-online";
import { BARNYARD_ONLINE, createOnlineRace } from "./online-race.js?v=20260928-pet-online";
import { createLevelPicker, fillCourseSelect, formatTime, ordinal, renderCupChoices, renderPodium, renderStandings } from "./menus.js?v=20260928-pet-online";
import { createPetPicker } from "../../pet-games/shared/ui/pet-picker.js";
import { createOnlinePanel } from "../../pet-games/shared/ui/online-panel.js";
import { createPetLobbyClient } from "../../pet-games/shared/online/lobby-client.js";
import { CPU_LEVELS, cpuLevelFromIndex, cpuLevelIndex, findCpuLevel } from "../../pet-games/shared/sim/levels.js";
import { fetchCareer, fileResult, loadAccountGate, loadIdentity, newResultId, onlineResultId, recordLine } from "../../pet-games/shared/platform.js";

const GAME_SLUG = "barnyard-dash";
const TICK_SECONDS = 1 / 60;
const $ = (selector) => document.querySelector(selector);

const canvas = $("#raceCanvas");
const stage = $("#gameStage");
const hud = $("#raceHud");
const countdownLabel = $("#countdown");
const touchControls = $("#touchControls");
const panels = {
  title: $("#titlePanel"),
  quick: $("#quickPanel"),
  cup: $("#cupPanel"),
  cupBoard: $("#cupBoard"),
  podium: $("#podiumPanel"),
  online: $("#onlinePanel"),
  result: $("#raceResult"),
};

const scene = createRaceScene(canvas);
scene.buildCourse(COURSES[0]);

// ---------------------------------------------------------------- state

let identity = { playerId: "", displayName: "Guest" };
let account = { signedIn: false, message: "", signIn: () => {} };
let career = null;
let selectedPet = null;
let screen = "title";
/** The race being run: { kind: "quick" | "cup" | "online", race, course, ... }. */
let run = null;
let cup = null;
let cupId = CUPS[0].id;
let lobbyClient = null;
let lobbyView = null;
let previousTime = null;
let accumulator = 0;
const held = new Set();

// ---------------------------------------------------------------- screens

function show(name) {
  screen = name;
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
  const racing = name === "race";
  hud.hidden = !racing;
  touchControls.classList.toggle("is-racing", racing);
  if (!racing) countdownLabel.textContent = "";
  if (racing) canvas.focus();
}

function goHome() {
  run = null;
  cup = null;
  scene.clearRacers();
  show("title");
  renderCareer();
}

const picker = createPetPicker($("#petChoices"), {
  onSelect(pet) {
    selectedPet = pet;
    lobbyClient?.setPet(pet);
  },
});

const quickLevel = createLevelPicker($("#quickLevel"), { initial: "pro" });
const cupLevel = createLevelPicker($("#cupLevel"), { initial: "rookie", onChange: () => renderCups() });
const courseSelect = $("#courseSelect");
fillCourseSelect(courseSelect);
const syncCourseBlurb = () => {
  const course = findCourse(courseSelect.value);
  $("#courseBlurb").textContent = course ? course.blurb : "A different course every race.";
  if (screen === "quick") scene.buildCourse(course ?? COURSES[0]);
};
courseSelect.addEventListener("change", syncCourseBlurb);
syncCourseBlurb();

function renderCups() {
  renderCupChoices($("#cupChoices"), {
    selected: cupId,
    career,
    onSelect(id) {
      cupId = id;
      renderCups();
    },
  });
}

function renderCareer() {
  const line = $("#careerLine");
  if (!account.signedIn) {
    line.textContent = "Sign in to keep an online record and win farm trophies.";
    return;
  }
  const trophies = Object.values(career?.cups ?? {}).reduce((sum, byLevel) => sum + Object.values(byLevel).filter((entry) => entry.bestPlace === 1).length, 0);
  line.textContent = `${recordLine(career, "races")} · ${trophies}/9 cup trophies`;
}

async function refreshCareer() {
  if (!account.signedIn || !identity.playerId) return;
  career = await fetchCareer(GAME_SLUG, identity.playerId);
  renderCareer();
  renderCups();
  lobbyView?.render(lobbyViewState());
}

// ---------------------------------------------------------------- local races

function beginLocalRace({ kind, course, entrants, seed, level }) {
  const race = createRace({ track: course.track, entrants, countdownSeconds: 3, totalLaps: course.laps, seed });
  run = { kind, course, race, level, localId: "player", startedAt: performance.now(), resultId: null, filed: false };
  newResultId(kind === "cup" ? "bdcup" : "bdquick").then((id) => { if (run) run.resultId = id; });
  scene.buildCourse(course);
  scene.clearRacers();
  scene.snapCamera(racerById(race, "player"));
  show("race");
  held.clear();
}

function startQuickRace() {
  if (!selectedPet) return;
  const course = findCourse(courseSelect.value) ?? COURSES[Math.floor(Math.random() * COURSES.length)];
  const fieldSize = Math.min(8, Math.max(2, Number($("#fieldSize").value) || 4));
  const level = quickLevel.value;
  const rivals = cpuFieldFor(selectedPet, fieldSize - 1, { level, seed: `quick:${Date.now()}:${Math.random()}` });
  beginLocalRace({
    kind: "quick",
    course,
    level,
    seed: `quick-${Date.now()}`,
    entrants: [{ id: "player", pet: selectedPet }, ...rivals.map((pet) => ({ id: pet.instanceId, pet, cpu: level }))],
  });
}

function startCup() {
  if (!selectedPet) return;
  cup = createGrandPrix({ cupId, level: cupLevel.value, playerPet: selectedPet, seed: `${Date.now()}-${Math.random()}` });
  cup.startedAt = performance.now();
  newResultId("bdcup").then((id) => { if (cup) cup.resultId = id; });
  startCupRace();
}

function startCupRace() {
  const next = nextGrandPrixRace(cup);
  if (!next) return;
  beginLocalRace({ kind: "cup", course: next.course, entrants: next.entrants, seed: next.seed, level: cup.level });
}

function localResultRows(race) {
  return raceOrder(race).map((racer, index) => ({ racer, place: index + 1 }));
}

async function finishLocalRace() {
  const { race, course } = run;
  const order = localResultRows(race);
  const mine = order.find((row) => row.racer.id === "player");

  if (run.kind === "cup") {
    cup = recordGrandPrixRace(cup, {
      order: order.map((row) => row.racer.id),
      finishedAt: Object.fromEntries(race.racers.map((racer) => [racer.id, racer.finishedAt])),
      elapsed: race.elapsed,
    });
    showCupBoard();
    return;
  }

  showResult({
    kicker: `${ordinal(mine.place)} of ${order.length} · ${course.title}`,
    title: mine.place === 1 ? `${mine.racer.pet.name} wins!` : mine.racer.dnf ? `${mine.racer.pet.name} ran out of time.` : `${mine.racer.pet.name} finishes ${ordinal(mine.place)}.`,
    copy: mine.place === 1 ? "Clean racing beats raw numbers." : "Brake before corners and time each jump to climb the field.",
    time: mine.racer.finishedAt,
    rows: order.map(({ racer }) => ({ name: racer.pet.name, time: racer.finishedAt, mine: racer.id === "player" })),
    again: "Race again",
  });
  const resultId = run.resultId;
  if (!resultId || run.filed) return;
  run.filed = true;
  const response = await fileResult(GAME_SLUG, {
    resultId,
    mode: "cpu",
    level: run.level,
    finalPlace: mine.place,
    races: [{ courseId: course.id, place: mine.place, fieldSize: order.length, finished: Number.isFinite(mine.racer.finishedAt), timeMs: Number.isFinite(mine.racer.finishedAt) ? Math.round(mine.racer.finishedAt * 1000) : null }],
    durationMs: Math.round(performance.now() - run.startedAt),
  });
  showReward(response);
  refreshCareer();
}

// ---------------------------------------------------------------- the Grand Prix between races

function showCupBoard() {
  const theCup = grandPrixCup(cup);
  const standings = grandPrixStandings(cup);
  const done = grandPrixFinished(cup);
  $("#cupBoardChip").textContent = `${theCup.title.toUpperCase()} · ${findCpuLevel(cup.level).title.toUpperCase()}`;
  $("#cupBoardKicker").textContent = `After race ${cup.raceIndex} of ${theCup.courses.length}`;
  const last = cup.results.at(-1);
  const mine = last.placings.find((row) => row.id === "player");
  $("#cupBoardTitle").textContent = mine?.place === 1 ? "You won that one!" : `You were ${ordinal(mine?.place ?? 8)}`;
  renderStandings($("#cupStandings"), standings, last);
  const next = nextGrandPrixRace(cup);
  $("#cupNextNote").textContent = next ? `Next: ${next.course.title} · ${next.course.laps} laps. ${next.course.blurb}` : "That was the last race.";
  $("#cupNext").textContent = done ? "See the podium" : "Next race";
  run = null;
  scene.clearRacers();
  show("cupBoard");
}

async function finishCup() {
  const theCup = grandPrixCup(cup);
  const standings = grandPrixStandings(cup);
  const mine = standings.find((row) => row.player);
  const level = findCpuLevel(cup.level);
  $("#podiumChip").textContent = `${theCup.title.toUpperCase()} · ${level.title.toUpperCase()}`;
  $("#podiumTitle").textContent = mine.place === 1 ? `${theCup.title} champion!` : mine.place <= 3 ? `${ordinal(mine.place)} on the podium` : `${ordinal(mine.place)} overall`;
  renderPodium($("#podium"), standings);
  $("#prizeLine").textContent = account.signedIn ? "Filing your result…" : mine.place === 1 ? "Sign in to take the trophy home to your farm." : "";
  show("podium");
  const finished = cup;
  if (!finished.resultId || finished.filed) return;
  finished.filed = true;
  const response = await fileResult(GAME_SLUG, grandPrixSummary(finished, { runId: finished.resultId, durationMs: performance.now() - finished.startedAt }));
  if (!response) {
    $("#prizeLine").textContent = account.signedIn ? "The result could not be filed right now." : $("#prizeLine").textContent;
    return;
  }
  const trophy = response.grants?.find((grant) => grant.entitlementId === trophyItemId(finished.cupId, finished.level));
  const parts = [];
  if (response.tickets?.awarded) parts.push(`+${response.tickets.awarded} tickets`);
  if (trophy) parts.push(trophy.isNew ? `A ${theCup.title} trophy is waiting in your farm's build mode (Props).` : `You already have this ${theCup.title} trophy on your farm.`);
  $("#prizeLine").textContent = parts.join(" · ") || "Result filed.";
  refreshCareer();
}

// ---------------------------------------------------------------- results

function showResult({ kicker, title, copy, time, rows, again, online = false }) {
  $("#resultKicker").textContent = kicker;
  $("#resultTitle").textContent = title;
  $("#resultCopy").textContent = copy;
  $("#playerResultTime").textContent = formatTime(time);
  $("#fieldResult").textContent = `${rows.length} pets`;
  $("#resultStandings").replaceChildren(...rows.map((row, index) => {
    const item = document.createElement("li");
    item.classList.toggle("is-player", row.mine);
    item.textContent = `${row.name}${row.who ? ` · ${row.who}` : ""} · ${formatTime(row.time)}`;
    item.value = index + 1;
    return item;
  }));
  $("#resultReward").textContent = account.signedIn ? "Filing your result…" : "";
  $("#raceAgain").textContent = again;
  $("#raceAgain").dataset.online = String(online);
  $("#changePet").textContent = online ? "Leave room" : "Main menu";
  show("result");
}

function showReward(response) {
  $("#resultReward").textContent = response?.tickets?.awarded ? `+${response.tickets.awarded} tickets` : account.signedIn ? "" : "";
}

// ---------------------------------------------------------------- online

function lobbyViewState() {
  return {
    signedIn: account.signedIn,
    gateMessage: account.message,
    client: lobbyClient?.getState(),
    recordText: account.signedIn ? `Your online record: ${recordLine(career, "races")}` : "",
  };
}

function ensureLobby() {
  if (lobbyClient) return;
  lobbyClient = createPetLobbyClient(BARNYARD_ONLINE, { resolveIdentity: () => identity });
  lobbyClient.setPet(selectedPet);
  lobbyView = createOnlinePanel(panels.online, {
    eventNoun: "race",
    maxPlayers: 8,
    settings: [
      { key: "mapId", label: "Course", options: [{ value: "", label: "Random course" }, ...COURSES.map((course) => ({ value: course.id, label: course.title }))] },
      { key: "cpuCount", label: "CPU guests", options: [0, 1, 2, 3, 4, 5, 6].map((count) => ({ value: count, label: count ? `${count} to fill empty chairs` : "None" })), parse: Number },
      { key: "cpuLevel", label: "CPU level", options: CPU_LEVELS.map((level) => ({ value: cpuLevelIndex(level.id), label: level.title })), parse: Number },
    ],
    onQuick: () => lobbyClient.findQuickMatch({ protocolVersion: 1 }),
    onCreate: () => lobbyClient.createPrivateRoom({ protocolVersion: 1, mapId: "", cpuCount: 0, cpuLevel: 1 }),
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
    // The server started a race this browser is seated in.
    if (state.status === "playing" && state.match && !state.ended && run?.kind !== "online") beginOnlineRace(state.match);
    if (state.status === "idle" && run?.kind === "online") goHome();
  });
  lobbyClient.onSnapshot((match, { ended }) => {
    if (run?.kind !== "online") return;
    run.session.applySnapshot(match);
    if (ended) finishOnlineRace(match);
  });
}

function openOnline() {
  ensureLobby();
  show("online");
  lobbyView.render(lobbyViewState());
  if (account.signedIn) lobbyClient.resumeSavedSession();
}

function beginOnlineRace(match) {
  const session = createOnlineRace({ match, clientId: lobbyClient.getState().clientId });
  run = { kind: "online", session, course: session.course, startedAt: performance.now(), localId: session.myId, filed: false };
  scene.buildCourse(session.course);
  scene.clearRacers();
  if (session.me) scene.snapCamera(session.me);
  show("race");
  held.clear();
}

async function finishOnlineRace(match) {
  if (!run || run.kind !== "online" || run.finished) return;
  run.finished = true;
  const results = match.results ?? [];
  const mineRow = results.find((row) => row.seatId === run.session.myId);
  const humans = match.seats.length;
  const names = new Map(match.seats.map((seat) => [seat.seatId, seat.name]));
  const pets = new Map([...match.seats.map((seat) => [seat.seatId, seat.pet]), ...match.cpus.map((seat) => [seat.seatId, seat.pet])]);
  showResult({
    kicker: mineRow ? `${ordinal(mineRow.place)} of ${results.length} · ${run.course.title}` : run.course.title,
    title: mineRow?.place === 1 ? "You won the room!" : mineRow ? `You finished ${ordinal(mineRow.place)}.` : "Race over.",
    copy: `${humans} players${match.cpus.length ? ` and ${match.cpus.length} CPU guests` : ""}. Every position here was decided by the server.`,
    time: mineRow?.finishedAt ?? null,
    rows: results.map((row) => ({ name: pets.get(row.seatId)?.name ?? row.name, who: row.human ? names.get(row.seatId) : "CPU", time: row.finishedAt, mine: row.seatId === run.session.myId })),
    again: "Back to the room",
    online: true,
  });
  if (!mineRow || run.filed) return;
  run.filed = true;
  const response = await fileResult(GAME_SLUG, {
    resultId: onlineResultId("bdonline", match.seed, mineRow.seatId),
    mode: "online",
    humans,
    finalPlace: mineRow.place,
    races: [{ courseId: match.courseId, place: mineRow.place, fieldSize: results.length, finished: Number.isFinite(mineRow.finishedAt), timeMs: Number.isFinite(mineRow.finishedAt) ? Math.round(mineRow.finishedAt * 1000) : null }],
    durationMs: Math.round((match.race?.elapsed ?? 0) * 1000 + 3000),
  });
  showReward(response);
  refreshCareer();
}

// ---------------------------------------------------------------- the loop

function currentControls() {
  return {
    throttle: held.has("throttle") || held.has("KeyW") || held.has("ArrowUp"),
    brake: held.has("brake") || held.has("KeyS") || held.has("ArrowDown"),
    left: held.has("left") || held.has("KeyA") || held.has("ArrowLeft"),
    right: held.has("right") || held.has("KeyD") || held.has("ArrowRight"),
    jump: held.has("jump") || held.has("Space"),
  };
}

function tick() {
  if (screen !== "race" || !run) return;
  const controls = currentControls();
  if (run.kind === "online") {
    lobbyClient.sendInputs(run.session.tick(controls));
    return;
  }
  run.race = stepRace(run.race, { player: controls }, TICK_SECONDS);
  if (run.race.status === "finished" && !run.done) {
    run.done = true;
    finishLocalRace();
  }
}

function hudFor(race, me) {
  if (!me) return;
  const order = raceOrder(race);
  $("#playerPlace").textContent = ordinal(order.findIndex((racer) => racer.id === me.id) + 1);
  $("#raceLap").textContent = `Lap ${Math.min(me.lap, race.totalLaps)} / ${race.totalLaps}`;
  $("#raceProgress").textContent = `Checkpoint ${Math.min(me.checkpoint, race.track.checkpoints.length)} / ${race.track.checkpoints.length}`;
  $("#raceTime").textContent = formatTime(race.elapsed);
  countdownLabel.textContent = race.countdown > 0 ? String(Math.ceil(race.countdown)) : race.elapsed < 0.7 ? "GO!" : "";
}

function render(dt) {
  if (run?.kind === "online") {
    const { race, me } = run.session;
    scene.syncRacers(race, dt, { localId: run.localId, poses: run.session.poses() });
    hudFor(race, me ? { ...me } : null);
    scene.updateCamera(dt, me);
  } else if (run) {
    const me = racerById(run.race, "player");
    scene.syncRacers(run.race, dt, { localId: "player" });
    hudFor(run.race, me);
    scene.updateCamera(dt, me);
  } else {
    scene.updateCamera(dt, null);
  }
  scene.render();
}

function frame(now) {
  if (previousTime === null) previousTime = now;
  const frameSeconds = Math.min((now - previousTime) / 1000, 0.1);
  accumulator += frameSeconds;
  previousTime = now;
  while (accumulator >= TICK_SECONDS) {
    tick();
    accumulator -= TICK_SECONDS;
  }
  render(frameSeconds);
  requestAnimationFrame(frame);
}

function resize() {
  const scale = Math.min(Math.max(320, window.innerWidth - 20) / GAME_WIDTH, Math.max(260, window.innerHeight - 145) / GAME_HEIGHT);
  stage.style.width = `${Math.round(GAME_WIDTH * scale)}px`;
  stage.style.height = `${Math.round(GAME_HEIGHT * scale)}px`;
  scene.resize();
}

// ---------------------------------------------------------------- wiring

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (screen !== "race") return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
    held.add(event.code);
  }
});
window.addEventListener("keyup", (event) => held.delete(event.code));
window.addEventListener("blur", () => held.clear());
for (const button of touchControls.querySelectorAll("button")) {
  const control = button.dataset.control;
  const press = (event) => { event.preventDefault(); held.add(control); button.classList.add("is-held"); };
  const release = (event) => { event.preventDefault(); held.delete(control); button.classList.remove("is-held"); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

$("#modeQuick").addEventListener("click", () => { show("quick"); syncCourseBlurb(); });
$("#modeCup").addEventListener("click", () => { renderCups(); show("cup"); });
$("#modeOnline").addEventListener("click", openOnline);
$("#startRace").addEventListener("click", startQuickRace);
$("#startCup").addEventListener("click", startCup);
$("#cupNext").addEventListener("click", () => (grandPrixFinished(cup) ? finishCup() : startCupRace()));
$("#cupQuit").addEventListener("click", goHome);
$("#podiumAgain").addEventListener("click", () => { cup = null; renderCups(); show("cup"); });
for (const back of document.querySelectorAll("[data-back], [data-home]")) back.addEventListener("click", goHome);
$("#raceAgain").addEventListener("click", () => {
  if ($("#raceAgain").dataset.online === "true") {
    run = null;
    scene.clearRacers();
    lobbyClient.backToLobby();
    show("online");
    lobbyView.render(lobbyViewState());
  } else if (run?.kind === "quick") startQuickRace();
  else goHome();
});
$("#changePet").addEventListener("click", () => {
  if ($("#raceAgain").dataset.online === "true") lobbyClient?.leave();
  goHome();
});
$("#fullscreen").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen?.() : stage.requestFullscreen?.()));
document.addEventListener("fullscreenchange", resize);

resize();
requestAnimationFrame(frame);
// Read-only handle for headless checks, the way the farm exposes window.__farm.
globalThis.__barnyard = { get run() { return run; }, get screen() { return screen; }, get cup() { return cup; } };

const [loaded, who, gate] = await Promise.all([loadFarmPets(), loadIdentity(), loadAccountGate()]);
identity = who;
account = gate;
picker.setPets(loaded.pets);
for (const id of ["#modeQuick", "#modeCup", "#modeOnline"]) $(id).disabled = false;
$("#loadNote").textContent = loaded.source === "fallback"
  ? "Farm data was unavailable, so a balanced 3D loaner is ready."
  : loaded.pets[0].instanceId === "borrowed-corgi" ? "Adopt and name a farm pet to bring your own racer." : `${loaded.pets.length} farm ${loaded.pets.length === 1 ? "pet is" : "pets are"} ready.`;
renderCareer();
renderCups();
refreshCareer();
// A tab reloaded mid-race rejoins it.
if (account.signedIn && sessionStorage.getItem(BARNYARD_ONLINE.storageKey)) openOnline();
