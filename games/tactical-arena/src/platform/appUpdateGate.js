// "This build is too old to play" — the boot-time version gate for the packaged app.
//
// Trust model, and the reason this file is so defensive: blocking is the DESTRUCTIVE
// outcome here. A false positive locks a paying player out of a game they own, offline,
// with no way to argue. So every uncertain input resolves to "let them play":
//
//   - not running inside the packaged app          -> never blocks (the web is always current)
//   - the native bridge cannot report a build      -> never blocks
//   - the API is unreachable, slow, or errors      -> never blocks
//   - the server reports no minimum (0)            -> never blocks
//
// The ONLY path that blocks is an affirmative answer: we know our own version code, the
// server named a minimum, and ours is below it.
//
// All I/O is injected so the decision is testable without a device, a store, or a network.

import { isNativeApp } from "./factorySignIn.js";

export const UPDATE_CHECK_TIMEOUT_MS = 4000;

// `App.getInfo()` reports Android's versionCode as `build` (a string). iOS would report a
// build string too; parse defensively and treat anything non-numeric as unknown.
export function parseInstalledVersionCode(info) {
  const raw = info?.build ?? info?.versionCode ?? null;
  if (raw === null || raw === undefined) return null;
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function readInstalledInfo(root) {
  const bridge = root?.Capacitor?.Plugins?.App;
  if (!bridge || typeof bridge.getInfo !== "function") return null;
  try {
    return await bridge.getInfo();
  } catch {
    return null;
  }
}

// A version check must never hold the boot sequence open. If the network is slow the player
// gets into the game and we simply do not gate this session.
async function fetchReleasePolicy({ fetchImpl, baseUrl, appId, platform, timeoutMs }) {
  if (typeof fetchImpl !== "function" || !baseUrl || !appId) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const query = `app=${encodeURIComponent(appId)}&platform=${encodeURIComponent(platform)}`;
    const response = await fetchImpl(`${baseUrl}/app-version?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response?.ok) return null;
    const payload = await response.json();
    return payload?.release ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The pure decision, split out so the policy is testable on its own.
export function decideUpdateRequirement({ installedVersionCode, release }) {
  const minimum = Number.isInteger(release?.minimumVersionCode) ? release.minimumVersionCode : 0;
  if (!Number.isInteger(installedVersionCode) || minimum <= 0) {
    return { blocked: false, installedVersionCode, minimumVersionCode: minimum };
  }
  return {
    blocked: installedVersionCode < minimum,
    installedVersionCode,
    minimumVersionCode: minimum,
    latestVersionCode: release?.latestVersionCode ?? minimum,
    storeUrl: release?.storeUrl ?? "",
    updateUrl: release?.updateUrl ?? release?.storeUrl ?? "",
  };
}

export async function checkForRequiredUpdate({
  root = globalThis,
  fetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null,
  baseUrl = "",
  appId = "",
  platform = "android",
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  packaged = null,
} = {}) {
  const inApp = packaged === null ? isNativeApp(root) : packaged;
  if (!inApp) return { blocked: false, reason: "not_packaged" };

  const info = await readInstalledInfo(root);
  const installedVersionCode = parseInstalledVersionCode(info);
  if (installedVersionCode === null) return { blocked: false, reason: "unknown_build" };

  const resolvedAppId = appId || info?.id || "";
  const release = await fetchReleasePolicy({
    fetchImpl,
    baseUrl,
    appId: resolvedAppId,
    platform,
    timeoutMs,
  });
  if (!release) return { blocked: false, reason: "no_policy", installedVersionCode };

  return decideUpdateRequirement({ installedVersionCode, release });
}

// Hands the player off to the store listing. `market://` opens the Play app directly; the
// https listing is the fallback for a device with no Play handler. Never throws — a failed
// hand-off leaves the overlay up so the player can try again.
export function openStoreListing({ root = globalThis, updateUrl = "", storeUrl = "" } = {}) {
  const targets = [updateUrl, storeUrl].filter(Boolean);
  for (const target of targets) {
    try {
      const opened = root?.open?.(target, "_system");
      if (opened !== null && opened !== undefined) return true;
    } catch {
      // try the next target
    }
    try {
      if (root?.location) {
        root.location.href = target;
        return true;
      }
    } catch {
      // try the next target
    }
  }
  return false;
}
