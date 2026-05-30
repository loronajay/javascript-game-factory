import { createPlatformApiClient, type PlatformApiClient } from "../platform/api/platform-api.mjs";
import { normalizeLayout } from "./normalize-layout.mjs";

// Returns saved layout JSON or null if none exists / route not yet implemented.
export async function fetchLayout(apiClient: PlatformApiClient = createPlatformApiClient()): Promise<any> {
  try {
    const layout = await apiClient.fetchMyLayout();
    return layout ?? null;
  } catch {
    return null;
  }
}

// Saves layout JSON. Throws on failure. Returns the server-normalized layout.
export async function saveLayout(layout: unknown, apiClient: PlatformApiClient = createPlatformApiClient()): Promise<any> {
  const saved = await apiClient.saveMyLayout(normalizeLayout(layout));
  if (!saved) throw new Error("Failed to save layout");
  return saved;
}
