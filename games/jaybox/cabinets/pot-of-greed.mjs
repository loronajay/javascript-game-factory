// Pot of Greed cabinet — everything game-specific that used to live inline in the
// Jaybox shell now lives here behind the uniform cabinet interface. The shell
// owns connection, session, catalog framing, lobby, and join; this module owns
// Pot of Greed's match rendering, controller screens, message handling, and input
// wiring. Server-authoritative rules stay in factory-network-server.
import { AVATARS, decoratePlayer, escapeHtml, avatarToken } from "../jaybox-client-model.mjs";

export function canSubmitVote(match, me) {
  return Boolean(match?.phase?.includes("vote") && !me?.submittedVote);
}

function lobbyPlayers(state) {
  const players = Array.isArray(state.lobby?.players) ? state.lobby.players : [];
  if (players.length) return players.map((player, index) => decoratePlayer(player, `Player ${index + 1}`));
  return (state.lobby?.members || []).map((id, index) => decoratePlayer({ id, name: `Player ${index + 1}` }, `Player ${index + 1}`));
}

function decoratedMatchPlayers(state) {
  const lobbyById = new Map(lobbyPlayers(state).map((player) => [player.id, player]));
  return (state.match?.players || []).map((player, index) => decoratePlayer({ ...(lobbyById.get(player.id) || {}), ...player }, `Player ${index + 1}`));
}

function playerCards(players = [], showGold = false) {
  return players.map((rawPlayer, index) => {
    const player = decoratePlayer(rawPlayer, `Player ${index + 1}`);
    return `
    <article class="player ${player.status === "jury" ? "jury" : ""} ${player.connected === false ? "disconnected" : ""}">
      ${avatarToken(player.avatar)}
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <div class="role">${player.status === "jury" ? "Jury" : "Vault access"}${player.connected === false ? " - reconnecting" : ""}</div>
        ${showGold && Number.isFinite(player.gold) ? `<div class="gold">${player.gold} gold</div>` : ""}
      </div>
    </article>`;
  }).join("");
}

function vaultStage(match, audit) {
  const phase = String(match.phase || "");
  const locked = phase.includes("vote") || phase.includes("discussion") || phase === "final_results";
  return `<section class="vault-stage ${locked ? "locked" : "active"}" aria-label="Shared vault">
    <div class="vault-copy">
      <div class="eyebrow">Shared vault</div>
      <div class="vault-amount">${match.vaultGold}</div>
      <div class="gold">gold under seal</div>
    </div>
    <div class="vault-door" aria-hidden="true">
      <div class="vault-rim">
        <div class="vault-wheel"><span></span><span></span><span></span><span></span></div>
      </div>
      <div class="vault-light"></div>
    </div>
    <div class="vault-ticker">${audit ? `Audit ${audit.netChange > 0 ? "+" : ""}${audit.netChange}` : "Awaiting first audit"}</div>
  </section>`;
}

