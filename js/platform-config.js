(function applyPlatformApiConfig(root) {
  if (!root || typeof root !== "object") {
    return;
  }

  root.__JGF_PLATFORM_API_URL__ = root.__JGF_PLATFORM_API_URL__ || "https://platform-api-production-3db7.up.railway.app";
}(globalThis));
