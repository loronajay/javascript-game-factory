// Questionable Decisions cabinet — trivia board on the shared display, phones as
// controllers. The shared screen renders the board/question/penalty spectacle;
// each phone renders only its private controls (tile pick on your turn, answer
// buttons, the penalty mini-game pad, or spectator reactions). Server-authoritative
// rules live in factory-network-server (games/questionable-decisions/server).
//
// Wire contract (this module is the single source of the message names):
//   incoming (server -> client):  qd_public_state, qd_private_state
//   outgoing (controller -> server, via lobby_message):
//     qd_theme_vote     { themeId }
//     qd_select_tile    { categoryIndex, tileIndex }
//     qd_answer         { answer }
//     qd_penalty_input  { input }
//     qd_reaction       { reaction }
import { decoratePlayer, escapeHtml, avatarToken } from "../jaybox-client-model.mjs";

// Preset spectator reactions (subset of the GDD bank; punch at the play, not the
// person). Kept here so the controller and any future display ticker share one list.
export const QD_REACTIONS = ["😂", "💀", "😬", "🔥", "👏", "Cooked", "Skill Issue", "No Pressure", "Respect", "Let Him Cook"];

function qdPlayers(state) {
  return (state.match?.players || []).map((player, index) => decoratePlayer(player, `Player ${index + 1}`));
}

