(function exposeAchievementCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamAchievementCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAchievementCore() {
  const SANCTIONED_PLAY_TYPES = new Set(["campaign", "online", "tournament"]);

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

  function detectMatchAchievements({ match, localPlayerId, rolls = [] } = {}) {
    if (!SANCTIONED_PLAY_TYPES.has(match?.playType)) return [];
    const player = completedPlayer(match, localPlayerId);
    if (!player) return [];
    const earned = [];
    if (earnedPerfectGame(match, player)) earned.push("perfect-game");
    if (match.modeId === "classic" && earnedCleanCard(player)) earned.push("clean-card");
    if (match.modeId === "classic" && earnedTurkeyClub(player)) earned.push("turkey-club");
    if (match.modeId === "classic" && earnedComebackKid(match, player)) earned.push("comeback-kid");
    if (earnedSplitDecision(rolls, player.id)) earned.push("split-decision");
    return earned;
  }

  return { detectMatchAchievements };
});
