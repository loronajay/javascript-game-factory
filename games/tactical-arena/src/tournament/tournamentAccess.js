export const TOURNAMENT_ACCESS_SESSION_KEY = "tacticalArenaTournamentAccessV1";
export const TOURNAMENT_PLAYER_NAME_SESSION_KEY = "tacticalArenaTournamentPlayerNameV1";
export const TOURNAMENT_ACCESS_CHANGED_EVENT = "tactical-arena:tournament-access-changed";
export const TOURNAMENT_ACCESS_ROLE_ORGANIZER = "organizer";
export const TOURNAMENT_ACCESS_ROLE_PLAYER = "player";

// SHA-256 of the organizer code. Keeping only the digest avoids shipping the usable
// code as plain text. This is a lightweight event gate, not server authentication:
// tournament mode grants no durable entitlement and never enters Ranked.
export const TOURNAMENT_ACCESS_CODE_SHA256 = "2cb38ed9a9e436508bcc9dc9baac0450cbc0dbd9fdd741351c79b970846cbe04";
export const TOURNAMENT_PLAYER_ACCESS_CODE_SHA256 = "d9e61220924753bd744c74fb61ea5e24ffb57143b794f5f747ec7a4c025df1cd";

import {
  clearTournamentPlayerAssignment,
  parseTournamentPlayerAssignment,
  saveTournamentPlayerAssignment,
} from "./tournamentAssignments.js";

function defaultSessionStorage() {
  return globalThis.sessionStorage;
}

function cleanCode(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sameText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "";
  const bytes = new TextEncoder().encode(String(value));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyTournamentAccessCode(code, {
  digest = sha256Hex,
  expectedHash = TOURNAMENT_ACCESS_CODE_SHA256,
} = {}) {
  const cleaned = cleanCode(code);
  if (!cleaned || !expectedHash) return false;
  return sameText(await digest(cleaned), expectedHash);
}

function announceAccessChange(target = globalThis.document ?? globalThis) {
  try {
    target?.dispatchEvent?.(new CustomEvent(TOURNAMENT_ACCESS_CHANGED_EVENT));
  } catch {
    // Tests and older embedded webviews may not expose CustomEvent.
  }
}

export function isTournamentAccessActive(storage = defaultSessionStorage()) {
  try {
    return ["active", TOURNAMENT_ACCESS_ROLE_ORGANIZER, TOURNAMENT_ACCESS_ROLE_PLAYER]
      .includes(storage?.getItem?.(TOURNAMENT_ACCESS_SESSION_KEY));
  } catch {
    return false;
  }
}

export function isTournamentOrganizer(storage = defaultSessionStorage()) {
  try {
    return storage?.getItem?.(TOURNAMENT_ACCESS_SESSION_KEY) === TOURNAMENT_ACCESS_ROLE_ORGANIZER;
  } catch {
    return false;
  }
}

export async function activateTournamentAccess(code, {
  storage = defaultSessionStorage(),
  digest = sha256Hex,
  expectedHash = TOURNAMENT_ACCESS_CODE_SHA256,
  notifyTarget = globalThis.document ?? globalThis,
  role = TOURNAMENT_ACCESS_ROLE_ORGANIZER,
} = {}) {
  const accepted = await verifyTournamentAccessCode(code, { digest, expectedHash });
  if (!accepted) return { activated: false, errorCode: "INVALID_TOURNAMENT_CODE" };
  try {
    storage?.setItem?.(TOURNAMENT_ACCESS_SESSION_KEY, role);
  } catch {
    return { activated: false, errorCode: "TOURNAMENT_STORAGE_UNAVAILABLE" };
  }
  announceAccessChange(notifyTarget);
  return { activated: true, role };
}

export function deactivateTournamentAccess({
  storage = defaultSessionStorage(),
  notifyTarget = globalThis.document ?? globalThis,
} = {}) {
  try {
    storage?.removeItem?.(TOURNAMENT_ACCESS_SESSION_KEY);
    storage?.removeItem?.(TOURNAMENT_PLAYER_NAME_SESSION_KEY);
    clearTournamentPlayerAssignment(storage);
  } catch {
    // Best effort: a failed session-store clear must not affect account progress.
  }
  announceAccessChange(notifyTarget);
  return { activated: false };
}

export function sanitizeTournamentPlayerName(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 18).trim() : "";
}

export function readTournamentPlayerName(storage = defaultSessionStorage()) {
  try {
    return sanitizeTournamentPlayerName(storage?.getItem?.(TOURNAMENT_PLAYER_NAME_SESSION_KEY));
  } catch {
    return "";
  }
}

export function saveTournamentPlayerName(value, storage = defaultSessionStorage()) {
  const cleaned = sanitizeTournamentPlayerName(value);
  try {
    if (cleaned) storage?.setItem?.(TOURNAMENT_PLAYER_NAME_SESSION_KEY, cleaned);
    else storage?.removeItem?.(TOURNAMENT_PLAYER_NAME_SESSION_KEY);
  } catch {
    // The name remains usable for the current input even if storage is blocked.
  }
  return cleaned;
}

function tournamentCodeFromUrl(url) {
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const fragmentParams = new URLSearchParams(fragment);
  return cleanCode(fragmentParams.get("tournament"));
}

export async function activateTournamentAccessFromUrl({
  location = globalThis.location,
  history = globalThis.history,
  storage = defaultSessionStorage(),
  digest = sha256Hex,
  expectedHash = TOURNAMENT_ACCESS_CODE_SHA256,
  playerExpectedHash = TOURNAMENT_PLAYER_ACCESS_CODE_SHA256,
  notifyTarget = globalThis.document ?? globalThis,
} = {}) {
  if (!location?.href) return { activated: false, ignored: true };
  let url;
  try {
    url = new URL(location.href);
  } catch {
    return { activated: false, ignored: true };
  }
  const code = tournamentCodeFromUrl(url);
  if (!code) return { activated: false, ignored: true };

  // Fragments are never sent to the host. Remove the organizer code from the visible
  // URL immediately after reading it so screenshots and copied URLs do not expose it.
  try {
    history?.replaceState?.(null, "", `${url.pathname}${url.search}`);
  } catch {
    // Activation can continue in embedded browsers that restrict history mutation.
  }

  if (await verifyTournamentAccessCode(code, { digest, expectedHash })) {
    return activateTournamentAccess(code, {
      storage, digest, expectedHash, notifyTarget,
      role: TOURNAMENT_ACCESS_ROLE_ORGANIZER,
    });
  }

  const assignment = parseTournamentPlayerAssignment(url.href);
  if (!assignment || !(await verifyTournamentAccessCode(code, { digest, expectedHash: playerExpectedHash }))) {
    return { activated: false, errorCode: "INVALID_TOURNAMENT_CODE" };
  }

  // Store the fixture before announcing access so every UI listener observes the
  // assigned player/match atomically with the role change.
  try {
    storage?.setItem?.(TOURNAMENT_ACCESS_SESSION_KEY, TOURNAMENT_ACCESS_ROLE_PLAYER);
    saveTournamentPlayerAssignment(assignment, storage);
    saveTournamentPlayerName(assignment.player, storage);
  } catch {
    return { activated: false, errorCode: "TOURNAMENT_STORAGE_UNAVAILABLE" };
  }
  announceAccessChange(notifyTarget);
  return { activated: true, role: TOURNAMENT_ACCESS_ROLE_PLAYER, assignment };
}
