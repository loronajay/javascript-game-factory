function sanitizeSingleLine(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBaseUrl(value) {
  return sanitizeSingleLine(value).replace(/\/+$/, "");
}

function isLocalHostname(value) {
  const hostname = sanitizeSingleLine(value).toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "[::1]"
    || hostname === "::1";
}

function encodePathSegment(value) {
  return encodeURIComponent(sanitizeSingleLine(value));
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(fetchImpl, baseUrl, path, options = {}) {
  if (typeof fetchImpl !== "function" || !baseUrl) {
    return null;
  }

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, options);
    if (!response?.ok) {
      return null;
    }
    return await readJsonResponse(response);
  } catch {
    return null;
  }
}

function buildJsonRequestOptions(method, value) {
  return {
    method,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(value ?? {}),
  };
}

export function resolvePlatformApiBaseUrl(options = {}) {
  const root = options?.root ?? globalThis.window;
  const override = sanitizeBaseUrl(
    options?.baseUrl
    || options?.override
    || root?.__JGF_PLATFORM_API_URL__
    || root?.JGF_PLATFORM_API_URL
    || "",
  );

  if (override) {
    return override;
  }

  const location = options?.location || root?.location;
  if (isLocalHostname(location?.hostname)) {
    return "http://127.0.0.1:3001";
  }

  return "";
}

export function createPlatformApiClient(options = {}) {
  const fetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  async function get(path, responseKey) {
    const payload = await requestJson(fetchImpl, baseUrl, path);
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function put(path, value, responseKey) {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("PUT", value),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function post(path, value, responseKey) {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("POST", value),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function del(path, responseKey) {
    const payload = await requestJson(fetchImpl, baseUrl, path, { method: "DELETE" });
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  return {
    baseUrl,
    isConfigured: !!baseUrl && typeof fetchImpl === "function",
    loadPlayerProfile(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/profile`, "player") : Promise.resolve(null);
    },
    savePlayerProfile(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/profile`, patch, "player") : Promise.resolve(null);
    },
    loadPlayerMetrics(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/metrics`, "metrics") : Promise.resolve(null);
    },
    savePlayerMetrics(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/metrics`, patch, "metrics") : Promise.resolve(null);
    },
    loadPlayerRelationships(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/relationships`, "relationships") : Promise.resolve(null);
    },
    savePlayerRelationships(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/relationships`, patch, "relationships") : Promise.resolve(null);
    },
    listActivityItems() {
      return get("/activity", "items");
    },
    saveActivityItem(item = {}) {
      return post("/activity", item, "item");
    },
    listThoughts() {
      return get("/thoughts", "thoughts");
    },
    saveThought(thought = {}) {
      return post("/thoughts", thought, "thought");
    },
    deleteThought(thoughtId) {
      const encoded = encodePathSegment(thoughtId);
      return encoded ? del(`/thoughts/${encoded}`, "deleted") : Promise.resolve(null);
    },
  };
}
