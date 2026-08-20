function safeCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function sum(tracks, field) {
  return tracks.reduce((total, track) => total + safeCount(track?.[field]), 0);
}

function best(tracks, field) {
  return tracks.reduce((highest, track) => Math.max(highest, safeCount(track?.[field])), 0);
}

function rate(value, opportunities) {
  return opportunities ? Math.round((value / opportunities) * 1000) / 10 : null;
}

function formatBook(tracks, mode) {
  const games = sum(tracks, `${mode}Games`);
  const totalScore = sum(tracks, `${mode}TotalScore`);
  return {
    games,
    averageScore: games ? Math.round((totalScore / games) * 10) / 10 : null,
    highGame: best(tracks, `${mode}HighGame`),
  };
}

export function aggregateCareerStats(rawTracks = []) {
  const tracks = Array.isArray(rawTracks) ? rawTracks : [];
  const matches = sum(tracks, "matches");
  const wins = sum(tracks, "wins");
  const draws = sum(tracks, "draws");
  const strikes = sum(tracks, "strikes");
  const strikeOpportunities = sum(tracks, "quickStrikeOpportunities")
    + sum(tracks, "classicStrikeOpportunities");
  const measuredStrikes = sum(tracks, "quickStrikes") + sum(tracks, "classicStrikes");
  const spareOpportunities = sum(tracks, "quickSpareOpportunities")
    + sum(tracks, "classicSpareOpportunities");
  const spares = sum(tracks, "quickSpares") + sum(tracks, "classicSpares");

  return {
    matches,
    wins,
    draws,
    losses: Math.max(0, matches - wins - draws),
    winRate: matches ? Math.round((wins / matches) * 100) : 0,
    strikes,
    highGame: best(tracks, "highGame"),
    strikeRate: rate(measuredStrikes, strikeOpportunities),
    spareRate: rate(spares, spareOpportunities),
    quick: formatBook(tracks, "quick"),
    classic: formatBook(tracks, "classic"),
  };
}
