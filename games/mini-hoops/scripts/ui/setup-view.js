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
import { ballById } from "../assets/ball-catalog.js";

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

  return {
    /** Reflect the current selection across every picker and the preview. */
    render(selection) {
      markActive(groups.mode, selection.modeId);
      markActive(groups.duration, String(selection.duration));
      markActive(groups.location, selection.locationId);
      markActive(groups.ball, selection.ballId);

      if (preview) {
        preview.src = locationBackdropPath(selection.locationId);
        preview.alt = `${locationById(selection.locationId).label} court`;
      }
      if (previewName) previewName.textContent = locationById(selection.locationId).label;
      if (summary) summary.textContent = describeSetup(selection);
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
