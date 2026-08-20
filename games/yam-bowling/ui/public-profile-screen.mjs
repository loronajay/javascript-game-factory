import { $, escapeHtml } from "./dom.mjs";

function stat(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function rateLabel(value) {
  return value === null ? "--" : `${value}%`;
}

function averageLabel(value) {
  return value === null ? "--" : value;
}

export function createPublicProfileScreen({ repository, audio }) {
  let requestId = 0;
  let returnFocus = null;

  function setStatus(message, state = "") {
    const status = $("public-profile-status");
    status.textContent = message;
    status.dataset.state = state;
  }

  function render(model) {
    $("public-profile-content").hidden = false;
    $("public-profile-name").textContent = model.profileName;
    $("public-profile-room-art").src = model.room.src;
    $("public-profile-room-art").alt = model.room.alt;
    $("public-profile-bowler-art").src = model.featuredBowler.art;
    $("public-profile-bowler-art").alt = `${model.featuredBowler.name} in her ${model.featuredBowler.skinName} outfit`;
    $("public-profile-bowler-name").textContent = model.featuredBowler.name;
    $("public-profile-bowler-skin").textContent = `${model.featuredBowler.skinName} outfit`;
    $("public-profile-title").textContent = model.title;
    $("public-profile-badge").textContent = model.badge;
    $("public-profile-player-level").textContent = model.player.level;
    $("public-profile-player-xp").textContent = `${model.player.xp.toLocaleString()} XP`;
    $("public-profile-record").textContent = `${model.career.wins}W ${model.career.losses}L ${model.career.draws}D`;
    $("public-profile-career-stats").innerHTML = [
      stat("Matches", model.career.matches),
      stat("Win rate", `${model.career.winRate}%`),
      stat("Ranked rating", model.competitive.label),
      stat("Quick avg", averageLabel(model.career.quick.averageScore)),
      stat("Classic avg", averageLabel(model.career.classic.averageScore)),
      stat("Strike rate", rateLabel(model.career.strikeRate)),
      stat("Spare rate", rateLabel(model.career.spareRate)),
      stat("Bowlers used", model.career.bowlersUsed),
    ].join("");
    $("public-profile-mastery-name").textContent = `${model.featuredBowler.name.split(" ")[0]} mastery`;
    $("public-profile-mastery-level").textContent = model.mastery.level;
    $("public-profile-mastery-progress").style.width = `${model.mastery.progressPercent || 0}%`;
    $("public-profile-mastery-xp").textContent = model.mastery.isMaxLevel
      ? `${model.mastery.xp.toLocaleString()} XP - max level`
      : `${model.mastery.xpIntoLevel.toLocaleString()} / ${model.mastery.xpForNextLevel.toLocaleString()} XP to next level`;
    $("public-profile-bowler-stats").innerHTML = [
      stat("Matches", model.mastery.matches),
      stat("Wins", model.mastery.wins),
      stat("Strikes", model.mastery.strikes),
      stat("High game", model.mastery.highGame || "--"),
    ].join("");
  }

  async function open(playerId, profileName, focusTarget = null) {
    const currentRequest = ++requestId;
    returnFocus = focusTarget || document.activeElement;
    $("public-profile-name").textContent = profileName || "Factory Bowler";
    $("public-profile-content").hidden = true;
    setStatus("Loading public profile");
    const dialog = $("public-profile-dialog");
    if (!dialog.open) dialog.showModal();
    audio?.play?.("popup");

    const model = await repository.load(playerId, profileName);
    if (currentRequest !== requestId || !dialog.open) return false;
    if (!model) {
      setStatus("Public profile unavailable", "error");
      return false;
    }
    render(model);
    setStatus("Public Factory profile", "saved");
    return true;
  }

  function close() {
    requestId += 1;
    $("public-profile-dialog").close();
  }

  function bind() {
    $("public-profile-close").addEventListener("click", close);
    $("public-profile-dialog").addEventListener("close", () => {
      returnFocus?.focus?.();
      returnFocus = null;
    });
  }

  return { bind, close, open };
}