function rankedPlayers(state) {
  return qdPlayers(state).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Controller in-match sub-screen. Server-set flags on `me` decide what this phone
// can do right now; everyone else spectates and reacts.
export function deriveMatchScreen(state) {
  const match = state.match || {};
  const me = state.me || {};
  switch (match.phase) {
    case "theme_vote": return "theme_vote";
    case "board": return me.canSelectTile ? "select_tile" : "spectate";
    case "question": return me.canAnswer ? "answer" : "spectate";
    case "penalty_active": return me.inPenalty ? "penalty" : "spectate";
    case "match_end": return "results";
    default: return "spectate";
  }
}

function phaseHeadline(phase) {
  return ({
    theme_vote: "Vote the theme",
    board: "Pick a tile",
    question: "Question live",
    answer_reveal: "Answer reveal",
    penalty_intro: "Penalty incoming",
    penalty_active: "Penalty in progress",
    penalty_results: "Penalty results",
    scoreboard: "Scoreboard",
    match_end: "Final results",
  })[phase] || String(phase || "").replaceAll("_", " ");
}

function renderBoard(match) {
  const categories = match.board?.categories || [];
  return `<div class="qd-board">${categories.map((cat) => `
    <div class="qd-board-col">
      <div class="qd-board-cat">${escapeHtml(cat.title)}</div>
      ${(cat.tiles || []).map((tile) => `<div class="qd-tile ${tile.used ? "used" : ""}">${tile.used ? "—" : tile.points}</div>`).join("")}
    </div>`).join("")}</div>`;
}

function renderScores(state, { rank = false } = {}) {
  const players = rank ? rankedPlayers(state) : qdPlayers(state);
  const activeId = state.match?.activePlayerId;
  return `<div class="grid">${players.map((player, index) => `
    <article class="player ${player.id === activeId ? "active" : ""} ${player.connected === false ? "disconnected" : ""}">
      ${avatarToken(player.avatar)}
      <div>
        <strong>${rank ? `${index + 1}. ` : ""}${escapeHtml(player.name)}</strong>
        <div class="role">${player.id === activeId ? "In control" : "Waiting"}${player.connected === false ? " - reconnecting" : ""}</div>
        <div class="gold">${player.score || 0} pts</div>
      </div>
    </article>`).join("")}</div>`;
}

export const questionableDecisionsCabinet = {
  gameId: "questionable-decisions",
  title: "Questionable Decisions",
  catalogEyebrow: "Cabinet",
  tagline: "Trivia on the big screen. Miss a question and your phone becomes the controller for a penalty everyone gets to watch.",

  renderCatalogArt() {
    return `<div class="cabinet-art">
      <div class="qd-marquee"><span>?</span><span>!</span><span>?</span></div>
    </div>`;
  },

  applyMessage(state, messageType, value) {
    if (messageType === "qd_public_state") state.match = value;
    if (messageType === "qd_private_state") {
      state.match = value;
      state.me = value.me;
    }
  },

  renderDisplayMatch(state) {
    const match = state.match || {};
    const topbar = `<header class="topbar"><div class="brand">Jay<span>box</span> / Questionable Decisions</div><span class="pill">Turn ${match.turn || 0} / ${match.maxTurns || 0}</span></header>`;
    const title = `<section class="screen-title"><div><h2>${escapeHtml(phaseHeadline(match.phase))}</h2><p class="hint">${escapeHtml(match.themeTitle || "Theme pending")}</p></div></section>`;

    let body = "";
    if (match.phase === "theme_vote") {
      body = `<div class="grid">${(match.themes || []).map((theme) => `<article class="player"><div><strong>${escapeHtml(theme.title)}</strong><div class="gold">${theme.votes || 0} votes</div></div></article>`).join("")}</div>`;
    } else if (match.phase === "board") {
      body = renderBoard(match) + renderScores(state);
    } else if (match.phase === "question" || match.phase === "answer_reveal") {
      const q = match.question || {};
      const reveal = match.answerReveal;
      body = `<section class="qd-question"><div class="eyebrow">${escapeHtml(q.category || "")} · ${q.points || 0}</div><h2>${escapeHtml(q.prompt || "")}</h2>
        ${Array.isArray(q.choices) ? `<div class="qd-choices">${q.choices.map((choice) => `<div class="qd-choice ${reveal && choice === reveal.correctAnswer ? "correct" : ""}">${escapeHtml(choice)}</div>`).join("")}</div>` : ""}
        ${reveal ? `<p class="status ${reveal.correct ? "" : "danger"}">${reveal.correct ? "Correct — keeps control." : `Wrong. Answer: ${escapeHtml(reveal.correctAnswer)}`}</p>` : ""}</section>`;
    } else if (match.phase === "penalty_intro" || match.phase === "penalty_active" || match.phase === "penalty_results") {
      const penalty = match.penalty || {};
      const player = qdPlayers(state).find((candidate) => candidate.id === penalty.activePlayerId);
      body = `<section class="qd-penalty-stage"><div class="eyebrow">Penalty</div><h2>${escapeHtml(penalty.displayName || penalty.penaltyId || "")}</h2>
        <p class="hint">${player ? `${escapeHtml(player.name)} on the controller` : ""}</p>
        ${penalty.statusText ? `<p class="status">${escapeHtml(penalty.statusText)}</p>` : ""}
        ${Number.isFinite(penalty.pointsLost) ? `<div class="qd-loss danger">-${penalty.pointsLost}</div>` : ""}</section>` + renderScores(state);
    } else if (match.phase === "scoreboard" || match.phase === "match_end") {
      const winner = qdPlayers(state).find((player) => player.id === match.winnerPlayerId);
      body = `${match.phase === "match_end" && winner ? `<section class="reveal-banner caught">${avatarToken(winner.avatar, "spotlight")}<div><div class="eyebrow">Winner</div><h3>${escapeHtml(winner.name)}</h3></div></section>` : ""}${renderScores(state, { rank: true })}`;
    }

    return `<div class="shell stage-shell">${topbar}${title}${body}</div>`;
  },

  deriveMatchScreen,

  renderControllerMatch(state, screen) {
    const me = decoratePlayer(state.me || {}, "You");
    const match = state.match || {};
    const top = `<header class="topbar controller-bar"><div class="brand">Jay<span>box</span></div><span class="pill">${state.connected ? "online" : "connecting"}</span></header>`;
    const wrap = (inner) => `<main class="shell controller">${top}<section class="controller-panel">${inner}</section></main>`;

    if (screen === "theme_vote") {
      return wrap(`<h2>Vote the theme</h2><div class="actions">${(match.themes || []).map((theme) => `<button class="button" data-theme="${escapeHtml(theme.id)}" ${me.themeVote === theme.id ? "disabled" : ""}>${escapeHtml(theme.title)}</button>`).join("")}</div><p class="status">${me.themeVote ? "Vote locked." : ""}</p>`);
    }

    if (screen === "select_tile") {
      const categories = match.board?.categories || [];
      return wrap(`<h2>Your turn — pick a tile</h2><div class="qd-board">${categories.map((cat, ci) => `<div class="qd-board-col"><div class="qd-board-cat">${escapeHtml(cat.title)}</div>${(cat.tiles || []).map((tile, ti) => `<button class="qd-tile" data-cat="${ci}" data-tile="${ti}" ${tile.used ? "disabled" : ""}>${tile.used ? "—" : tile.points}</button>`).join("")}</div>`).join("")}</div>`);
    }

    if (screen === "answer") {
      const q = match.question || {};
      if (Array.isArray(q.choices)) {
        return wrap(`<div class="eyebrow">${escapeHtml(q.category || "")} · ${q.points || 0}</div><h2>${escapeHtml(q.prompt || "")}</h2><div class="actions">${q.choices.map((choice) => `<button class="button" data-answer="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join("")}</div><p class="status">${me.submittedAnswer ? "Answer locked." : ""}</p>`);
      }
      return wrap(`<div class="eyebrow">${escapeHtml(q.category || "")} · ${q.points || 0}</div><h2>${escapeHtml(q.prompt || "")}</h2><form class="form" data-form="qd-answer"><label>Your answer<input name="answer" autocomplete="off" required></label><button class="button big">Lock it in</button></form><p class="status">${me.submittedAnswer ? "Answer locked." : ""}</p>`);
    }

    if (screen === "penalty") {
      const penalty = match.penalty || {};
      const controls = me.penaltyControls || penalty.controls || [];
      return wrap(`<div class="eyebrow">Penalty</div><h2>${escapeHtml(penalty.displayName || "Survive it")}</h2><p class="hint">${escapeHtml(penalty.promptText || "Hit the controls. Everyone is watching.")}</p>
        <div class="qd-pad">${controls.map((control) => `<button class="qd-pad-btn" data-penalty-input="${escapeHtml(control.input)}">${escapeHtml(control.label)}</button>`).join("")}</div>`);
    }

    if (screen === "results") {
      const players = rankedPlayers(state);
      const mine = players.findIndex((player) => player.id === me.id);
      return wrap(`<h2>Final results</h2><div class="seat-card"><div class="eyebrow">You placed</div><h2>#${mine >= 0 ? mine + 1 : "-"}</h2><div class="gold">${me.score || 0} pts</div></div>`);
    }

    // spectate: watch the big screen, fire reactions.
    return wrap(`<div class="seat-id">${avatarToken(me.avatar, "large")}</div><div class="eyebrow">${escapeHtml(phaseHeadline(match.phase))}</div><h2>${(me.score || 0)} pts</h2><p class="hint">Watch the screen. Drop a reaction.</p><div class="qd-reactions">${QD_REACTIONS.map((reaction) => `<button class="button secondary" data-reaction="${escapeHtml(reaction)}">${escapeHtml(reaction)}</button>`).join("")}</div>`);
  },

  wire(app, { send }) {
    app.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "qd_theme_vote", value: JSON.stringify({ themeId: button.dataset.theme }) });
    }));
    app.querySelectorAll("[data-cat][data-tile]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "qd_select_tile", value: JSON.stringify({ categoryIndex: Number(button.dataset.cat), tileIndex: Number(button.dataset.tile) }) });
    }));
    app.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "qd_answer", value: JSON.stringify({ answer: button.dataset.answer }) });
    }));
    app.querySelector("[data-form='qd-answer']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const answer = new FormData(event.currentTarget).get("answer");
      send("lobby_message", { messageType: "qd_answer", value: JSON.stringify({ answer }) });
    });
    app.querySelectorAll("[data-penalty-input]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "qd_penalty_input", value: JSON.stringify({ input: button.dataset.penaltyInput }) });
    }));
    app.querySelectorAll("[data-reaction]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "qd_reaction", value: JSON.stringify({ reaction: button.dataset.reaction }) });
    }));
  },
};
