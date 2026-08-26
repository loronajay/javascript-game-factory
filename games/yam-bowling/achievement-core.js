(function exposeAchievementCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamAchievementCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAchievementCore() {
  const SANCTIONED_PLAY_TYPES = new Set(["campaign", "online", "tournament"]);
  // Detection, result presentation, and claim filing all speak in achievement
  // ids. Keep the cosmetic mapping beside the rules so a new title cannot be
  // accidentally rendered as a badge (or a detector added without a reward).
  const MATCH_ACHIEVEMENTS = Object.freeze({
    "perfect-game": "badge:perfect-game",
    "clean-card": "badge:clean-card",
    "turkey-club": "badge:turkey-club",
    "laser-focus": "badge:laser-focus",
    "comeback-kid": "title:comeback-kid",
    "split-decision": "badge:split-decision",
  });
  const ACHIEVEMENT_REWARDS = Object.freeze({
    ...MATCH_ACHIEVEMENTS,
    "precision-bowler": "badge:precision-bowler",
    "lane-legend": "badge:lane-legend",
    "road-tested": "badge:road-tested",
    "deep-bench": "badge:deep-bench",
  });

  function rewardItemIdForAchievement(achievementId) {
    return Object.prototype.hasOwnProperty.call(ACHIEVEMENT_REWARDS, achievementId)
      ? ACHIEVEMENT_REWARDS[achievementId]
      : null;
  }

  function completedPlayer(match, localPlayerId) {
    if (match?.status !== "complete") return null;
    return match.players?.find?.((entry) => entry.id === localPlayerId) || null;
  }

  function earnedPerfectGame(match, player) {
    return match.modeId === "classic" && player?.score?.total === 300;
  }

  function earnedComebackKid(match, player) {
    if (!match.winnerIds?.includes?.(player.id)) return false;
    const opponent = match.players?.find?.((entry) => entry.id !== player.id);
    const playerEnteringTenth = Number(player.score?.cumulative?.[8]);
    const opponentEnteringTenth = Number(opponent?.score?.cumulative?.[8]);
    return Number.isFinite(playerEnteringTenth)
      && Number.isFinite(opponentEnteringTenth)
      && opponentEnteringTenth - playerEnteringTenth >= 30;
  }

  function earnedCleanCard(player) {
    if (!Array.isArray(player?.frames) || player.frames.length !== 10) return false;
    return player.frames.every((frame) => {
      if (!Array.isArray(frame) || frame.length === 0) return false;
      const first = Number(frame[0]);
      const second = Number(frame[1]);
      return first === 10 || (Number.isFinite(first) && Number.isFinite(second) && first + second === 10);
    });
  }

  function earnedTurkeyClub(player) {
    if (!Array.isArray(player?.frames) || player.frames.length !== 10) return false;
    const strikeChances = player.frames.flatMap((frame, index) => (
      index < 9 ? [frame?.[0]] : frame
    ));
    let streak = 0;
    for (const pins of strikeChances) {
      streak = Number(pins) === 10 ? streak + 1 : 0;
      if (streak >= 3) return true;
    }
    return false;
  }

  function samePins(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    const sorted = actual.map(Number).sort((a, b) => a - b);
    return sorted.every((value, index) => value === expected[index]);
  }

  function earnedSplitDecision(rolls, playerId) {
    if (!Array.isArray(rolls)) return false;
    return rolls.some((first) => {
      if (first?.playerId !== playerId || first.rollIndex !== 0 || !samePins(first.standingPinIdsAfter, [7, 10])) return false;
      return rolls.some((second) => second?.playerId === playerId
        && second.frameIndex === first.frameIndex
        && second.rollIndex === 1
        && samePins(second.standingPinIdsAfter, []));
    });
  }

  function earnedLaserFocus(rolls, player) {
    if (!Array.isArray(rolls) || !Array.isArray(player?.frames)) return false;
    const openingBalls = rolls.filter((roll) => roll?.playerId === player.id && roll.rollIndex === 0);
    return openingBalls.length === player.frames.length
      && openingBalls.every((roll) => roll.pocketLine === true);
  }

  function spareOutcomes(player) {
    const outcomes = [];
    const frames = Array.isArray(player?.frames) ? player.frames : [];
    frames.forEach((frame, frameIndex) => {
      if (!Array.isArray(frame) || !Number.isFinite(Number(frame[0]))) return;
      const first = Number(frame[0]);
      const final = frameIndex === frames.length - 1;
      if (first < 10) {
        const second = Number(frame[1]);
        if (Number.isFinite(second)) outcomes.push(first + second === 10);
        return;
      }
      if (final && Number.isFinite(Number(frame[1])) && Number(frame[1]) < 10) {
        const second = Number(frame[1]);
        const third = Number(frame[2]);
        if (Number.isFinite(third)) outcomes.push(second + third === 10);
      }
    });
    return outcomes;
  }

  function summarizeSpareRun(player) {
    const outcomes = spareOutcomes(player);
    let run = 0;
    let best = 0;
    for (const converted of outcomes) {
      run = converted ? run + 1 : 0;
      best = Math.max(best, run);
    }
    let prefix = 0;
    while (outcomes[prefix] === true) prefix += 1;
    let suffix = 0;
    while (outcomes[outcomes.length - 1 - suffix] === true) suffix += 1;
    return {
      spareAttempts: outcomes.length,
      spares: outcomes.filter(Boolean).length,
      sparePrefix: prefix,
      spareSuffix: suffix,
      spareBest: best,
    };
  }

  function summarizeCareerMatch({ match, localPlayerId, laneSlug } = {}) {
    if (!SANCTIONED_PLAY_TYPES.has(match?.playType)) return null;
    const player = completedPlayer(match, localPlayerId);
    if (!player?.characterSlug || typeof laneSlug !== "string" || !laneSlug) return null;
    return {
      trackId: player.characterSlug,
      outcome: match.winnerIds?.length > 1 ? "draw"
        : match.winnerIds?.includes?.(player.id) ? "win" : "loss",
      laneSlug,
      ...summarizeSpareRun(player),
    };
  }

  function detectMatchAchievements({ match, localPlayerId, rolls = [] } = {}) {
    if (!SANCTIONED_PLAY_TYPES.has(match?.playType)) return [];
    const player = completedPlayer(match, localPlayerId);
    if (!player) return [];
    const earned = [];
    if (earnedPerfectGame(match, player)) earned.push("perfect-game");
    if (match.modeId === "classic" && earnedCleanCard(player)) earned.push("clean-card");
    if (match.modeId === "classic" && earnedTurkeyClub(player)) earned.push("turkey-club");
    if (earnedLaserFocus(rolls, player)) earned.push("laser-focus");
    if (match.modeId === "classic" && earnedComebackKid(match, player)) earned.push("comeback-kid");
    if (earnedSplitDecision(rolls, player.id)) earned.push("split-decision");
    return earned;
  }

  return { MATCH_ACHIEVEMENTS, detectMatchAchievements, rewardItemIdForAchievement, summarizeCareerMatch };
});
