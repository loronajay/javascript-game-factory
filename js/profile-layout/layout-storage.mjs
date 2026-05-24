import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { normalizeLayout } from "./normalize-layout.mjs?v=20260524-profile-rollback-2";

// Returns saved layout JSON or null if none exists / route not yet implemented.
export async function fetchLayout(apiClient = createPlatformApiClient()) {
  try {
    const layout = await apiClient.fetchMyLayout();
    return layout ?? null;
  } catch {
    return null;
  }
}

// Saves layout JSON. Throws on failure. Returns the server-normalized layout.
export async function saveLayout(layout, apiClient = createPlatformApiClient()) {
  const saved = await apiClient.saveMyLayout(normalizeLayout(layout));
  if (!saved) throw new Error("Failed to save layout");
  return saved;
}
