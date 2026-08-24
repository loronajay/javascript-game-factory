// The setup screen.
//
// Every picker on this screen is BUILT FROM ITS CATALOG at runtime — the modes,
// the round lengths, the rooms, the balls. None of them are written out in
// `index.html`. That is the point: adding a ball is a row in `ball-catalog.js`
// and nothing else, and there is no second list of balls in the markup to forget
// to update.
//
// Reports selections back through callbacks; owns no preference state itself.

import { BALLS } from "../assets/ball-catalog.js";
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
        const { value, label, note } = toOption(item);
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
        return button;
      }),
    );
  }
  return { container, };
}

function markActive(group, value) {
  group.container?.querySelectorAll("[data-value]").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}
