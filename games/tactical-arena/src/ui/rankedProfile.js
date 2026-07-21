// Ranked Profile — the menu-opened overlay showing the player's ranked identity
// (factory pilot name + a server-backed ranked TITLE and AVATAR), their ELO rating,
// rank tier, and W/L/D record.
//
// Phase 1 of RANKED_FEATURE_PLAN.md: the ranked identity is now server-authoritative
// (keyed on factory playerId + game slug via the ranked_profiles table). The old
// local-only "ranked name" is retired as a source of truth — it survives only as a
// synchronous local cache that the in-match name override (onlineFlow.js) still reads,
// and as the one-time seed migrated up into the server title on first open. The
// title/avatar are cosmetic and never enter the authoritative online state hash.
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
import { loadRankedName, saveRankedName } from "./rankedNameModel.js";
import { readUnlockProgress } from "../progression/unlocks.js";
import { getUnitSkins } from "./skinModel.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { openRankedLeaderboard } from "./rankedLeaderboard.js";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";

// Matches the server-side RANKED_TITLE_MAX_LENGTH in platform-api/src/db/ranked.mts.
const RANKED_TITLE_MAX_LENGTH = 60;

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

function unitLabel(type) {
  return UNIT_TYPES[type]?.name ?? type;
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
  head.appendChild(el("p", "ranked-profile-sub", "Your Tactical Arena ranked standing, title, and avatar."));

  const leaderboardBtn = el("button", "ranked-profile-leaderboard-btn menu-btn ghost", "View Leaderboard");
  leaderboardBtn.type = "button";
  leaderboardBtn.addEventListener("click", () => openRankedLeaderboard());
  head.appendChild(leaderboardBtn);
  card.appendChild(head);

  const body = el("div", "ranked-profile-body");
  card.appendChild(body);

  populate(body);

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

function populate(body) {
  const pilot = pilotName();

  const account = readStoredFactoryAccountSession();
  const apiClient = createPlatformApiClient();

  // A signed-out player gets the sign-in prompt; a signed-in player whose platform
  // client isn't reachable gets a clear "unavailable" — never a misleading "sign in".
  if (!isFactoryAccountLoggedIn(account)) {
    renderSignedOut(body, pilot);
    return;
  }
  const serviceReady = apiClient?.isConfigured
    && typeof apiClient.fetchRankedStanding === "function"
    && typeof apiClient.saveRankedProfile === "function";
  if (!serviceReady) {
    renderServiceUnavailable(body, pilot);
    return;
  }

  const loading = el("section", "ranked-profile-standing");
  loading.appendChild(el("p", "ranked-profile-standing-loading", "Loading ranked profile…"));
  body.appendChild(loading);

  apiClient.fetchRankedStanding(TACTICAL_ARENA_GAME_SLUG)
    .then((standing) => {
      body.replaceChildren();
      renderSignedIn(body, { pilot, standing: standing || null, apiClient });
    })
    .catch(() => {
      body.replaceChildren();
      const err = el("section", "ranked-profile-standing");
      err.appendChild(el("p", "ranked-profile-standing-error", "Could not load your ranked profile. Try again."));
      body.appendChild(err);
    });
}

function renderSignedOut(body, pilot) {
  const section = el("section", "ranked-profile-identity");
  const pilotRow = el("div", "ranked-profile-pilot");
  pilotRow.appendChild(el("span", "ranked-profile-label", "Pilot"));
  pilotRow.appendChild(el("b", "ranked-profile-pilot-name", pilot || "Guest"));
  section.appendChild(pilotRow);
  body.appendChild(section);

  const standing = el("section", "ranked-profile-standing");
  const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to set your ranked title and avatar and track your rating.");
  const link = document.createElement("a");
  link.className = "ranked-profile-signin-link menu-btn";
  link.textContent = "Sign In";
  try { link.href = createFactoryAccountSignInUrl(); } catch { link.href = "#"; }
  standing.append(notice, link);
  body.appendChild(standing);
}

function renderServiceUnavailable(body, pilot) {
  const section = el("section", "ranked-profile-identity");
  const pilotRow = el("div", "ranked-profile-pilot");
  pilotRow.appendChild(el("span", "ranked-profile-label", "Pilot"));
  pilotRow.appendChild(el("b", "ranked-profile-pilot-name", pilot || "Guest"));
  section.appendChild(pilotRow);
  body.appendChild(section);

  const standing = el("section", "ranked-profile-standing");
  standing.appendChild(el("p", "ranked-profile-standing-error", "Ranked service is unavailable right now. Try again in a moment."));
  body.appendChild(standing);
}

function renderSignedIn(body, { pilot, standing, apiClient }) {
  // Editable ranked identity is seeded from the server standing, then migrated once
  // from any legacy local name so a returning player keeps their chosen text.
  const state = {
    title: standing?.title || "",
    avatarUnit: standing?.avatarUnit || null,
    avatarSkin: standing?.avatarSkin || null,
  };
  maybeMigrateLegacyName(state, apiClient);
  // Keep the synchronous in-match cache aligned with the authoritative title.
  saveRankedName(state.title || "");

  renderIdentityEditor(body, { pilot, state, apiClient });
  renderStanding(body, standing, { title: state.title || pilot || "Commander" });
  if (standing?.playerId) {
    renderMetaSections(body, { apiClient, playerId: standing.playerId });
  }
}

// Per-unit ranked record + recent match history, fetched for the signed-in player and
// filled in once loaded. Both are public reads keyed on the player's id.
function renderMetaSections(body, { apiClient, playerId }) {
  const units = el("section", "ranked-profile-units");
  units.appendChild(el("h3", "ranked-profile-section-title", "Unit Record"));
  const unitsBody = el("div", "ranked-profile-units-body");
  unitsBody.appendChild(el("p", "ranked-profile-meta-loading", "Loading unit stats…"));
  units.appendChild(unitsBody);
  body.appendChild(units);

  const matches = el("section", "ranked-profile-matches");
  matches.appendChild(el("h3", "ranked-profile-section-title", "Recent Matches"));
  const matchesBody = el("div", "ranked-profile-matches-body");
  matchesBody.appendChild(el("p", "ranked-profile-meta-loading", "Loading match history…"));
  matches.appendChild(matchesBody);
  body.appendChild(matches);

  if (typeof apiClient.fetchRankedUnitStats === "function") {
    apiClient.fetchRankedUnitStats(TACTICAL_ARENA_GAME_SLUG, playerId)
      .then((stats) => renderUnitStats(unitsBody, stats?.units || []))
      .catch(() => renderUnitStats(unitsBody, []));
  } else {
    renderUnitStats(unitsBody, []);
  }

  if (typeof apiClient.fetchRankedMatches === "function") {
    apiClient.fetchRankedMatches(TACTICAL_ARENA_GAME_SLUG, playerId)
      .then((res) => renderMatchHistory(matchesBody, res?.matches || []))
      .catch(() => renderMatchHistory(matchesBody, []));
  } else {
    renderMatchHistory(matchesBody, []);
  }
}

function renderUnitStats(container, units) {
  container.replaceChildren();
  if (!units.length) {
    container.appendChild(el("p", "ranked-profile-meta-empty", "No ranked unit records yet."));
    return;
  }
  const grid = el("div", "ranked-profile-unitgrid");
  for (const u of units) {
    const cell = el("div", "ranked-profile-unitcell");
    if (hasPortrait(u.unitType)) {
      cell.appendChild(createPortrait(u.unitType, { variant: "is-thumb" }));
    }
    const info = el("div", "ranked-profile-unitinfo");
    info.appendChild(el("span", "ranked-profile-unitname", unitLabel(u.unitType)));
    const winPct = u.games > 0 ? Math.round((u.wins / u.games) * 100) : 0;
    info.appendChild(el("span", "ranked-profile-unitstat", `${u.games}G · ${winPct}% W · ${u.survivals} survived`));
    cell.appendChild(info);
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}

function renderMatchHistory(container, matches) {
  container.replaceChildren();
  if (!matches.length) {
    container.appendChild(el("p", "ranked-profile-meta-empty", "No ranked matches yet."));
    return;
  }
  const list = el("ul", "ranked-profile-matchlist");
  for (const m of matches) {
    const item = el("li", `ranked-profile-matchrow is-${m.outcome}`);
    const outcomeLabel = m.outcome === "win" ? "W" : m.outcome === "loss" ? "L" : "D";
    item.appendChild(el("span", "ranked-profile-matchoutcome", outcomeLabel));
    const delta = Number(m.ratingDelta) || 0;
    const deltaText = delta > 0 ? `+${delta}` : String(delta);
    item.appendChild(el("span", "ranked-profile-matchdelta", deltaText));
    const squads = el("span", "ranked-profile-matchsquads", formatSquadLine(m.mySquad, m.opponentSquad));
    item.appendChild(squads);
    item.appendChild(el("span", "ranked-profile-matchdate", formatMatchDate(m.resolvedAt)));
    list.appendChild(item);
  }
  container.appendChild(list);
}

function formatSquadLine(mySquad, opponentSquad) {
  const mine = (mySquad || []).map(unitLabel).join(", ") || "—";
  const theirs = (opponentSquad || []).map(unitLabel).join(", ") || "—";
  return `${mine} vs ${theirs}`;
}

function formatMatchDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// One-time seed: if the player has no server title yet but set a local ranked name
// under the old model, push it up as their title. Fire-and-forget — the field renders
// with the migrated value immediately regardless of the network round-trip.
function maybeMigrateLegacyName(state, apiClient) {
  if (state.title) return;
  const legacy = loadRankedName();
  if (!legacy) return;
  state.title = legacy.slice(0, RANKED_TITLE_MAX_LENGTH);
  apiClient.saveRankedProfile(TACTICAL_ARENA_GAME_SLUG, { title: state.title }).catch(() => {});
}

function renderIdentityEditor(body, { pilot, state, apiClient }) {
  const section = el("section", "ranked-profile-identity");

  const pilotRow = el("div", "ranked-profile-pilot");
  pilotRow.appendChild(el("span", "ranked-profile-label", "Pilot"));
  pilotRow.appendChild(el("b", "ranked-profile-pilot-name", pilot || "Guest"));
  section.appendChild(pilotRow);

  const status = el("p", "ranked-profile-savestate", "");
  const flashSaved = (text = "Saved") => {
    status.textContent = text;
    status.dataset.state = "ok";
  };
  const flashError = () => {
    status.textContent = "Couldn't save — check your connection.";
    status.dataset.state = "err";
  };
  // Persist a patch, reconcile local state from the authoritative response.
  const save = (patch) =>
    apiClient.saveRankedProfile(TACTICAL_ARENA_GAME_SLUG, patch)
      .then((profile) => {
        if (!profile) { flashError(); return; }
        state.title = profile.title || "";
        state.avatarUnit = profile.avatarUnit || null;
        state.avatarSkin = profile.avatarSkin || null;
        saveRankedName(state.title || "");
        flashSaved();
      })
      .catch(flashError);

  // --- Title field ---
  const titleField = el("div", "ranked-profile-namefield");
  titleField.appendChild(el("label", "ranked-profile-label", "Ranked title"));

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ranked-profile-input";
  input.maxLength = RANKED_TITLE_MAX_LENGTH;
  input.placeholder = pilot || "Commander";
  input.value = state.title;
  input.setAttribute("aria-label", "Ranked title");

  const preview = el("p", "ranked-profile-nameprev");
  const refreshPreview = () => {
    const shown = input.value.trim() || pilot || "Commander";
    preview.textContent = `Opponents see: ${shown}`;
  };
  const commitTitle = () => {
    const next = input.value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
    if (next === state.title) return;
    input.value = next;
    refreshPreview();
    save({ title: next || null });
  };
  input.addEventListener("input", refreshPreview);
  input.addEventListener("blur", commitTitle);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { commitTitle(); input.blur(); }
  });

  const clearBtn = el("button", "ranked-profile-clear", "Clear");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", () => { input.value = ""; commitTitle(); });

  const fieldRow = el("div", "ranked-profile-fieldrow");
  fieldRow.append(input, clearBtn);
  titleField.append(fieldRow, preview);
  section.appendChild(titleField);
  refreshPreview();

  // --- Avatar picker ---
  section.appendChild(renderAvatarField(state, save));

  section.appendChild(status);
  body.appendChild(section);
}

