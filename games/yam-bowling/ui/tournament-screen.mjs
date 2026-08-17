import { $, escapeHtml, showScreen } from "./dom.mjs";

const CPU_LEVEL_NAMES = Object.freeze({
  competitive: "Competitive",
  pro: "Pro",
  champion: "Champion",
});

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function tournamentBracketMarkup(state, assets, playerSlug) {
  const rounds = state?.event?.rounds || [];
  const completed = new Set(state?.completedRoundIndexes || []);
  const activeRound = state?.champion ? null : rounds.find((round) => !completed.has(round.index));
  const player = assets.bowlerBySlug(playerSlug);

  const route = rounds.map((round, position) => {
    const cleared = completed.has(round.index);
    const current = activeRound?.index === round.index;
    const status = cleared ? "cleared" : current ? "current" : "locked";
    const reached = cleared || current || state?.champion;
    const opponent = assets.bowlerBySlug(round.opponentSlug);
    const playerSource = reached
      ? `<img src="${escapeHtml(assets.characterPortrait(playerSlug, assets.storedSkinId(playerSlug)))}" alt="">`
      : `<span class="tournament-bracket-placeholder" aria-hidden="true">?</span>`;
    const playerName = reached
      ? player.name
      : `${rounds[position - 1]?.name || "Previous round"} winner`;
    const statusCopy = cleared ? "Advanced" : current ? "On deck" : "Awaiting winner";

    return `
      <li class="tournament-bracket-round">
        <article data-round="${round.index}" class="tournament-matchup is-${status}" aria-label="${escapeHtml(round.name)}: ${escapeHtml(statusCopy)}">
          <header><span>${escapeHtml(round.name)}</span><b>${statusCopy}</b></header>
          <div class="tournament-entrant tournament-entrant--player">
            ${playerSource}
            <span><small>${reached ? "Your entry" : "Advancing entry"}</small><strong>${escapeHtml(playerName)}</strong></span>
            <i>${cleared ? "W" : current ? "•" : "—"}</i>
          </div>
          <div class="tournament-matchup-divider"><span>VS</span></div>
          <div class="tournament-entrant tournament-entrant--rival">
            <img src="${escapeHtml(assets.characterPortrait(round.opponentSlug, assets.storedSkinId(round.opponentSlug)))}" alt="">
            <span><small>Seeded rival</small><strong>${escapeHtml(opponent.name)}</strong></span>
            <i>${cleared ? "L" : "—"}</i>
          </div>
        </article>
        <div class="tournament-bracket-connector${cleared ? " is-cleared" : ""}" aria-hidden="true"><i></i><span></span><b></b></div>
      </li>`;
  }).join("");

  return `${route}
    <li class="tournament-champion-destination${state?.champion ? " is-crowned" : ""}">
      <span class="tournament-crown" aria-hidden="true">♛</span>
      <small>${state?.champion ? "Tournament complete" : "Final destination"}</small>
      <strong>${state?.champion ? escapeHtml(player.name) : "Crown the champion"}</strong>
      <i>${state?.champion ? "UNDISPUTED" : "ONE ENTRY REMAINS"}</i>
    </li>`;
}

