import { $, escapeHtml } from "./dom.mjs";

// The left-hand match rail: the frame-by-frame scoreboard plus the HUD chips
// that describe whose turn it is. Read-only over the session — it paints the
// match, it never advances it.
export function createScoreboard({ session, core, laneCore, shotHud, onCalloutHidden }) {
  function updateScoreboard() {
    const { match } = session;
    const board = $("scoreboard");
    board.innerHTML = "";
    const frameCount = core.MODES[match.modeId].frames;
    match.players.forEach((player, playerIndex) => {
      const row = document.createElement("div");
      row.className = `score-row${match.status === "playing" && playerIndex === match.activePlayer ? " is-active" : ""}`;
      const label = document.createElement("div");
      label.className = "score-player";
      label.innerHTML = `<strong>${escapeHtml(player.name)}</strong><small>${player.type === "cpu" ? "CPU" : `P${playerIndex + 1}`}</small>`;
      const frames = document.createElement("div");
      frames.className = "score-frames";
      frames.style.setProperty("--frames", frameCount);
      player.frames.forEach((rolls, frameIndex) => {
        const cell = document.createElement("div");
        cell.className = "score-frame";
        const slots = frameIndex === frameCount - 1 ? 3 : 2;
        const rollHtml = Array.from(
          { length: slots },
          (_, rollIndex) => `<i>${core.notation(rolls, rollIndex, frameIndex === frameCount - 1)}</i>`,
        ).join("");
        cell.innerHTML = `<small>${frameIndex + 1}</small><span class="score-rolls">${rollHtml}</span>${player.score.cumulative[frameIndex] ?? ""}`;
        frames.appendChild(cell);
      });
      const total = document.createElement("div");
      total.className = "score-total";
      total.textContent = player.score.total;
      row.append(label, frames, total);
      board.appendChild(row);
    });
  }

  function updateMatchUI() {
    const { match, scene } = session;
    if (!match) return;
    const player = session.activePlayer();
    const mode = core.MODES[match.modeId];
    const opponent = session.onlineMatch ? "Online" : match.playType === "campaign" ? "Circuit" : match.playType === "cpu" ? "Vs CPU" : "Hotseat";
    $("match-chip").textContent = `${mode.name} · ${opponent} · ${laneCore.getLane(session.matchLaneSlug).name}`;
    $("score-mode").textContent = `${mode.frames} frames`;
    $("hud-frame").textContent = Math.min(mode.frames, match.frameIndex + 1);
    $("hud-pins").textContent = scene.pins.filter((pin) => pin.standing).length;
    $("turn-name").textContent = player.name;
    $("turn-detail").textContent = `Frame ${match.frameIndex + 1} · Roll ${session.frameRollNumber()}`;
    $("turn-banner").querySelector("strong").textContent = player.name;
    updateOverlayVisibility();
    updateScoreboard();
    shotHud.updateShotControls();
  }

  // The banner and callout are timer-driven, so both the per-tick update and a
  // full repaint need this and only this.
  function updateOverlayVisibility() {
    $("turn-banner").classList.toggle("is-visible", session.bannerTime > 0);
    $("callout").classList.toggle("is-visible", session.calloutTime > 0);
    if (session.calloutTime <= 0) onCalloutHidden();
  }

  function updateStandingPinCount() {
    $("hud-pins").textContent = session.scene.pins.filter((pin) => pin.standing).length;
  }

  return { updateScoreboard, updateMatchUI, updateOverlayVisibility, updateStandingPinCount };
}