// Avatar picker: choose from owned units and their owned skins. Ownership is
// client-gated (v1) — the grid only ever lists what the player already owns. Selecting
// a unit persists it; the base portrait is used unless the unit has an owned skin the
// player then picks.
function renderAvatarField(state, save) {
  const field = el("div", "ranked-profile-avatarfield");
  field.appendChild(el("label", "ranked-profile-label", "Ranked avatar"));

  const preview = el("div", "ranked-profile-avatar-preview");
  const grid = el("div", "ranked-profile-avatar-grid");
  const skinRow = el("div", "ranked-profile-avatar-skins");

  const owned = ownedAvatarUnits();

  const renderPreview = () => {
    preview.replaceChildren();
    if (state.avatarUnit && hasPortrait(state.avatarUnit)) {
      preview.appendChild(createPortrait(state.avatarUnit, { variant: "is-thumb", skin: state.avatarSkin, eager: true }));
      preview.appendChild(el("span", "ranked-profile-avatar-name", unitLabel(state.avatarUnit)));
    } else {
      preview.appendChild(el("span", "ranked-profile-avatar-none", "No avatar set"));
    }
  };

  const renderSkins = () => {
    skinRow.replaceChildren();
    if (!state.avatarUnit) return;
    const skins = ownedSkinsFor(state.avatarUnit);
    if (!skins.length) return; // no owned skins → base only, nothing to choose
    const options = [{ slug: null, label: "Base" }, ...skins];
    for (const opt of options) {
      const selected = (state.avatarSkin || null) === (opt.slug || null);
      const chip = el("button", `ranked-profile-skinchip${selected ? " is-selected" : ""}`, opt.label);
      chip.type = "button";
      chip.addEventListener("click", () => {
        state.avatarSkin = opt.slug || null;
        save({ avatarSkin: state.avatarSkin });
        renderPreview();
        renderSkins();
      });
      skinRow.appendChild(chip);
    }
  };

  const renderGrid = () => {
    grid.replaceChildren();

    const noneTile = el("button", `ranked-profile-avatar-tile is-none${state.avatarUnit ? "" : " is-selected"}`, "None");
    noneTile.type = "button";
    noneTile.addEventListener("click", () => {
      state.avatarUnit = null;
      state.avatarSkin = null;
      save({ avatarUnit: null });
      renderPreview();
      renderSkins();
      renderGrid();
    });
    grid.appendChild(noneTile);

    for (const type of owned) {
      const selected = state.avatarUnit === type;
      const tile = el("button", `ranked-profile-avatar-tile${selected ? " is-selected" : ""}`);
      tile.type = "button";
      tile.title = unitLabel(type);
      tile.setAttribute("aria-label", unitLabel(type));
      tile.appendChild(createPortrait(type, { variant: "is-thumb" }));
      tile.addEventListener("click", () => {
        state.avatarUnit = type;
        state.avatarSkin = null;
        save({ avatarUnit: type, avatarSkin: null });
        renderPreview();
        renderSkins();
        renderGrid();
      });
      grid.appendChild(tile);
    }
  };

  renderPreview();
  renderGrid();
  renderSkins();

  field.append(preview, grid, skinRow);
  return field;
}

