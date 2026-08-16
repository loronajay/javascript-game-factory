import { $, showScreen } from "./dom.mjs";

const CPU_LEVEL_NAMES = Object.freeze({
  rookie: "Rookie",
  casual: "Casual",
  competitive: "Competitive",
  pro: "Pro",
  champion: "Champion",
});

// The registration counter owns the persistent circuit surface: standings,
// the next sanctioned rival, and the roster earned from circuit achievements.
// Tournament brackets and equipment/profile rooms deliberately live elsewhere.
export function createCircuitScreen({
  session,
  campaign,
  store,
  assets,
  laneCore,
  audio,
  getMatchRuntime,
}) {
  let lastResultWon = false;

  function currentDivision(currentMatch = store.getCurrentMatch()) {
    const id = currentMatch?.divisionId || campaign.DIVISIONS.at(-1).id;
    return campaign.DIVISIONS.find((division) => division.id === id) || campaign.DIVISIONS[0];
  }

  function renderDivisionRail(activeDivision) {
    const host = $("circuit-division-rail");
    const activeIndex = campaign.DIVISIONS.findIndex((division) => division.id === activeDivision.id);
    host.innerHTML = "";
    campaign.DIVISIONS.forEach((division, index) => {
      const progress = store.getDivisionProgress(division.id);
      const step = document.createElement("div");
      step.className = `circuit-division-step${index === activeIndex ? " is-current" : ""}${progress.cleared === progress.total ? " is-cleared" : ""}`;
      step.innerHTML = `<b>${String(index + 1).padStart(2, "0")}</b><span>${division.shortName}</span><small>${progress.cleared}/${progress.total}</small>`;
      host.appendChild(step);
    });
  }

  function renderProgress(division) {
    const progress = store.getDivisionProgress(division.id);
    const host = $("circuit-progress");
    host.innerHTML = "";
    for (let index = 0; index < progress.total; index += 1) {
      const mark = document.createElement("i");
      mark.className = index < progress.cleared ? "is-cleared" : index === progress.cleared ? "is-current" : "";
      host.appendChild(mark);
    }
    return progress;
  }

  function renderRoster() {
    const selectedSlug = store.getSelectedBowlerSlug();
    const unlocked = store.getUnlockedBowlerSlugs();
    const host = $("circuit-roster");
    host.innerHTML = "";
    for (const slug of unlocked) {
      const bowler = assets.bowlerBySlug(slug);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `circuit-roster-entry${slug === selectedSlug ? " is-selected" : ""}`;
      button.dataset.circuitBowler = slug;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(slug === selectedSlug));
      button.innerHTML = `<img src="${assets.characterPortrait(slug, assets.storedSkinId(slug))}" alt=""><span>${bowler.name}</span>`;
      button.addEventListener("click", () => {
        if (!store.selectBowler(slug)) return;
        audio.play("select");
        render();
      });
      host.appendChild(button);
    }
    const selected = assets.bowlerBySlug(selectedSlug);
    $("circuit-selected-label").textContent = selected.name.split(" ")[0];
    $("circuit-player-name").textContent = selected.name;
    $("circuit-player-art").src = assets.characterPortrait(selectedSlug, assets.storedSkinId(selectedSlug));
    $("circuit-player-art").alt = `${selected.name}, selected circuit bowler`;
    $("circuit-roster-count").textContent = `${unlocked.length} / 30`;
  }

  function renderEvent(match) {
    const button = $("start-circuit-match");
    if (!match) {
      $("circuit-event-number").textContent = "Circuit complete";
      $("circuit-event-title").textContent = "The Yam Crown is yours";
      $("circuit-rival-line").textContent = "Every sanctioned rival has been cleared. Championship events are next.";
      $("circuit-event-format").textContent = "CROWN";
      $("circuit-difficulty").textContent = "Complete";
      button.textContent = "Circuit complete";
      button.disabled = true;
      return;
    }

    const opponent = assets.bowlerBySlug(match.opponentSlug);
    const venue = laneCore.getLane(match.venueSlug);
    const matchNumber = campaign.CIRCUIT_MATCHES.findIndex((entry) => entry.id === match.id) + 1;
    $("circuit-event-number").textContent = `Sanctioned match ${String(matchNumber).padStart(2, "0")}`;
    $("circuit-event-title").textContent = match.title;
    $("circuit-event-format").textContent = match.modeId === "classic" ? "10F" : "3F";
    $("circuit-opponent-name").textContent = opponent.name;
    $("circuit-opponent-art").src = assets.characterPortrait(match.opponentSlug, assets.storedSkinId(match.opponentSlug));
    $("circuit-opponent-art").alt = `${opponent.name}, registered circuit rival`;
    $("circuit-rival-line").textContent = `“${match.rivalLine}”`;
    $("circuit-venue-name").textContent = venue.name;
    $("circuit-difficulty").textContent = CPU_LEVEL_NAMES[match.cpuLevelId] || match.cpuLevelId;
    $("circuit-achievement-title").textContent = match.achievement.title;
    $("circuit-character-reward").textContent = `${opponent.name} · Character`;
    button.textContent = match.isPromotionMatch ? "Bowl promotion match" : "Bowl sanctioned match";
    button.disabled = false;
  }

  function render() {
    const snapshot = store.getSnapshot();
    const match = store.getCurrentMatch();
    const division = currentDivision(match);
    const progress = renderProgress(division);
    const divisionIndex = campaign.DIVISIONS.findIndex((entry) => entry.id === division.id);

    $("circuit-division-name").textContent = division.name;
    $("circuit-rank").textContent = divisionIndex === 0 ? "Provisional" : `${division.shortName} ${progress.cleared + 1}`;
    $("circuit-achievement-count").textContent = `${snapshot.earnedAchievementIds.length} / ${campaign.CIRCUIT_MATCHES.length}`;
    renderDivisionRail(division);
    renderRoster();
    renderEvent(match);
  }

  function open() {
    render();
    showScreen("circuit-screen");
  }

  function beginCurrentMatch() {
    const match = store.getCurrentMatch();
    if (!match) return false;
    const playerSlug = store.getSelectedBowlerSlug();
    session.setup.modeId = match.modeId;
    session.setup.playType = "cpu";
    session.setup.cpuLevelId = match.cpuLevelId;
    session.setup.activeSlot = 0;
    session.setup.characterSlugs = [playerSlug, match.opponentSlug];
    session.setup.skinIds = [assets.storedSkinId(playerSlug), assets.storedSkinId(match.opponentSlug)];
    session.campaignMatch = {
      matchId: match.id,
      venueSlug: match.venueSlug,
      opponentSlug: match.opponentSlug,
      achievementId: match.achievement.id,
    };
    const matchRuntime = getMatchRuntime();
    matchRuntime.startMatch();
    return true;
  }

  function handleResultsShown() {
    if (!session.campaignMatch || !session.match) {
      $("campaign-result").hidden = true;
      $("rematch-button").textContent = "Rematch";
      $("change-match-button").textContent = "Change match";
      return null;
    }
    const won = session.match.winnerIds.length === 1 && session.match.winnerIds[0] === "p1";
    const result = store.recordMatchResult(session.campaignMatch.matchId, { won });
    const opponent = assets.bowlerBySlug(session.campaignMatch.opponentSlug);
    const panel = $("campaign-result");
    lastResultWon = won;
    panel.hidden = false;
    panel.classList.toggle("is-defeat", !won);

    if (won && result.firstClear) {
      $("campaign-result-stamp").textContent = "Achievement cleared";
      $("campaign-result-kicker").textContent = "Circuit roster updated";
      $("campaign-result-title").textContent = result.achievement.title;
      $("campaign-result-copy").textContent = `${opponent.name} is now available for circuit entry.`;
    } else if (won) {
      $("campaign-result-stamp").textContent = "Win confirmed";
      $("campaign-result-kicker").textContent = "Sanctioned result";
      $("campaign-result-title").textContent = "Circuit victory";
      $("campaign-result-copy").textContent = `${opponent.name}'s achievement was already on your tour card.`;
    } else {
      $("campaign-result-stamp").textContent = "Result filed";
      $("campaign-result-kicker").textContent = "Circuit match incomplete";
      $("campaign-result-title").textContent = `${opponent.name} holds the lane`;
      $("campaign-result-copy").textContent = "No achievement was awarded. Retry the sanctioned match when ready.";
    }

    $("rematch-button").textContent = won ? "Continue circuit" : "Retry match";
    $("change-match-button").textContent = "Circuit desk";
    return result;
  }

  function returnToCircuit() {
    session.campaignMatch = null;
    $("campaign-result").hidden = true;
    open();
  }

  function handlePrimaryResultAction() {
    if (lastResultWon) returnToCircuit();
    else getMatchRuntime().startMatch();
  }

  function leaveToTitle() {
    session.campaignMatch = null;
    $("campaign-result").hidden = true;
    showScreen("title-screen");
  }

  function bind() {
    $("start-circuit-match").addEventListener("click", beginCurrentMatch);
  }

  return {
    beginCurrentMatch,
    bind,
    handlePrimaryResultAction,
    handleResultsShown,
    leaveToTitle,
    open,
    render,
    returnToCircuit,
  };
}
