// The setup screen.
//
// Every picker on this screen is BUILT FROM ITS CATALOG at runtime — the modes,
// the round lengths, the rooms, the balls. None of them are written out in
// `index.html`. That is the point: adding a ball is a row in `ball-catalog.js`
// and nothing else, and there is no second list of balls in the markup to forget
// to update.
//
// THE BALL PICKER SHOWS ITS FLIGHT NUMBERS, and that is not decoration. Balls
// genuinely fly differently, and the boards deliberately rank all of them
// together — so the only thing that makes a mixed board fair to read is that the
// difference was published before the run, in the same place the choice is made.
// The bars come from `ballFlightStats`, which does the arithmetic; this file does
// none of it.
//
// Reports selections back through callbacks; owns no preference state itself.

import { BALLS, ballFlightStats } from "../assets/ball-catalog.js";
import { LOCATIONS, locationBackdropPath, locationById } from "../assets/location-catalog.js";
import { ROUND_DURATIONS } from "../sim/constants.js";
import { HOOP_MODES, hoopModeById } from "../sim/hoop.js";
import { TIC_TAC_TOE_FIXED_SETUP } from "../sim/tic-tac-toe.js";
import { DEFAULT_WORD, normalizeWord } from "../sim/horse.js";
import { ballById } from "../assets/ball-catalog.js";

const GAME_TYPES = Object.freeze([
  Object.freeze({ id: "classic", label: "Classic Hoops", blurb: "Timed turns on the regular rim." }),
  Object.freeze({ id: "tic-tac-toe", label: "Floor Tic-Tac-Toe", blurb: "Shoot the real bin rims; three in a row wins." }),
  Object.freeze({ id: "horse", label: "HORSE", blurb: "Place a bin anywhere, make the shot, and make them match it." }),
]);

/**
 * The game types that are not the classic timed run.
 *
 * Both shoot at bins, both fix their own room and ball, and so neither reads a
 * single one of the classic pickers. Exported because the composition root has
 * to make the same distinction when it decides which screen a Start press opens,
 * and two hand-maintained lists of the same fact is how they drift apart.
 */
export const BIN_GAME_TYPES = new Set(["tic-tac-toe", "horse"]);

/** How a round length is written for a human. */
export function durationLabel(seconds) {
  return seconds === 60 ? "1 min" : `${seconds} sec`;
}

/** The one-line description of a configured run, used in several places. */
export function describeSetup({ modeId, duration, locationId, ballId }) {
  return [
    hoopModeById(modeId).label,
    durationLabel(duration),
    locationById(locationId).label,
    ballById(ballId).label,
  ].join(" · ");
}