// Owned units that actually have portrait art, so a chosen avatar always renders.
function ownedAvatarUnits() {
  try {
    return (readUnlockProgress().unlockedUnits || []).filter((type) => hasPortrait(type));
  } catch {
    return [];
  }
}

function ownedSkinsFor(type) {
  try {
    return getUnitSkins(type)
      .filter((skin) => skin.unlocked && skin.slug)
      .map((skin) => ({ slug: skin.slug, label: skin.name || skin.label || skin.slug }));
  } catch {
    return [];
  }
}

function renderStanding(body, standing, { title = "" } = {}) {
  const section = el("section", "ranked-profile-standing");
  if (!standing) {
    section.appendChild(el("p", "ranked-profile-standing-error", "No rating yet. Play a ranked match to get started."));
    body.appendChild(section);
    return;
  }
  const tierId = normalizeRankedTierId(standing.tier);
  const tierLabel = standing.tier?.label || "Bronze";
  const rating = String(standing.rating ?? 1200);
  const nameplate = el("div", `ranked-profile-nameplate ranked-tier-${tierId}`);
  nameplate.appendChild(createRankedTierEmblem(standing.tier, { className: "is-profile" }));
  const plateCopy = el("div", "ranked-profile-nameplate-copy");
  plateCopy.appendChild(el("span", "ranked-profile-nameplate-name", title || "Commander"));
  const meta = el("span", "ranked-profile-nameplate-meta");
  meta.appendChild(el("b", `ranked-profile-tier ranked-tier-${tierId}`, tierLabel));
  meta.appendChild(el("span", "ranked-profile-rating-inline", `${rating} rating`));
  plateCopy.appendChild(meta);
  nameplate.appendChild(plateCopy);
  const record = el("p", "ranked-profile-record", formatRecord(standing));
  section.append(nameplate, record);

  if (standing.activeMatch) {
    section.appendChild(el("p", "ranked-profile-activematch", "You have a ranked match in progress."));
  }
  body.appendChild(section);
}
