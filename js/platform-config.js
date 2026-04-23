(function applyPlatformApiConfig(root) {
  if (!root || typeof root !== "object") {
    return;
  }

  // Fill this in with the Railway API URL after deployment, for example:
  // root.__JGF_PLATFORM_API_URL__ = "https://your-platform-api.up.railway.app";
  root.__JGF_PLATFORM_API_URL__ = root.__JGF_PLATFORM_API_URL__ || "";
}(globalThis));
