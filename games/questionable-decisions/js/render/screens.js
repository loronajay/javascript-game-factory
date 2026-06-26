import { activePlayer, rankedPlayers, selectedPenalty } from "../core/selectors.js";
import { button, escapeHtml } from "./html.js";

export function renderStage(model) {
  const screens = {
    lobby: renderLobby,
    themes: renderThemes,
    board: renderBoard,
    question: renderQuestion,
    correct: renderCorrect,
    wrong: renderWrong,
    "penalty-select": renderPenaltySelect,
    "penalty-active": renderPenaltyActive,
    "penalty-results": renderPenaltyResults,
    results: renderResults
  };
  return (screens[model.state.screen] || renderLobby)(model);
}

function renderLobby(model) {
  return `
    <div class="stage-content">
      <section class="hero-lock">
        <span class="eyebrow">Private room ${model.state.roomCode}</span>
        <h2 class="stage-title lobby-title">Greenroom ready.</h2>
        <p class="stage-copy">Four contestants are seated. Vote the episode, light the board, then let the scoreboard start making things personal.</p>
        <div class="lobby-podium-stage">
          ${model.players.map((player, index) => `
            <span class="contestant-marker ${player.ready ? "is-ready" : ""}" style="--player-color: ${player.color}; --stagger: ${index}">
              <span>${escapeHtml(player.name)}</span>
            </span>
          `).join("")}
        </div>
        <div class="screen-actions">
          ${button("Theme Vote", "themes", "primary")}
          ${button("Jump to Board", "board", "")}
        </div>
      </section>
    </div>
  `;
}

function renderThemes(model) {
  const maxVotes = Math.max(...model.themes.map((theme) => theme.votes), 1);
  return `
    <div class="stage-content align-top">
      <span class="eyebrow">Episode Vote</span>
      <h2 class="stage-title">Pick the category of regret.</h2>
      <section class="theme-grid">
        ${model.themes.map((theme, index) => {
          const selected = theme.id === model.state.selectedThemeId;
          const leading = theme.votes === maxVotes;
          return `
            <button class="theme-card ${selected ? "is-selected" : ""} ${leading ? "is-leading" : ""}" data-theme="${theme.id}" style="--stagger: ${index}">
              <span class="theme-episode">Episode ${String(index + 1).padStart(2, "0")}</span>
              <span class="label">${theme.votes} votes</span>
              <span>
                <h3 class="theme-name">${escapeHtml(theme.name)}</h3>
                <p class="theme-desc">${escapeHtml(theme.desc)}</p>
              </span>
              <span class="vote-meter"><span class="vote-fill" style="--vote-width: ${(theme.votes / maxVotes) * 100}%"></span></span>
            </button>
          `;
        }).join("")}
      </section>
      <div class="screen-actions">
        ${button("Light the Board", "board", "primary")}
        ${button("Backstage", "lobby", "ghost")}
      </div>
    </div>
  `;
}

function renderBoard(model) {
  return `
    <div class="stage-content align-top">
      <span class="eyebrow">Internet Brain - Board Live</span>
      <div class="question-meta">
        <h2 class="stage-title">Choose damage.</h2>
        <span class="timer-badge">Control: ${escapeHtml(activePlayer(model).name)}</span>
      </div>
      <section class="board-grid" aria-label="Trivia board">
        ${model.categories.map((category) => `<div class="category">${escapeHtml(category)}</div>`).join("")}
        ${[100, 200, 300, 400].map((points) => model.categories.map((category) => renderTile(model, category, points)).join("")).join("")}
      </section>
    </div>
  `;
}

function renderTile(model, category, points) {
  const id = `${category}-${points}`;
  const used = model.state.usedTiles.has(id);
  const tileIndex = model.categories.indexOf(category) + ([100, 200, 300, 400].indexOf(points) * model.categories.length);
  return `<button class="tile ${used ? "is-used" : ""}" ${used ? "disabled" : ""} data-tile="${escapeHtml(id)}" data-category="${escapeHtml(category)}" data-points="${points}" style="--stagger: ${tileIndex}" aria-label="${escapeHtml(category)} for ${points}"><span>${points}</span></button>`;
}

