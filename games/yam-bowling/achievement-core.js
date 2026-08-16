(function exposeAchievementCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamAchievementCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAchievementCore() {
  const SANCTIONED_PLAY_TYPES = new Set(["campaign", "online"]);

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

  function detectMatchAchievements({ match, localPlayerId, rolls = [] } = {}) {
    if (!SANCTIONED_PLAY_TYPES.has(match?.playType)) return [];
    const player = completedPlayer(match, localPlayerId);
    if (!player) return [];
    const earned = [];
    if (earnedPerfectGame(match, player)) earned.push("perfect-game");
    if (match.modeId === "classic" && earnedComebackKid(match, player)) earned.push("comeback-kid");
    if (earnedSplitDecision(rolls, player.id)) earned.push("split-decision");
    return earned;
  }

  return { detectMatchAchievements };
});
