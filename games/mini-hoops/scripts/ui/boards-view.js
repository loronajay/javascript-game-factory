// The leaderboards screen.
//
// Filters are built from the same catalogs the setup screen uses, for the same
// reason. The board being viewed is the view's own state — browsing the circle
// board must not change what you are about to play, which is why this does not
// write back to preferences.
//
// A BOARD RANKS EVERY BALL TOGETHER, and names the ball on every row. Balls fly
// differently, so the ball is the context that makes a score readable — a paper
// wad 24 and a bowling ball 24 are different feats. It is deliberately NOT a
// filter and NOT part of the key: splitting the boards by ball would turn one
// contested board into four lonely ones. Showing it is the whole mechanism, so
// it gets its own cell rather than being trailed after the room as flavour.

import { ROUND_DURATIONS } from "../sim/constants.js";
import { HOOP_MODES, hoopModeById } from "../sim/hoop.js";
import { ballById, ballPortraitPath } from "../assets/ball-catalog.js";
import { locationById } from "../assets/location-catalog.js";
import { durationLabel } from "./setup-view.js";
import { onFireLevel } from "../sim/shot.js";

export function createBoardsView(root, { onFilter = () => {}, onClear = () => {} } = {}) {
  const modes = root.querySelector("#boardModes");
  const durations = root.querySelector("#boardDurations");
  const list = root.querySelector("#boardList");
  const meta = root.querySelector("#boardMeta");

  renderChips(modes, HOOP_MODES.map((mode) => ({ value: mode.id, label: mode.label })));
  renderChips(durations, ROUND_DURATIONS.map((seconds) => ({ value: String(seconds), label: durationLabel(seconds) })));

  modes?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (button) onFilter("mode", button.dataset.value);
  });
  durations?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (button) onFilter("duration", Number(button.dataset.value));
  });
  root.querySelector("#boardClear")?.addEventListener("click", onClear);

  return {
    render({ modeId, duration, entries }) {
      markActive(modes, modeId);
      markActive(durations, String(duration));
      if (meta) meta.textContent = `${hoopModeById(modeId).label} · ${durationLabel(duration)}`;
      if (!list) return;

      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "board-empty";
        empty.textContent = "No scores yet. Finish a timed run to set the first one.";
        list.replaceChildren(empty);
        return;
      }

      list.replaceChildren(...entries.map((entry, index) => renderRow(entry, index)));
    },
  };
}

function renderRow(entry, index) {
  const row = document.createElement("li");
  row.className = "board-row";
  if (index === 0) row.classList.add("is-leader");

  row.append(
    cell("board-rank", `#${index + 1}`),
    cell("board-score", `${entry.score}`),
    cell("board-detail", `${entry.shots || 0} shots`),
    cell("board-detail", streakLabel(entry.bestStreak || 0)),
    // The ball is the one piece of context that changes what the score MEANT,
    // so it reads as a label rather than as trailing flavour — and the pill
    // carries the ball itself, because a row that names eight different balls
    // is asking the reader to hold eight names in their head.
    ballCell(entry.ballId),
    // The room genuinely is flavour: locations are still cosmetic.
    cell("board-flavour", locationById(entry.locationId).label),
  );
  return row;
}

/** A best streak, with the flames it earned. Same answer the HUD burned on. */
function streakLabel(bestStreak) {
  const heat = onFireLevel(bestStreak);
  return `${bestStreak} streak${heat > 0 ? ` ${"\u{1F525}".repeat(heat)}` : ""}`;
}

/** The ball pill: the ball, then its name. */
function ballCell(ballId) {
  const ball = ballById(ballId);
  const node = cell("board-ball", "");
  const art = document.createElement("img");
  art.className = "board-ball-art";
  art.src = ballPortraitPath(ball.id);
  art.alt = "";
  art.loading = "lazy";
  art.decoding = "async";
  const label = document.createElement("span");
  label.textContent = ball.label;
  node.append(art, label);
  return node;
}

function cell(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function renderChips(container, options) {
  if (!container) return;
  container.replaceChildren(
    ...options.map(({ value, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip chip--compact";
      button.dataset.value = value;
      button.textContent = label;
      return button;
    }),
  );
}

function markActive(container, value) {
  container?.querySelectorAll("[data-value]").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}