export function createSetupView(root, { onSelect = () => {} } = {}) {
  const groups = {
    game: buildGroup(root.querySelector("#setupGameTypes"), GAME_TYPES, (game) => ({
      value: game.id,
      label: game.label,
      note: game.blurb,
    })),
    mode: buildGroup(root.querySelector("#setupModes"), HOOP_MODES, (mode) => ({
      value: mode.id,
      label: mode.label,
      note: mode.blurb,
    })),
    duration: buildGroup(
      root.querySelector("#setupDurations"),
      ROUND_DURATIONS,
      (seconds) => ({ value: String(seconds), label: durationLabel(seconds) }),
    ),
    location: buildGroup(root.querySelector("#setupLocations"), LOCATIONS, (location) => ({
      value: location.id,
      label: location.label,
      note: location.blurb,
    })),
    ball: buildGroup(root.querySelector("#setupBalls"), BALLS, (ball) => ({
      value: ball.id,
      label: ball.label,
      note: ball.blurb,
      stats: ballFlightStats(ball.id),
    })),
  };

  for (const [kind, group] of Object.entries(groups)) {
    group.container?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button || !group.container.contains(button)) return;
      onSelect(kind, button.dataset.value);
    });
  }

  const preview = root.querySelector("#setupPreview");
  const previewName = root.querySelector("#setupPreviewName");
  const summary = root.querySelector("#setupSummary");
  const gameTypePanel = root.querySelector("#setupGameTypePanel");
  const wordPanel = root.querySelector("#setupWordPanel");
  const wordInput = root.querySelector("#setupWord");
  // Sanitised as it is typed rather than on submit: the field is the only place
  // the player sees the word before it becomes a scoreboard, so it should never
  // show them something the match will silently refuse.
  wordInput?.addEventListener("input", (event) => {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
    if (event.target.value !== raw) event.target.value = raw;
    onSelect("word", raw);
  });
  // The four pickers that only describe a classic run.
  const classicPanels = [
    "#setupModePanel",
    "#setupDurationPanel",
    "#setupBallPanel",
    "#setupLocationPanel",
  ].map((selector) => root.querySelector(selector));

  return {
    /** Reflect the current selection across every picker and the preview. */
    render(selection) {
      // The game type is offered on the solo and hotseat setups and never on
      // the online one, which has a Game select of its own — and the choice is
      // remembered, so the play mode is read alongside it or a player who once
      // picked tic-tac-toe would find an online setup with no pickers on it.
      const ticTacToe = selection.playMode !== "online" && selection.gameType === "tic-tac-toe";
      const horse = selection.playMode !== "online" && selection.gameType === "horse";
      // Both bin modes fix their own room and ball, so neither reads the
      // remembered classic pickers — see the note on the summary below.
      const binMode = selection.playMode !== "online" && BIN_GAME_TYPES.has(selection.gameType);
      const shown = binMode ? TIC_TAC_TOE_FIXED_SETUP : selection;

      markActive(groups.game, selection.gameType || "classic");
      markActive(groups.mode, selection.modeId);
      markActive(groups.duration, String(selection.duration));
      markActive(groups.location, selection.locationId);
      markActive(groups.ball, selection.ballId);

      if (preview) {
        preview.src = locationBackdropPath(shown.locationId);
        preview.alt = `${locationById(shown.locationId).label} court`;
      }
      if (previewName) previewName.textContent = locationById(shown.locationId).label;
      // Not `describeSetup`: three of its four fields do not exist in this mode,
      // and printing the remembered classic ones under a tic-tac-toe start
      // button would promise a room, a ball and a clock the stage never reads.
      if (summary) {
        const players = selection.playMode === "hotseat" ? "Two players" : "You vs CPU";
        summary.textContent = horse
          ? `${players} · spell ${normalizeWord(selection.word || DEFAULT_WORD)}`
          : ticTacToe
            ? `${players} · ${locationById(shown.locationId).label} · ${ballById(shown.ballId).label}`
            : describeSetup(selection);
      }
      if (gameTypePanel) gameTypePanel.hidden = selection.playMode === "online";
      if (wordPanel) wordPanel.hidden = !horse;
      if (wordInput && document.activeElement !== wordInput) {
        wordInput.value = selection.word || "";
      }
      for (const panel of classicPanels) if (panel) panel.hidden = binMode;
    },
  };
}

/** Render one picker's buttons from a catalog. */
function buildGroup(container, items, toOption) {
  if (container) {
    container.replaceChildren(
      ...items.map((item) => {
        const { value, label, note, stats } = toOption(item);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.dataset.value = value;
        const strong = document.createElement("strong");
        strong.textContent = label;
        button.appendChild(strong);
        if (note) {
          const span = document.createElement("span");
          span.textContent = note;
          button.appendChild(span);
        }
        if (stats && stats.length) button.appendChild(buildStats(stats));
        return button;
      }),
    );
  }
  return { container, };
}

/**
 * The little bar chart of flight stats under a ball's name.
 *
 * Reads `fill` straight from the catalog and does no maths of its own — see the
 * note at the top of the file. The numeric value is carried in the row's
 * `title`, so the exact multiplier is available on hover without cluttering a
 * picker that has to stay readable on a phone.
 */
function buildStats(stats) {
  const wrap = document.createElement("span");
  wrap.className = "chip-stats";
  for (const stat of stats) {
    const row = document.createElement("span");
    row.className = "chip-stat";
    row.title = `${stat.label} ${stat.value} — ${stat.hint}`;

    const name = document.createElement("span");
    name.className = "chip-stat-label";
    name.textContent = stat.label;

    const track = document.createElement("span");
    track.className = "chip-stat-track";
    const fill = document.createElement("span");
    fill.className = "chip-stat-fill";
    fill.style.width = `${Math.round(stat.fill * 100)}%`;
    track.appendChild(fill);

    row.append(name, track);
    wrap.appendChild(row);
  }
  return wrap;
}

function markActive(group, value) {
  group.container?.querySelectorAll("[data-value]").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}
