export const HAND_LIMIT = 7;

export function buildTurnCleanupPlan(
  player,
  { unusedStarDiscardInstanceIds = [], handLimitDiscardInstanceIds = [] } = {},
) {
  assertCardInstanceIds(unusedStarDiscardInstanceIds, "Unused-star discards");
  assertCardInstanceIds(handLimitDiscardInstanceIds, "Hand-limit discards");

  const unusedStars = Math.max(0, player.stars.available - player.stars.spent);
  if (unusedStarDiscardInstanceIds.length > unusedStars) {
    throw new Error("Cannot discard more cards than unused stars.");
  }

  const handIds = new Set(player.hand.map((card) => card.instanceId));
  requireCardsInHand(handIds, unusedStarDiscardInstanceIds);
  requireCardsInHand(handIds, handLimitDiscardInstanceIds);

  const unusedStarDiscardSet = new Set(unusedStarDiscardInstanceIds);
  if (handLimitDiscardInstanceIds.some((instanceId) => unusedStarDiscardSet.has(instanceId))) {
    throw new Error("Cannot use the same card for both cleanup steps.");
  }

  const remainingHandCount = player.hand.length - unusedStarDiscardInstanceIds.length;
  const handLimitDiscardCount = Math.max(0, remainingHandCount - HAND_LIMIT);
  const selectedHandLimitDiscardCount = handLimitDiscardInstanceIds.length;
  const coveredUnusedStars = unusedStarDiscardInstanceIds.length;
  const uncoveredUnusedStars = unusedStars - coveredUnusedStars;
  const canEndTurn = selectedHandLimitDiscardCount === handLimitDiscardCount;

  return {
    unusedStars,
    coveredUnusedStars,
    uncoveredUnusedStars,
    remainingHandCount,
    handLimitDiscardCount,
    selectedHandLimitDiscardCount,
    canEndTurn,
    payload: {
      unusedStarDiscardInstanceIds,
      handLimitDiscardInstanceIds,
    },
  };
}

function requireCardsInHand(handIds, cardInstanceIds) {
  cardInstanceIds.forEach((instanceId) => {
    if (!handIds.has(instanceId)) throw new Error("Cleanup discards must be cards in hand.");
  });
}

function assertCardInstanceIds(cardInstanceIds, label) {
  if (!Array.isArray(cardInstanceIds)) {
    throw new Error(`${label} must be a list of card instance ids.`);
  }
  const uniqueIds = new Set(cardInstanceIds);
  if (uniqueIds.size !== cardInstanceIds.length) {
    throw new Error(`${label} cannot include duplicate cards.`);
  }
}
