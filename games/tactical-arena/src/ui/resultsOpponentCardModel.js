// Pure view-model + record math for the post-match opponent ranked card. Split out of
// resultsOpponentCard.js so that file stays a thin renderer: this module owns how a
// finished ranked duel's identity/record is shaped from the match-local identity
// exchange, how a freshly fetched server card is merged over that fallback, and how a
// still-stale record is optimistically bumped to reflect the just-finished result.

function clean(value) { return typeof value === "string" ? value.trim() : ""; }

function preferredName(card, fallback = "") {
  const name = clean(card?.displayName) || clean(card?.profileName) || clean(card?.pilotName);
  return name && !/^(commander|ranked rival)$/i.test(name) ? name : fallback;
}

export function cardName(card) {
  return clean(card.displayName) || clean(card.profileName) || clean(card.pilotName) || clean(card.name) || clean(card.title) || "Ranked Rival";
}

function recordOf(card) {
  return { wins: Number(card?.wins) || 0, losses: Number(card?.losses) || 0, draws: Number(card?.draws) || 0 };
}

function bumpIfStale(card, preMatchRecord, outcome) {
  const record = recordOf(card);
  const stale = preMatchRecord
    && record.wins === preMatchRecord.wins
    && record.losses === preMatchRecord.losses
    && record.draws === preMatchRecord.draws;
  if (!outcome || !stale) return card;
  const next = { ...card };
  if (outcome === "win") next.losses += 1;
  else if (outcome === "loss") next.wins += 1;
  else if (outcome === "draw") next.draws += 1;
  return next;
}

// Build the opponent card straight from the match-local identity exchange, so an
// offline or stale platform read still renders the opponent's pilot name and the
// just-finished result.
export function opponentCardFromMatch(ranked, { net = null, mySeat = null, outcome = null } = {}) {
  const profile = net?.profileForSeat?.(Number(mySeat) === 1 ? 2 : 1) || {};
  const rp = profile.rankedProfile || {};
  const base = recordOf(rp);
  const preMatchRecord = profile.rankedProfile ? base : null;
  return {
    outcome,
    preMatchRecord,
    card: bumpIfStale({
      playerId: ranked?.opponentPlayerId,
      displayName: profile.displayName,
      title: rp.title || rp.tagline || null,
      avatarUnit: rp.avatarUnit || null,
      avatarSkin: rp.avatarSkin || null,
      tier: rp.tier || null,
      rating: rp.rating,
      ...base,
    }, preMatchRecord, outcome),
  };
}

// Merge a freshly fetched server card over the match-local fallback, preferring a real
// display name and re-bumping the record if the server has not yet counted this match.
export function mergeFetchedCard(card, matchCard) {
  const merged = { ...matchCard.card, ...(card || {}) };
  merged.displayName = preferredName(card, matchCard.card.displayName);
  return bumpIfStale(merged, matchCard.preMatchRecord, matchCard.outcome);
}
