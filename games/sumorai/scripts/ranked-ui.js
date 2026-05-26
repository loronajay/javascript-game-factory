function formatRankedRecord(rating = {}) {
  const wins = rating.wins ?? 0;
  const losses = rating.losses ?? 0;
  const draws = rating.draws ?? 0;
  return `${wins}W / ${losses}L / ${draws}D`;
}

function formatRankedWinRate(rating = {}) {
  const wins = rating.wins ?? 0;
  const losses = rating.losses ?? 0;
  const draws = rating.draws ?? 0;
  const total = wins + losses + draws;
  return total > 0 ? `${Math.round((wins / total) * 100)}% win rate` : '';
}

function renderRankedResultRating(documentRef, rating) {
  const wrapper = documentRef.getElementById('ranked-result-rating');
  const value = documentRef.getElementById('ranked-result-value');
  const record = documentRef.getElementById('ranked-result-record');
  if (!wrapper || !value || !record || !rating) return false;

  value.textContent = `Rating: ${rating.rating}`;
  record.textContent = formatRankedRecord(rating);
  wrapper.hidden = false;
  return true;
}

function renderRankedProfileSignedOut(documentRef) {
  setText(documentRef, 'ranked-rating-num', '\u2014');
  setText(documentRef, 'ranked-record', 'Sign in to track your rating.');
  setText(documentRef, 'ranked-winrate', '');
}

function renderRankedProfileLoading(documentRef) {
  setText(documentRef, 'ranked-rating-num', '\u2026');
  setText(documentRef, 'ranked-record', '');
  setText(documentRef, 'ranked-winrate', '');
}

function renderRankedProfileRating(documentRef, rating) {
  setText(documentRef, 'ranked-rating-num', String(rating.rating ?? 1200));
  setText(documentRef, 'ranked-record', formatRankedRecord(rating));
  setText(documentRef, 'ranked-winrate', formatRankedWinRate(rating));
}

function renderRankedProfileDefault(documentRef) {
  setText(documentRef, 'ranked-rating-num', '1200');
  setText(documentRef, 'ranked-record', '0W / 0L / 0D');
  setText(documentRef, 'ranked-winrate', '');
}

function renderRankedProfileError(documentRef) {
  setText(documentRef, 'ranked-rating-num', '\u2014');
  setText(documentRef, 'ranked-record', 'Could not load rating.');
  setText(documentRef, 'ranked-winrate', '');
}

function setText(documentRef, id, text) {
  const node = documentRef.getElementById(id);
  if (node) node.textContent = text;
}

export {
  formatRankedRecord,
  formatRankedWinRate,
  renderRankedProfileDefault,
  renderRankedProfileError,
  renderRankedProfileLoading,
  renderRankedProfileRating,
  renderRankedProfileSignedOut,
  renderRankedResultRating,
};