function renderQuestion(model) {
  const question = model.state.selectedQuestion;
  return `
    <div class="stage-content">
      <section class="question-card">
        <div class="question-meta">
          <span class="point-badge">${question.category} / ${question.points}</span>
          <span class="timer-badge">14 seconds</span>
        </div>
        <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
        <div class="choice-grid">
          ${question.choices.map((choice, index) => `<button class="btn choice" data-choice="${escapeHtml(choice)}" style="--stagger: ${index}">${escapeHtml(choice)}</button>`).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderCorrect(model) {
  return `
    <div class="stage-content">
      <section class="reveal-panel">
        <p class="reveal-word correct">Correct</p>
        <div class="score-swing">+${model.state.selectedQuestion.points}</div>
        <p class="stage-copy">${escapeHtml(activePlayer(model).name)} keeps control. Everyone else gets to keep pretending they knew that.</p>
        <div class="screen-actions">
          ${button("Back to Board", "board-after-correct", "primary")}
          ${button("Show Results", "results", "")}
        </div>
      </section>
    </div>
  `;
}

function renderWrong(model) {
  return `
    <div class="stage-content">
      <section class="reveal-panel">
        <p class="reveal-word wrong">Wrong</p>
        <p class="stage-copy">The answer was ${escapeHtml(model.state.selectedQuestion.answer)}. The scoreboard is holding its breath.</p>
        <div class="screen-actions">
          ${button("Spin Penalty", "penalty-spin", "danger")}
          ${button("Try Correct Beat", "correct-demo", "ghost")}
        </div>
      </section>
    </div>
  `;
}

function renderPenaltySelect(model) {
  const { state } = model;
  return `
    <div class="stage-content">
      <section class="penalty-panel">
        <span class="eyebrow">Maximum loss: ${Math.round(state.selectedQuestion.points * 1.5)}</span>
        <h2 class="stage-title">${state.penaltyRolling ? "Drawing penalty..." : "Penalty locked."}</h2>
        <div class="selector-track ${state.penaltyRolling ? "is-rolling" : ""}">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="mini-game-grid">
          ${model.penalties.map((penalty, index) => `
            <article class="mini-card ${penalty.id === state.selectedPenaltyId ? "is-selected" : ""}" data-penalty-id="${escapeHtml(penalty.id)}" style="--stagger: ${index}">
              <div class="mini-icon">${escapeHtml(penalty.icon)}</div>
              <h3 class="mini-name">${escapeHtml(penalty.name)}</h3>
              <p class="mini-desc">${escapeHtml(penalty.desc)}</p>
            </article>
          `).join("")}
        </div>
        <div class="screen-actions">
          ${state.penaltyRolling ? '<button class="btn danger" disabled>Drawing...</button>' : button("Begin Penalty", "penalty-active", "danger")}
          ${state.penaltyRolling ? "" : button("Re-spin", "respin", "ghost")}
        </div>
      </section>
    </div>
  `;
}

function renderPenaltyActive(model) {
  return `
    <div class="stage-content align-top">
      <section class="penalty-selector">
        <div class="penalty-meta">
          <span class="loss-badge">Live loss: 180</span>
          <span class="timer-badge">Bomb 7 / 10</span>
          <span class="point-badge">Max loss ${Math.round(model.state.selectedQuestion.points * 1.5)}</span>
        </div>
        <div class="penalty-arena">
          <div class="bomb-face">
            <span class="bomb-code">A7-K2</span>
          </div>
          <div class="wire-row">
            <button class="wire" style="--wire-color:#ff335f; --stagger: 0" data-action="penalty-results" aria-label="Red wire"></button>
            <button class="wire" style="--wire-color:#2ee6d6; --stagger: 1" data-action="penalty-results" aria-label="Cyan wire"></button>
            <button class="wire" style="--wire-color:#f7c548; --stagger: 2" data-action="penalty-results" aria-label="Gold wire"></button>
            <button class="wire" style="--wire-color:#30d158; --stagger: 3" data-action="penalty-results" aria-label="Green wire"></button>
            <button class="wire" style="--wire-color:#e845b5; --stagger: 4" data-action="penalty-results" aria-label="Magenta wire"></button>
          </div>
        </div>
        <div class="screen-actions">
          ${button("Resolve Damage", "penalty-results", "danger")}
          ${button("Back to Selector", "penalty-select", "ghost")}
        </div>
      </section>
    </div>
  `;
}

function renderPenaltyResults(model) {
  return `
    <div class="stage-content">
      <section class="results-panel">
        <span class="eyebrow">Bomb Diffuser complete</span>
        <h2 class="stage-title">Damage applied.</h2>
        <div class="result-grid">
          <article class="result-stat" style="--stagger: 0"><span class="label">Raw loss</span><strong>180</strong></article>
          <article class="result-stat" style="--stagger: 1"><span class="label">Applied loss</span><strong>180</strong></article>
          <article class="result-stat" style="--stagger: 2"><span class="label">Bombs exploded</span><strong>3</strong></article>
        </div>
        <p class="stage-copy">Control passes to Leo. Jay lost points, dignity, and approximately three seconds of emotional stability.</p>
        <div class="screen-actions">
          ${button("Pass Control", "pass-control", "primary")}
          ${button("Final Recap", "results", "")}
        </div>
      </section>
    </div>
  `;
}

function renderResults(model) {
  const ranked = rankedPlayers(model);
  return `
    <div class="stage-content">
      <section class="results-panel">
        <span class="eyebrow">Broadcast recap</span>
        <h2 class="stage-title">${escapeHtml(ranked[0].name)} owns the room.</h2>
        <div class="result-grid">
          <article class="result-stat" style="--stagger: 0"><span class="label">Winner</span><strong>${escapeHtml(ranked[0].name)}</strong></article>
          <article class="result-stat" style="--stagger: 1"><span class="label">Biggest point loss</span><strong>180</strong></article>
          <article class="result-stat" style="--stagger: 2"><span class="label">Roughest penalty</span><strong>${escapeHtml(selectedPenalty(model).name)}</strong></article>
        </div>
        <div class="screen-actions">
          ${button("Run It Back", "reset", "primary")}
          ${button("Board", "board", "")}
        </div>
      </section>
    </div>
  `;
}
