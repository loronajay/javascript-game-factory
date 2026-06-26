import { activePlayer, isDangerScreen, screenKicker, turnHeadline } from "../core/selectors.js";
import { button, escapeHtml } from "./html.js";
import { renderStage } from "./screens.js";

export function renderApp(model) {
  const player = activePlayer(model);
  const { state } = model;
  const danger = isDangerScreen(state.screen);

  return `
    <section class="show-shell">
      ${renderMarquee(model, player)}
      <section class="stage-grid">
        ${renderPlayerRail(model)}
        <section class="main-stage screen-${state.screen} ${danger ? "is-danger" : ""}" data-transition="${state.transitionKey}">
          ${renderStageLights()}
          ${renderStage(model)}
        </section>
        ${renderReactionRail(model)}
      </section>
      ${renderTicker(model)}
    </section>
  `;
}

export function renderStageLights() {
  return `
    <div class="stage-light-rig" aria-hidden="true">
      ${Array.from({ length: 18 }, (_, index) => `<span style="--stagger: ${index}"></span>`).join("")}
    </div>
  `;
}

function renderMarquee(model, player) {
  const { state } = model;
  return `
    <header class="top-marquee">
      <div class="brand-lockup">
        <p class="brand-subtitle">Live penalty trivia</p>
        <h1 class="brand-title">Questionable Decisions</h1>
      </div>
      <div class="turn-display">
        <span class="turn-kicker">${escapeHtml(screenKicker(state.screen))}</span>
        <p class="turn-headline">${escapeHtml(player.name)} ${escapeHtml(turnHeadline(state.screen))}</p>
      </div>
      <div class="room-display">
        <span class="label">Room</span>
        <strong class="room-code">${state.roomCode}</strong>
        <span class="micro">Turn ${state.turn} / ${state.maxTurns}</span>
      </div>
    </header>
  `;
}

function renderPlayerRail(model) {
  return `
    <aside class="player-rail">
      <h2 class="rail-title">Podiums</h2>
      <div class="podium-list">
        ${model.players.map((player) => renderPodium(model, player)).join("")}
      </div>
    </aside>
  `;
}

function renderPodium(model, player) {
  const { state } = model;
  const active = player.id === state.activePlayerId;
  const hit = state.lastResult && state.lastResult.playerId === player.id ? "is-hit" : "";
  return `
    <article class="podium ${active ? "is-active" : ""} ${hit}" style="--player-color: ${player.color}">
      <div class="podium-row">
        <strong class="podium-name">${escapeHtml(player.name)}</strong>
        <span class="ready-light ${player.ready ? "is-ready" : ""}" aria-label="${player.ready ? "Ready" : "Not ready"}"></span>
      </div>
      <div class="podium-row">
        <span class="label">${active ? "In control" : "Watching"}</span>
        <strong class="podium-score">${player.score}</strong>
      </div>
      <div class="podium-meta">
        <span>Streak ${player.streak}</span>
        ${state.lastResult && state.lastResult.playerId === player.id ? `<span class="floating-delta">-${state.lastResult.loss}</span>` : "<span>Ready</span>"}
      </div>
    </article>
  `;
}

function renderReactionRail(model) {
  return `
    <aside class="reaction-rail">
      <h2 class="rail-title">Audience</h2>
      <div class="reaction-buttons">
        ${model.reactions.map((reaction) => `<button class="btn reaction" data-reaction="${escapeHtml(reaction)}">${escapeHtml(reaction)}</button>`).join("")}
      </div>
      <div class="reaction-feed" aria-label="Reaction feed">
        ${renderReactionBubbles(model)}
      </div>
    </aside>
  `;
}

export function renderReactionBubbles(model) {
  return model.state.reactions.slice(-5).reverse().map((reaction) => `<div class="reaction-bubble">${escapeHtml(reaction)}</div>`).join("");
}

function renderTicker(model) {
  return `
    <footer class="host-ticker">
      <span class="ticker-light"></span>
      <p class="ticker-text">${escapeHtml(model.state.ticker)}</p>
      <div class="screen-actions">
        ${button("Reset Show", "reset", "ghost")}
      </div>
    </footer>
  `;
}
