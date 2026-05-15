import { createPlatformApiClient } from "../platform/api/platform-api.mjs";

const BASE_PATH = "/profile/layout";

// Returns saved layout JSON or null if none exists / route not yet implemented.
export async function fetchLayout(apiClient = createPlatformApiClient()) {
  try {
    const res = await apiClient.get(BASE_PATH);
    return res?.layout ?? null;
  } catch {
    return null;
  }
}

// Saves layout JSON. Throws on failure. Returns the server-normalized layout.
export async function saveLayout(layout, apiClient = createPlatformApiClient()) {
  const res = await apiClient.post(BASE_PATH, { layout });
  if (!res) throw new Error("Failed to save layout");
  return res.layout ?? layout;
}