export function createTournamentScreen({
  session,
  client,
  campaignStore,
  assets,
  laneCore,
  audio,
  accountAccess,
  getMatchRuntime,
}) {
  let filingResult = false;
  let lastResultWon = false;

  function currentRound(state = client.getState()) {
    if (state?.status !== "open" || state.champion) return null;
    const completed = new Set(state.completedRoundIndexes || []);
    return state.event?.rounds?.find((round) => !completed.has(round.index)) || null;
  }

  function renderBracket(state) {
    const playerSlug = campaignStore.getSelectedBowlerSlug();
    const bracket = $("tournament-bracket");
    bracket.innerHTML = tournamentBracketMarkup(state, assets, playerSlug);
    const bracketScroll = bracket.parentElement;
    const currentMatchup = bracket.querySelector(".tournament-matchup.is-current");
    if (currentMatchup && bracketScroll.scrollWidth > bracketScroll.clientWidth) {
      bracketScroll.scrollLeft = Math.max(0, currentMatchup.offsetLeft - 16);
    }
    const complete = (state.completedRoundIndexes || []).length;
    $("tournament-progress-copy").textContent = state.champion
      ? "The bracket is yours"
      : `${complete} of ${state.event?.rounds?.length || 0} rounds cleared`;
  }

  function renderRoster() {
    const selectedSlug = campaignStore.getSelectedBowlerSlug();
    const unlocked = campaignStore.getUnlockedBowlerSlugs();
    const host = $("tournament-roster");
    host.innerHTML = "";
    for (const slug of unlocked) {
      const bowler = assets.bowlerBySlug(slug);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tournament-entry-option${slug === selectedSlug ? " is-selected" : ""}`;
      button.dataset.tournamentBowler = slug;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", slug === selectedSlug ? "true" : "false");
      button.innerHTML = `<img src="${assets.characterPortrait(slug, assets.storedSkinId(slug))}" alt=""><span>${escapeHtml(bowler.name)}</span>`;
      button.addEventListener("click", () => {
        if (!campaignStore.selectBowler(slug)) return;
        audio.play("select");
        render();
      });
      host.appendChild(button);
    }
    $("tournament-selected-label").textContent = assets.bowlerBySlug(selectedSlug).name.split(" ")[0];
  }

  function render() {
    const state = client.getState();
    if (!state?.event) return;
    const round = currentRound(state) || state.event.rounds.at(-1);
    const playerSlug = campaignStore.getSelectedBowlerSlug();
    const player = assets.bowlerBySlug(playerSlug);
    const opponent = assets.bowlerBySlug(round.opponentSlug);
    const venue = laneCore.getLane(round.venueSlug);
    const closed = state.status !== "open";

    $("tournament-title").textContent = state.event.name;
    $("tournament-window").textContent = closed
      ? `Opens ${formatDate(state.event.startsAt)} UTC`
      : `${formatDate(state.event.startsAt)}–${formatDate(state.event.endsAt)} UTC`;
    $("tournament-status-seal").textContent = state.champion ? "Champion" : closed ? "Entries closed" : "Entries open";
    $("tournament-event-edition").textContent = state.event.shortName || "Yam Major";
    $("tournament-round-label").textContent = state.champion
      ? "Bracket complete"
      : closed ? "Next tournament" : `Round ${round.index + 1} of ${state.event.rounds.length}`;
    $("tournament-round-name").textContent = state.champion ? `${state.event.shortName} Champion` : round.name;
    $("tournament-event-format").textContent = round.modeId === "classic" ? "10F" : "3F";
    $("tournament-player-name").textContent = player.name;
    $("tournament-player-art").src = assets.characterPortrait(playerSlug, assets.storedSkinId(playerSlug));
    $("tournament-player-art").alt = `${player.name}, tournament entry`;
    $("tournament-opponent-name").textContent = opponent.name;
    $("tournament-opponent-art").src = assets.characterPortrait(round.opponentSlug, assets.storedSkinId(round.opponentSlug));
    $("tournament-opponent-art").alt = `${opponent.name}, tournament opponent`;
    $("tournament-rival-line").textContent = round.cpuLevelId === "champion"
      ? "The final is regulation length. The CPU champion gives away almost nothing."
      : "Win this match to advance. A loss leaves the round open for another attempt.";
    $("tournament-venue-name").textContent = venue.name;
    $("tournament-difficulty").textContent = CPU_LEVEL_NAMES[round.cpuLevelId] || round.cpuLevelId;
    $("tournament-prize-name").textContent = state.champion && state.prize?.name
      ? state.prize.name
      : "Weighted cosmetic roll";
    const start = $("start-tournament-match");
    start.disabled = closed || state.champion;
    start.textContent = state.champion ? "Tournament won" : closed ? `Opens ${formatDate(state.event.startsAt)}` : `Bowl ${round.name.toLowerCase()}`;
    renderBracket(state);
    renderRoster();
  }

  function setSyncStatus(message, state = "") {
    const status = $("tournament-sync-status");
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  async function open() {
    if (!accountAccess.requireFactoryAccount()) return false;
    setSyncStatus("Checking tournament desk");
    if (!await client.sync()) {
      setSyncStatus("Tournament schedule is unavailable. Return to the title and try again.", "error");
      showScreen("tournament-screen");
      return false;
    }
    render();
    setSyncStatus("");
    showScreen("tournament-screen");
    return true;
  }

  function beginCurrentRound() {
    const state = client.getState();
    const round = currentRound(state);
    if (!round || !accountAccess.requireFactoryAccount()) return false;
    const playerSlug = campaignStore.getSelectedBowlerSlug();
    session.setup.modeId = round.modeId;
    session.setup.playType = "tournament";
    session.setup.cpuLevelId = round.cpuLevelId;
    session.setup.activeSlot = 0;
    session.setup.characterSlugs = [playerSlug, round.opponentSlug];
    session.setup.skinIds = [assets.storedSkinId(playerSlug), assets.storedSkinId(round.opponentSlug)];
    session.campaignMatch = null;
    session.tournamentMatch = {
      eventId: state.event.id,
      roundIndex: round.index,
      playerBowlerSlug: playerSlug,
      venueSlug: round.venueSlug,
      opponentSlug: round.opponentSlug,
    };
    getMatchRuntime().startMatch();
    return true;
  }

  async function handleResultsShown() {
    if (!session.tournamentMatch || !session.match) return null;
    const won = session.match.winnerIds.length === 1 && session.match.winnerIds[0] === "p1";
    const opponent = assets.bowlerBySlug(session.tournamentMatch.opponentSlug);
    const panel = $("campaign-result");
    panel.hidden = false;
    panel.classList.toggle("is-defeat", !won);
    lastResultWon = won;
    if (!won) {
      $("campaign-result-stamp").textContent = "Bracket held";
      $("campaign-result-kicker").textContent = "Tournament round incomplete";
      $("campaign-result-title").textContent = `${opponent.name} advances for now`;
      $("campaign-result-copy").textContent = "Your entry remains active. Retry this round while the tournament is open.";
      $("rematch-button").textContent = "Retry round";
      $("change-match-button").textContent = "Tournament desk";
      return { ok: true, won: false };
    }

    filingResult = true;
    $("rematch-button").disabled = true;
    $("campaign-result-stamp").textContent = "Filing win";
    $("campaign-result-kicker").textContent = "Official tournament bracket";
    $("campaign-result-title").textContent = "Confirming round victory…";
    $("campaign-result-copy").textContent = "The next round and any championship prize come from the Factory record.";
    const result = await client.claimRound({
      eventId: session.tournamentMatch.eventId,
      roundIndex: session.tournamentMatch.roundIndex,
      bowlerSlug: session.tournamentMatch.playerBowlerSlug,
    });
    filingResult = false;
    $("rematch-button").disabled = false;
    if (!result.ok) {
      lastResultWon = false;
      $("campaign-result-stamp").textContent = "Win unfiled";
      $("campaign-result-kicker").textContent = "Tournament progress unavailable";
      $("campaign-result-title").textContent = "Round victory needs confirmation";
      $("campaign-result-copy").textContent = "Reconnect and retry the round. No bracket progress or prize was invented locally.";
      $("rematch-button").textContent = "Retry round";
    } else if (result.prize) {
      $("campaign-result-stamp").textContent = "Champion";
      $("campaign-result-kicker").textContent = "Tournament prize awarded";
      $("campaign-result-title").textContent = result.prize.name;
      $("campaign-result-copy").textContent = "You also earned the Yam Champion title. Both rewards are ready in My Room.";
      $("rematch-button").textContent = "View bracket";
    } else {
      $("campaign-result-stamp").textContent = "Advanced";
      $("campaign-result-kicker").textContent = "Bracket updated";
      $("campaign-result-title").textContent = `${opponent.name} eliminated`;
      $("campaign-result-copy").textContent = "The next CPU opponent is waiting at the tournament desk.";
      $("rematch-button").textContent = "Next round";
    }
    $("change-match-button").textContent = "Tournament desk";
    return result;
  }

  function returnToTournament() {
    session.tournamentMatch = null;
    $("campaign-result").hidden = true;
    open();
  }

  function handlePrimaryResultAction() {
    if (filingResult) return false;
    if (lastResultWon) returnToTournament();
    else getMatchRuntime().startMatch();
    return true;
  }

  function leaveToTitle() {
    session.tournamentMatch = null;
    $("campaign-result").hidden = true;
    showScreen("title-screen");
  }

  function bind() {
    $("start-tournament-match").addEventListener("click", beginCurrentRound);
  }

  return { beginCurrentRound, bind, handlePrimaryResultAction, handleResultsShown, leaveToTitle, open, render, returnToTournament };
}