export const potOfGreedCabinet = {
  gameId: "pot-of-greed",
  title: "Pot of Greed",
  catalogEyebrow: "Cabinet",
  tagline: "Secret vault moves, loud accusations, and one shared screen that knows exactly who got greedy.",

  renderCatalogArt() {
    return `<div class="cabinet-art">
      <div class="mini-vault"><span></span></div>
      <div class="coin-rain"><span></span><span></span><span></span><span></span></div>
    </div>`;
  },

  applyMessage(state, messageType, value) {
    if (messageType === "pot_of_greed_public_state") state.match = value;
    if (messageType === "pot_of_greed_private_state") {
      state.match = value;
      state.me = value.me;
    }
  },

  renderDisplayMatch(state) {
    const match = state.match;
    const players = decoratedMatchPlayers(state);
    const showGold = match.cycleType === "show" || match.phase === "final_results";
    const audit = match.audit;
    const vote = match.lastVoteResult;
    const accused = players.find((player) => player.id === vote?.selectedId);
    return `<div class="shell stage-shell">
      <header class="topbar"><div class="brand">Jay<span>box</span> / Pot of Greed</div><span class="pill">Cycle ${match.cycleNumber} / ${escapeHtml(match.cycleType)}</span></header>
      <section class="screen-title">
        <div><h2>${escapeHtml(String(match.phase || "").replaceAll("_", " "))}</h2><p class="hint">${String(match.phase || "").includes("discussion") ? "Talk it out. The vault remembers everything, but it tells no one why." : "Phones down only after your controller says the move is locked."}</p></div>
        <span class="pill">${match.voteProgress?.submitted || 0}/${match.voteProgress?.eligible || 0} votes</span>
      </section>
      <div class="match-layout">
        ${vaultStage(match, audit)}
        <section class="audit-board">
          <div class="eyebrow">Latest audit</div>
          ${audit ? `<div class="audit-stack"><span>Before <b>${audit.vaultBefore}</b></span><span>After <b>${audit.vaultAfter}</b></span><span>Net <b class="${audit.netChange < 0 ? "danger" : "gold"}">${audit.netChange > 0 ? "+" : ""}${audit.netChange}</b></span></div>` : `<p class="hint">The first audit arrives after everyone locks a vault choice.</p>`}
        </section>
      </div>
      <section class="roster-board">
        <div class="phase-row"><h3>Players</h3><span class="pill">${showGold ? "Balances revealed" : "Balances private"}</span></div>
        <div class="grid">${playerCards(players, showGold)}</div>
      </section>
      ${vote ? `<section class="reveal-banner ${vote.correct ? "caught" : "miss"}">${accused ? avatarToken(accused.avatar, "spotlight") : ""}<div><div class="eyebrow">Last accusation</div><h3>${escapeHtml(accused?.name || "Player")} was ${vote.correct ? "caught stealing" : "wrongly accused"}</h3></div><div class="gold">${vote.fine ? `${vote.fine} gold fine` : "Jury lockout"}</div></section>` : ""}
    </div>`;
  },

  deriveMatchScreen(state) {
    const match = state.match;
    if (match.phase?.includes("vault_action") && state.me?.status === "active") return "vault_action";
    if (match.phase?.includes("vote") || match.phase?.includes("discussion")) return "vote";
    return "waiting";
  },

  renderControllerMatch(state, screen) {
    const me = decoratePlayer(state.me || {}, "You");
    const top = `<header class="topbar controller-bar"><div class="brand">Jay<span>box</span></div><span class="pill">${state.connected ? "online" : "connecting"}</span></header>`;
    const match = state.match;

    if (screen === "vault_action") {
      return `<main class="shell controller">${top}<section class="controller-panel vault-controller">
        <div class="private-balance"><span>Your private balance</span><b>${me.gold}</b><em>gold</em></div>
        <p class="hint">Choose one vault action. Your choice locks immediately and stays secret.</p>
        <div class="actions">
          <button class="button secondary" data-vault="pass">Pass</button>
          <button class="button" data-vault="steal" data-amount="3">Steal 3</button>
          <button class="button" data-vault="steal" data-amount="5">Steal 5</button>
          <button class="button" data-vault="steal" data-amount="8">Steal 8</button>
          ${match.cycleType === "hidden" ? `<button class="button secondary" data-vault="invest" data-amount="3">Invest 3<br>to 6</button><button class="button secondary" data-vault="invest" data-amount="5">Invest 5<br>to 11</button><button class="button secondary" data-vault="invest" data-amount="8">Invest 8<br>to 18</button>` : ""}
        </div>
        <p class="status">${me.submittedAction ? "Locked. No peeking." : ""}</p>
      </section></main>`;
    }

    if (screen === "vote") {
      const players = decoratedMatchPlayers(state);
      const active = players.filter((player) => player.status === "active" && player.id !== me.id);
      const canVote = canSubmitVote(match, me);
      return `<main class="shell controller">${top}<section class="controller-panel vote-panel">
        <div class="eyebrow">Your balance / <span class="gold">${me.gold}</span> gold</div>
        <h2>${canVote ? "Cast a secret vote." : "Discussion underway."}</h2>
        <p class="hint">${canVote ? "Only active vault players can be targeted. Your vote remains private until the reveal." : "Listen closely. Voting unlocks when discussion ends."}</p>
        <div class="vote-grid">${active.map((player) => `<button class="vote-target" data-vote="${escapeHtml(player.id)}" ${canVote ? "" : "disabled"}>${avatarToken(player.avatar)}<span>${escapeHtml(player.name)}</span></button>`).join("")}</div>
        <p class="status">${me.submittedVote ? "Vote locked." : ""}</p>
      </section></main>`;
    }

    return `<main class="shell controller">${top}<section class="controller-panel seat-card"><div class="seat-id">${avatarToken(me.avatar, "large")}</div><div class="eyebrow">Your balance</div><h2><span class="gold">${me.gold ?? "-"}</span> gold</h2><p class="hint">${me.status === "jury" ? "You are on the jury: no vault access, but your vote and your gold still matter." : "Wait for the display to move into the next phase."}</p></section></main>`;
  },

  wire(app, { send }) {
    app.querySelectorAll("[data-vault]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "pot_of_greed_vault_action", value: JSON.stringify({ type: button.dataset.vault, amount: Number(button.dataset.amount || 0) }) });
    }));
    app.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => {
      send("lobby_message", { messageType: "pot_of_greed_vote", value: JSON.stringify({ targetId: button.dataset.vote }) });
    }));
  },
};

export { AVATARS };
