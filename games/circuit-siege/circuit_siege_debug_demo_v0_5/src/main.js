import { GameState } from "./state.js";
import { BoardRenderer } from "./renderer.js";
import { ToolPanel } from "./tools.js";
import { RouteTable } from "./routeTable.js";
import { EventLog } from "./eventLog.js";

const response = await fetch("./data/board.json");
const boardData = await response.json();

const state = new GameState(boardData);
const log = new EventLog(document.querySelector("#eventLog"));
const renderer = new BoardRenderer({
  svg: document.querySelector("#boardSvg"),
  hoverInfo: document.querySelector("#hoverInfo"),
  state,
  log
});
const tools = new ToolPanel({
  root: document.querySelector("#toolGrid"),
  onSelect(mask) {
    renderer.setSelectedMask(mask);
  }
});
const routeTable = new RouteTable({
  table: document.querySelector("#routeTable"),
  state
});

const routeCheatToggle = document.querySelector("#routeCheatToggle");
routeCheatToggle.addEventListener("change", () => {
  renderer.setRouteHoverCheatEnabled(routeCheatToggle.checked);
});

function renderAll() {
  renderer.render();
  routeTable.render();
  document.querySelector("#blueScore").textContent = `${state.scores.blue} / 5`;
  document.querySelector("#redScore").textContent = `${state.scores.red} / 5`;
}

state.onChange = renderAll;
renderer.onAction = (message) => log.add(message);

document.querySelector("#resetBtn").addEventListener("click", () => {
  state.reset();
  log.clear();
  log.add("Demo reset.");
});

let zoom = 1;
function applyZoom() {
  renderer.setZoom(zoom);
  document.querySelector("#zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
}
document.querySelector("#zoomInBtn").addEventListener("click", () => {
  zoom = Math.min(1.6, +(zoom + 0.1).toFixed(2));
  applyZoom();
});
document.querySelector("#zoomOutBtn").addEventListener("click", () => {
  zoom = Math.max(0.55, +(zoom - 0.1).toFixed(2));
  applyZoom();
});

tools.render();
state.reset();
log.add("Debug demo v0.5 loaded. Use the toolbar checkbox to toggle route-hover cheat.");
applyZoom();
