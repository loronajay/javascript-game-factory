// The compact ball picker shared by Floor Tic-Tac-Toe and HORSE.
//
// These modes choose a ball PER TURN rather than once on the setup screen. The
// picker is still catalog-driven: adding a ball remains one row in
// `ball-catalog.js`, and both courts get it without acquiring a second list.

import { BALLS, DEFAULT_BALL, ballById, ballFlightStats } from "../assets/ball-catalog.js";

/** A catalog ball id, defaulted so neither art paths nor the wire read raw input. */
export function normalizeTurnBallId(value) {
  return ballById(value || DEFAULT_BALL).id;
}

export function createTurnBallPicker(container, { onSelect = () => {} } = {}) {
  if (container) {
    container.replaceChildren(...BALLS.map((ball) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "turn-ball-choice";
      button.dataset.ballId = ball.id;
      button.title = `${ball.blurb} ${ballFlightStats(ball.id).map((stat) => `${stat.label} ${stat.value}`).join(" · ")}`;
      const label = document.createElement("strong");
      label.textContent = ball.label;
      button.appendChild(label);
      return button;
    }));

    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ball-id]");
      if (!button || !container.contains(button) || button.disabled) return;
      onSelect(normalizeTurnBallId(button.dataset.ballId));
    });
  }

  return {
    render({ ballId = DEFAULT_BALL, enabled = true } = {}) {
      const selected = normalizeTurnBallId(ballId);
      for (const button of container?.querySelectorAll("[data-ball-id]") || []) {
        const active = button.dataset.ballId === selected;
        button.disabled = !enabled;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    },
  };
}
