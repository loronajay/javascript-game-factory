import {
  getStoredAuthToken,
  handleUnauthorizedResponse,
} from "../../../js/platform/api/auth-token.mjs";
import { applyProgressionDocument } from "../state/progression-snapshot.mjs";

const GAME_SLUG = "yam-bowling";

async function readJson(response) {
  try {
    return await response?.json?.();
  } catch {
    return null;
  }
}

export function createProfileSyncClient({
  platformApi,
  playerId,
  loadout,
  progressionCore = null,
  progressionStore = null,
  applyProgression = applyProgressionDocument,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  getAuthToken = getStoredAuthToken,
  onUnauthorized = handleUnauthorizedResponse,
  onSnapshotApplied = () => {},
}) {
  let state = { status: "idle", error: "", progressionStatus: "unavailable" };

  function setState(status, error = "", progressionStatus = state.progressionStatus) {
    state = { status, error, progressionStatus };
  }

  async function garageRequest(method = "GET", garage = null) {
    const token = getAuthToken();
    if (typeof fetchImpl !== "function" || !token) return null;
    const options = {
      method,
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
    };
    if (method === "PUT") {
      options.headers["content-type"] = "application/json; charset=utf-8";
      options.body = JSON.stringify({ garage });
    }
    try {
      const response = await fetchImpl(`${platformApi?.baseUrl || ""}/games/${GAME_SLUG}/garage`, options);
      if (!response?.ok) {
        if (response?.status === 401) onUnauthorized();
        return null;
      }
      return readJson(response);
    } catch {
      return null;
    }
  }

  async function sync() {
    setState("syncing", "", "syncing");
    const [garageResult, gameProgress, progressionDocument] = await Promise.all([
      garageRequest("GET"),
      platformApi?.fetchGameProgress?.(GAME_SLUG)?.catch?.(() => null) ?? null,
      platformApi?.getGameProgression?.(GAME_SLUG, playerId)?.catch?.(() => null) ?? null,
    ]);
    if (!garageResult?.garage || !gameProgress?.entitlements) {
      setState("error", "sync_failed", "unavailable");
      return false;
    }
    loadout.applyServerEntitlements(gameProgress.entitlements);
    if (!loadout.applyServerGarage(garageResult.garage)) {
      setState("error", "sync_failed", "unavailable");
      return false;
    }
    let progressionStatus = "unavailable";
    if (progressionDocument && progressionCore && progressionStore) {
      progressionStatus = applyProgression({ progressionCore, store: progressionStore, document: progressionDocument })
        ? "ready"
        : "unavailable";
    }
    onSnapshotApplied();
    setState("ready", "", progressionStatus);
    return true;
  }

  async function save() {
    setState("saving");
    const result = await garageRequest("PUT", loadout.exportGarage());
    if (!result?.ok || !result.garage || !loadout.applyServerGarage(result.garage)) {
      setState("error", "save_failed");
      return false;
    }
    onSnapshotApplied();
    setState("ready");
    return true;
  }

  return {
    getState: () => ({ ...state }),
    save,
    sync,
  };
}
