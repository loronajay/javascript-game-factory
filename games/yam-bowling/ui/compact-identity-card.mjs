import { escapeHtml } from "./dom.mjs";

export function compactIdentityCardMarkup(model, {
  local = false,
  connected = true,
  inspectable = false,
} = {}) {
  const status = `${local ? "You · " : ""}${connected ? "Ready" : "Reconnecting"}`;
  const playerLevel = model.profileAvailable === false ? "--" : model.playerLevel;
  const bowlerLevel = model.profileAvailable === false ? "--" : model.bowler.level;
  const profileAction = inspectable && model.playerId
    ? `<button class="compact-identity-card__profile" type="button" data-public-profile-id="${escapeHtml(model.playerId)}" data-public-profile-name="${escapeHtml(model.profileName)}">View profile</button>`
    : "";
  const cardStyle = ["rivalry", "signature", "elite"].includes(model.presentation?.playerCardId?.split?.(":")?.at?.(-1))
    ? model.presentation.playerCardId.split(":").at(-1)
    : "standard";
  const catchLine = model.catchLine
    ? `<q class="compact-identity-card__catch-line">${escapeHtml(model.catchLine)}</q>`
    : "";
  return `<article class="compact-identity-card is-card-${escapeHtml(cardStyle)}${local ? " is-you" : ""}${connected ? "" : " is-disconnected"}">
    <img class="compact-identity-card__art" src="${escapeHtml(model.profileIconArt || model.bowler.art)}" alt="${escapeHtml(model.profileIconArt ? `${model.bowler.name} profile icon` : `${model.bowler.name} in the ${model.bowler.skinName} outfit`)}">
    <div class="compact-identity-card__copy">
      <small>${escapeHtml(status)}</small>
      <strong>${escapeHtml(model.profileName)}</strong>
      <span>${escapeHtml(`${model.title} · ${model.badge}`)}</span>
      ${catchLine}
      <dl><div><dt>Player</dt><dd>${escapeHtml(`Player Lv. ${playerLevel}`)}</dd></div><div><dt>Match bowler</dt><dd>${escapeHtml(`${model.bowler.name} · Lv. ${bowlerLevel}`)}</dd></div></dl>
      ${profileAction}
    </div>
  </article>`;
}
