// Ranked Profile — the menu-opened overlay showing the player's ranked identity
// (factory pilot name + optional Tactical-Arena-only custom ranked name), their
// ELO rating, rank tier, and W/L/D record. Read-only against the server standing
// endpoint; the custom name is edited/persisted locally (rankedNameModel.js) and
// only takes effect for ranked play. Structurally mirrors nicknameGallery.js.
import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import {
  isFactoryAccountLoggedIn,
  readStoredFactoryAccountSession,
  createFactoryAccountSignInUrl,
} from "../platform/factoryAccount.js";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";
import {
  RANKED_NAME_MAX_LENGTH,
  loadRankedName,
  saveRankedName,
  resolveRankedDisplayName,
} from "./rankedNameModel.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ranked-profile-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

function pilotName() {
  try {
    return createOnlineIdentityPayload(loadFactoryProfile()).displayName || "";
  } catch {
    return "";
  }
}

function formatRecord(standing) {
  const w = standing?.wins ?? 0;
  const l = standing?.losses ?? 0;
  const d = standing?.draws ?? 0;
  const total = w + l + d;
  const rate = total > 0 ? ` · ${Math.round((w / total) * 100)}% win rate` : "";
  return `${w}W / ${l}L / ${d}D${rate}`;
}

export function openRankedProfile() {
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card ranked-profile-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Ranked Profile"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  head.appendChild(el("p", "ranked-profile-sub", "Your Tactical Arena ranked standing and display name."));
  card.appendChild(head);

  const body = el("div", "ranked-profile-body");
  card.appendChild(body);

  renderIdentity(body);
  renderStanding(body);

  function close() {
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }
  function onOverlay(event) {
    if (event.target === overlay) close();
  }
  function onKey(event) {
    if (event.key === "Escape") close();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
}

function renderIdentity(body) {
  const pilot = pilotName();
  const section = el("section", "ranked-profile-identity");

  const pilotRow = el("div", "ranked-profile-pilot");
  pilotRow.appendChild(el("span", "ranked-profile-label", "Pilot"));
  pilotRow.appendChild(el("b", "ranked-profile-pilot-name", pilot || "Guest"));
  section.appendChild(pilotRow);

  const nameField = el("div", "ranked-profile-namefield");
  nameField.appendChild(el("label", "ranked-profile-label", "Ranked name (optional)"));

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ranked-profile-input";
  input.maxLength = RANKED_NAME_MAX_LENGTH;
  input.placeholder = pilot || "Commander";
  input.value = loadRankedName();
  input.setAttribute("aria-label", "Custom ranked name");

  const preview = el("p", "ranked-profile-nameprev");
  const refreshPreview = () => {
    preview.textContent = `Opponents see: ${resolveRankedDisplayName({ customName: input.value, pilotName: pilot })}`;
  };
  const commit = () => {
    const saved = saveRankedName(input.value);
    input.value = saved;
    refreshPreview();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("input", refreshPreview);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { commit(); input.blur(); }
  });

  const clearBtn = el("button", "ranked-profile-clear", "Clear");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", () => { input.value = ""; commit(); });

  const fieldRow = el("div", "ranked-profile-fieldrow");
  fieldRow.append(input, clearBtn);
  nameField.append(fieldRow, preview);
  section.appendChild(nameField);
  refreshPreview();

  body.appendChild(section);
}

function renderStanding(body) {
  const section = el("section", "ranked-profile-standing");
  section.appendChild(el("p", "ranked-profile-standing-loading", "Loading rating…"));
  body.appendChild(section);

  const account = readStoredFactoryAccountSession();
  if (!isFactoryAccountLoggedIn(account)) {
    section.replaceChildren();
    const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to play ranked and track your rating.");
    const link = document.createElement("a");
    link.className = "ranked-profile-signin-link menu-btn";
    link.textContent = "Sign In";
    try { link.href = createFactoryAccountSignInUrl(); } catch { link.href = "#"; }
    section.append(notice, link);
    return;
  }

  const apiClient = createPlatformApiClient();
  if (!apiClient?.isConfigured || typeof apiClient.fetchRankedStanding !== "function") {
    section.replaceChildren(el("p", "ranked-profile-standing-error", "Ranked service is unavailable right now."));
    return;
  }

  apiClient.fetchRankedStanding(TACTICAL_ARENA_GAME_SLUG)
    .then((standing) => {
      if (!standing) {
        section.replaceChildren(el("p", "ranked-profile-standing-error", "Could not load your rating. Play a ranked match to get started."));
        return;
      }
      section.replaceChildren();
      const tierId = standing.tier?.id || "bronze";
      const tierBadge = el("div", `ranked-profile-tier ranked-tier-${tierId}`, standing.tier?.label || "Bronze");
      const ratingBlock = el("div", "ranked-profile-rating-block");
      ratingBlock.appendChild(el("span", "ranked-profile-rating-num", String(standing.rating ?? 1200)));
      ratingBlock.appendChild(el("span", "ranked-profile-rating-label", "RATING"));
      const record = el("p", "ranked-profile-record", formatRecord(standing));
      section.append(tierBadge, ratingBlock, record);

      if (standing.activeMatch) {
        section.appendChild(el("p", "ranked-profile-activematch", "You have a ranked match in progress."));
      }
    })
    .catch(() => {
      section.replaceChildren(el("p", "ranked-profile-standing-error", "Could not load your rating."));
    });
}
