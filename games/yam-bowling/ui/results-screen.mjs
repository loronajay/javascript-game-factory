import { $, escapeHtml, showScreen } from "./dom.mjs";

// Everything the player sees when a roll or a match lands: the pin callout, the
// celebration pose over the lane, and the final results screen.
// `onShown` fires once the results are painted, which is where the online
// session files the match to the player's Factory record. Reporting is not this
// module's job, but every path that reaches results must trigger it, so the hook
// lives at the single place results are shown rather than at each caller.
export function createResultsScreen({
  session,
  core,
  assets,
  audio,
  audioCore,
  cosmetics,
  localClientId = () => "",
  onOpenProfile = () => {},
  onShown,
}) {
  function showCalloutPose(outcomeCue) {
    const pose = $("callout-pose");
    const art = $("callout-pose-art");
    const player = session.activePlayer();
    const source = player
      ? assets.calloutPose(player.characterSlug, outcomeCue, session.playerSkinId(player))
      : null;
    if (!source) {
      hideCalloutPose();
      return;
    }
    // A skin whose celebration art has not shipped yet still gets the canon pose.
    art.onerror = () => {
      const canonSource = assets.calloutPose(player.characterSlug, outcomeCue);
      if (canonSource && !art.src.endsWith(canonSource)) {
        art.src = canonSource;
        return;
      }
      pose.classList.remove("is-visible");
      art.removeAttribute("src");
      pose.hidden = true;
    };
    pose.hidden = false;
    art.src = source;
    pose.classList.add("is-visible");
  }

  function hideCalloutPose() {
    const pose = $("callout-pose");
    if (pose.classList.contains("is-visible")) pose.classList.remove("is-visible");
  }

  function preloadCalloutPoses(player) {
    if (!player) return;
    for (const cue of ["strike", "spare"]) {
      const source = assets.calloutPose(player.characterSlug, cue, session.playerSkinId(player));
      if (source) new Image().src = source;
    }
  }

  function showCallout(knocked, startedStanding) {
    const cleared = knocked === startedStanding;
    const firstRoll = session.frameRollNumber() === 1;
    let big = `${knocked} pins`;
    let small = "Keep working the rack";
    if (cleared && startedStanding === 10 && firstRoll) { big = "Strike!"; small = "Clean pocket hit"; }
    else if (cleared && startedStanding < 10) { big = "Spare!"; small = "Every pin accounted for"; }
    else if (knocked === 0) { big = "Gutter"; small = "Reset the line"; }
    else if (knocked >= 8) { big = "Great ball"; small = `${knocked} pins down`; }
    $("callout").querySelector("strong").textContent = big;
    $("callout").querySelector("span").textContent = small;
    session.calloutTime = 1.15;
    const cue = audioCore.getOutcomeCue(knocked, startedStanding, firstRoll);
    showCalloutPose(cue);
    audio.play(cue, { intensity: 0.65 + knocked / 15 });
  }

  function showResults() {
    const { match } = session;
    const tie = match.winnerIds.length > 1;
    const winner = match.players.find((player) => match.winnerIds.includes(player.id));
    $("results-title").textContent = tie ? "Dead heat!" : `${winner.name} wins!`;
    $("results-subtitle").textContent = `${core.MODES[match.modeId].name}. ${tie ? "Nothing between them." : "The rack has spoken."}`;
    const host = $("results-players");
    $("match-achievements").hidden = true;
    host.innerHTML = "";
    match.players.forEach((player) => {
      const isWinner = match.winnerIds.includes(player.id);
      const outcome = isWinner ? "victory" : "defeat";
      const outcomeLabel = tie ? "Tied for first" : isWinner ? "Victory" : "Defeat";
      const bowler = assets.bowlerBySlug(player.characterSlug);
      // An opponent across the wire wears what their own device equipped, so an
      // outcome pose equipped here applies only to bowlers on this one.
      const remote = Boolean(session.onlineMatch) && player.id !== localClientId();
      const inspectable = remote && Boolean(player.accountPlayerId);
      const profileAction = inspectable
        ? `<button class="result-player__profile" type="button" data-public-profile-id="${escapeHtml(player.accountPlayerId)}">View profile</button>`
        : "";
      const card = document.createElement("article");
      card.className = `result-player ${isWinner ? "is-winner" : "is-defeated"}`;
      card.innerHTML = `
        <div class="result-player__portrait">
          <img src="${assets.resultPortrait(player.characterSlug, outcome, session.playerSkinId(player), {
            remote,
            poseId: player.presentation?.victoryPoseId || null,
          })}" alt="${bowler.name}, ${outcomeLabel.toLowerCase()}">
          <span class="result-player__outcome">${outcomeLabel}</span>
        </div>
        <div class="result-player__details">
          <strong>${escapeHtml(player.name)}</strong>
          ${profileAction}
          <span class="result-player__score"><small>Final score</small><b>${player.score.total}</b></span>
        </div>`;
      card.querySelector("[data-public-profile-id]")?.addEventListener("click", (event) => {
        onOpenProfile(player.accountPlayerId, player.name, event.currentTarget);
      });
      host.appendChild(card);
    });
    showScreen("results-screen");
    audio.play("win");
    onShown();
  }

  function showAchievements(achievementIds = []) {
    const rewards = achievementIds.map((achievementId) => {
      const itemId = achievementId === "comeback-kid" ? "title:comeback-kid" : `badge:${achievementId}`;
      return cosmetics?.getItem?.(itemId);
    }).filter(Boolean);
    if (!rewards.length) return;
    $("match-achievements-title").textContent = rewards.length === 1
      ? rewards[0].name
      : `${rewards.length} achievements earned`;
    $("match-achievements-rewards").innerHTML = rewards.map((item) => `
      <span><img src="${escapeHtml(item.assets?.art || item.assets?.thumbnail || "")}" alt="" /><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.type)}</small></span>
    `).join("");
    $("match-achievements").hidden = false;
    audio.play("confirm");
  }

  return { showAchievements, showCallout, showCalloutPose, hideCalloutPose, preloadCalloutPoses, showResults };
}
